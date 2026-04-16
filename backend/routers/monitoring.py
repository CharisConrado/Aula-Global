"""
Aula Global — Router de monitoreo en tiempo real
WebSocket para recibir datos de MediaPipe y enviar acciones de adaptación.
"""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db, SessionLocal
from models.schemas import (
    MonitoringData,
    MonitoringResponse,
    Emocion,
    AccionAdaptacion,
    NivelCrisis,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, decode_token
from services.adaptation_engine import adaptation_engine

router = APIRouter()

# Conexiones activas de WebSocket: {student_id: WebSocket}
active_connections: dict[int, WebSocket] = {}

# Conexiones de tutores observando: {student_id: [WebSocket]}
tutor_connections: dict[int, list[WebSocket]] = {}


class ConnectionManager:
    """Gestiona las conexiones WebSocket de monitoreo."""

    async def connect_student(self, student_id: int, websocket: WebSocket):
        await websocket.accept()
        active_connections[student_id] = websocket

    async def connect_tutor(self, student_id: int, websocket: WebSocket):
        await websocket.accept()
        if student_id not in tutor_connections:
            tutor_connections[student_id] = []
        tutor_connections[student_id].append(websocket)

    def disconnect_student(self, student_id: int):
        active_connections.pop(student_id, None)
        adaptation_engine.clear_state(student_id)

    def disconnect_tutor(self, student_id: int, websocket: WebSocket):
        if student_id in tutor_connections:
            tutor_connections[student_id] = [
                ws for ws in tutor_connections[student_id] if ws != websocket
            ]

    async def notify_tutors(self, student_id: int, data: dict):
        """Envía datos a todos los tutores observando a un estudiante."""
        if student_id in tutor_connections:
            disconnected = []
            for ws in tutor_connections[student_id]:
                try:
                    await ws.send_json(data)
                except Exception:
                    disconnected.append(ws)
            for ws in disconnected:
                tutor_connections[student_id].remove(ws)


manager = ConnectionManager()


@router.websocket("/ws/{student_id}")
async def websocket_monitoreo(websocket: WebSocket, student_id: int):
    """
    WebSocket principal de monitoreo.
    Recibe datos de MediaPipe cada 2 segundos y devuelve acciones de adaptación.

    Mensaje esperado (JSON):
    {
        "session_id": int,
        "student_id": int,
        "emocion": "neutro|feliz|frustrado|ansioso|distraido|estresado|calmado",
        "nivel_atencion": float (0-1),
        "stimming": bool,
        "presion_tactil": float (0-1),
        "velocidad_clics": float
    }
    """
    # Aceptar conexión — la autenticación se valida en el primer mensaje o vía query param
    token = websocket.query_params.get("token")
    if token:
        try:
            decode_token(token)
        except Exception:
            await websocket.close(code=4001, reason="Token inválido")
            return

    await manager.connect_student(student_id, websocket)

    db = SessionLocal()
    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            # Validar datos con Pydantic
            monitoring = MonitoringData(**data)

            # Guardar en base de datos
            db.execute(
                text("""
                    INSERT INTO monitoring (session_id, student_id, emocion, nivel_atencion,
                        stimming, presion_tactil, velocidad_clics, timestamp)
                    VALUES (:session_id, :student_id, :emocion, :nivel_atencion,
                        :stimming, :presion_tactil, :velocidad_clics, NOW())
                """),
                {
                    "session_id": monitoring.session_id,
                    "student_id": monitoring.student_id,
                    "emocion": monitoring.emocion.value,
                    "nivel_atencion": monitoring.nivel_atencion,
                    "stimming": monitoring.stimming,
                    "presion_tactil": monitoring.presion_tactil,
                    "velocidad_clics": monitoring.velocidad_clics,
                },
            )
            db.commit()

            # Procesar con el motor de adaptación
            response = adaptation_engine.process(
                student_id=monitoring.student_id,
                session_id=monitoring.session_id,
                emocion=monitoring.emocion,
                nivel_atencion=monitoring.nivel_atencion,
                stimming=monitoring.stimming,
                presion_tactil=monitoring.presion_tactil or 0.0,
            )

            # Guardar acciones en la base de datos
            for accion in response.acciones:
                db.execute(
                    text("""
                        INSERT INTO action_rto (session_id, student_id, accion, motivo, datos_contexto, timestamp)
                        VALUES (:session_id, :student_id, :accion, :motivo, :datos::jsonb, NOW())
                    """),
                    {
                        "session_id": monitoring.session_id,
                        "student_id": monitoring.student_id,
                        "accion": accion.accion.value,
                        "motivo": accion.motivo,
                        "datos": json.dumps(accion.datos) if accion.datos else None,
                    },
                )

                # Si hay crisis moderada o grave, registrarla
                if accion.accion == AccionAdaptacion.alerta_tutor:
                    _registrar_crisis(db, monitoring.session_id, monitoring.student_id, NivelCrisis.moderada, monitoring.emocion.value)
                elif accion.accion == AccionAdaptacion.intervencion_profesional:
                    _registrar_crisis(db, monitoring.session_id, monitoring.student_id, NivelCrisis.grave, monitoring.emocion.value)

            db.commit()

            # Enviar respuesta al estudiante
            response_dict = response.model_dump()
            response_dict["emocion_actual"] = response.emocion_actual.value
            response_dict["alerta_crisis"] = response.alerta_crisis.value if response.alerta_crisis else None
            for a in response_dict["acciones"]:
                a["accion"] = a["accion"].value if hasattr(a["accion"], "value") else a["accion"]

            await websocket.send_json(response_dict)

            # Notificar a tutores observando
            tutor_data = {
                "type": "monitoring_update",
                "student_id": student_id,
                "emocion": monitoring.emocion.value,
                "nivel_atencion": monitoring.nivel_atencion,
                "stimming": monitoring.stimming,
                "presion_tactil": monitoring.presion_tactil,
                "acciones": [a.model_dump() for a in response.acciones],
                "alerta_crisis": response.alerta_crisis.value if response.alerta_crisis else None,
            }
            # Serializar enums en tutor_data
            for a in tutor_data["acciones"]:
                a["accion"] = a["accion"].value if hasattr(a["accion"], "value") else a["accion"]

            await manager.notify_tutors(student_id, tutor_data)

    except WebSocketDisconnect:
        manager.disconnect_student(student_id)
    except json.JSONDecodeError:
        await websocket.send_json({"status": "error", "mensaje": "JSON inválido"})
    except Exception as e:
        await websocket.send_json({"status": "error", "mensaje": str(e)})
    finally:
        manager.disconnect_student(student_id)
        db.close()


@router.websocket("/ws/tutor/{student_id}")
async def websocket_tutor(websocket: WebSocket, student_id: int):
    """
    WebSocket para que el tutor observe el monitoreo en tiempo real de un estudiante.
    Recibe actualizaciones cada vez que se procesa una muestra del estudiante.
    """
    token = websocket.query_params.get("token")
    if token:
        try:
            decode_token(token)
        except Exception:
            await websocket.close(code=4001, reason="Token inválido")
            return

    await manager.connect_tutor(student_id, websocket)

    try:
        while True:
            # Mantener la conexión viva — el tutor solo recibe
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_tutor(student_id, websocket)


def _registrar_crisis(db: Session, session_id: int, student_id: int, nivel: NivelCrisis, emocion: str):
    """Registra una crisis detectada automáticamente."""
    # Verificar que no haya una crisis activa reciente (evitar duplicados)
    recent = db.execute(
        text("""
            SELECT id FROM crisis
            WHERE session_id = :sid AND student_id = :stid AND resuelta = false
            AND fecha_inicio > NOW() - INTERVAL '2 minutes'
        """),
        {"sid": session_id, "stid": student_id},
    ).fetchone()

    if not recent:
        db.execute(
            text("""
                INSERT INTO crisis (session_id, student_id, nivel, emocion_detectada, descripcion, fecha_inicio)
                VALUES (:session_id, :student_id, :nivel, :emocion, :descripcion, NOW())
            """),
            {
                "session_id": session_id,
                "student_id": student_id,
                "nivel": nivel.value,
                "emocion": emocion,
                "descripcion": f"Crisis {nivel.value} detectada automáticamente por el motor de adaptación",
            },
        )


# --- Endpoints REST para consultar historial de monitoreo ---

@router.get("/history/{session_id}", response_model=list[MonitoringResponse])
async def obtener_historial_monitoreo(
    session_id: int,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene el historial de monitoreo de una sesión."""
    rows = db.execute(
        text("""
            SELECT id, session_id, student_id, emocion, nivel_atencion, stimming,
                presion_tactil, velocidad_clics, timestamp, created_at
            FROM monitoring
            WHERE session_id = :sid
            ORDER BY timestamp DESC
            LIMIT :limit
        """),
        {"sid": session_id, "limit": limit},
    ).fetchall()

    return [
        MonitoringResponse(
            id=r[0], session_id=r[1], student_id=r[2], emocion=r[3],
            nivel_atencion=r[4], stimming=r[5], presion_tactil=r[6],
            velocidad_clics=r[7], timestamp=r[8], created_at=r[9],
        )
        for r in rows
    ]


@router.get("/status/{student_id}")
async def obtener_estado_actual(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene el estado actual del monitoreo de un estudiante."""
    state = adaptation_engine._states.get(student_id)
    if not state:
        return {"status": "offline", "mensaje": "El estudiante no tiene una sesión de monitoreo activa"}

    return {
        "status": "online",
        "student_id": student_id,
        "session_id": state.session_id,
        "emocion_actual": state.emocion_actual.value,
        "nivel_atencion": state.nivel_atencion,
        "stimming": state.stimming,
        "presion_tactil": state.presion_tactil,
        "ultima_crisis": state.ultima_crisis_nivel.value if state.ultima_crisis_nivel else None,
    }
