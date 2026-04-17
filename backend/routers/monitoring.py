"""
Aula Global — Router de monitoreo (WebSocket)
Columnas reales: id_monitoring, id_session, emotion, attention_level (numeric),
                 stimming (bool), tactile_pressure (bool), action_taken (varchar),
                 detected_at (timestamptz)
NOTA: monitoring NO tiene id_student — se accede a través de session.id_student
"""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db, SessionLocal
from models.schemas import (
    MonitoringData, MonitoringResponse,
    Emocion, AccionMonitoreo,
    TokenData, RolUsuario,
)
from services.auth_service import get_current_user, decode_token
from services.adaptation_engine import adaptation_engine

router = APIRouter()

# {id_student: WebSocket}
active_connections: dict[str, WebSocket] = {}
# {id_student: [WebSocket]}  ← tutores observando
tutor_connections: dict[str, list[WebSocket]] = {}


# ── WebSocket del estudiante ─────────────────────────────────

@router.websocket("/ws/{student_id}")
async def ws_estudiante(websocket: WebSocket, student_id: str):
    """
    Recibe datos de MediaPipe cada 2 segundos y devuelve acciones de adaptación.
    Mensaje esperado:
    {
      "id_session": "uuid",
      "emotion": "neutro|feliz|...",
      "attention_level": 0.0-1.0,
      "stimming": bool,
      "tactile_pressure": bool
    }
    """
    token = websocket.query_params.get("token")
    if token:
        try:
            decode_token(token)
        except Exception:
            await websocket.close(code=4001, reason="Token inválido")
            return

    await websocket.accept()
    active_connections[student_id] = websocket
    db = SessionLocal()

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)
            monitoring = MonitoringData(**data)

            # Determinar qué acción tomar (motor de adaptación)
            response = adaptation_engine.process(
                student_id=student_id,
                session_id=monitoring.id_session,
                emocion=monitoring.emotion,
                nivel_atencion=monitoring.attention_level,
                stimming=monitoring.stimming,
                presion_tactil=1.0 if monitoring.tactile_pressure else 0.0,
            )

            # La DB solo acepta UN action_taken por registro (el más prioritario)
            action_taken: str = AccionMonitoreo.ninguna.value
            if response.acciones:
                action_taken = response.acciones[0].accion  # Ya es str

            # Guardar en monitoring
            db.execute(
                text("""
                    INSERT INTO monitoring (id_session, emotion, attention_level,
                        stimming, tactile_pressure, action_taken)
                    VALUES (:id_session::uuid, :emotion, :attention_level,
                        :stimming, :tactile_pressure, :action_taken)
                """),
                {
                    "id_session":       monitoring.id_session,
                    "emotion":          monitoring.emotion.value,
                    "attention_level":  monitoring.attention_level,
                    "stimming":         monitoring.stimming,
                    "tactile_pressure": monitoring.tactile_pressure,
                    "action_taken":     action_taken,
                },
            )

            # Registrar crisis si hay alerta
            if response.alerta_crisis:
                _registrar_crisis_auto(db, monitoring.id_session, student_id, response.alerta_crisis)

            db.commit()

            # Respuesta al estudiante
            resp_dict = {
                "status":         "ok",
                "acciones":       [{"accion": a.accion, "motivo": a.motivo, "datos": a.datos} for a in response.acciones],
                "emocion_actual": response.emocion_actual,
                "nivel_atencion": response.nivel_atencion,
                "alerta_crisis":  response.alerta_crisis,
            }
            await websocket.send_json(resp_dict)

            # Notificar a tutores conectados
            await _notify_tutors(student_id, {
                "type":           "monitoring_update",
                "student_id":     student_id,
                "emocion":        monitoring.emotion.value,
                "nivel_atencion": monitoring.attention_level,
                "stimming":       monitoring.stimming,
                "acciones":       resp_dict["acciones"],
                "alerta_crisis":  response.alerta_crisis,
            })

    except WebSocketDisconnect:
        pass
    except json.JSONDecodeError:
        await websocket.send_json({"status": "error", "mensaje": "JSON inválido"})
    except Exception as e:
        try:
            await websocket.send_json({"status": "error", "mensaje": str(e)})
        except Exception:
            pass
    finally:
        active_connections.pop(student_id, None)
        adaptation_engine.clear_state(student_id)
        db.close()


# ── WebSocket del tutor ──────────────────────────────────────

@router.websocket("/ws/tutor/{student_id}")
async def ws_tutor(websocket: WebSocket, student_id: str):
    """El tutor observa en tiempo real el monitoreo de un estudiante."""
    token = websocket.query_params.get("token")
    if token:
        try:
            decode_token(token)
        except Exception:
            await websocket.close(code=4001, reason="Token inválido")
            return

    await websocket.accept()
    if student_id not in tutor_connections:
        tutor_connections[student_id] = []
    tutor_connections[student_id].append(websocket)

    try:
        while True:
            await websocket.receive_text()   # Mantener viva la conexión
    except WebSocketDisconnect:
        pass
    finally:
        if student_id in tutor_connections and websocket in tutor_connections[student_id]:
            tutor_connections[student_id].remove(websocket)


async def _notify_tutors(student_id: str, data: dict):
    conns = tutor_connections.get(student_id, [])
    dead  = []
    for ws in conns:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        conns.remove(ws)


def _registrar_crisis_auto(db: Session, session_id: str, student_id: str, nivel: str):
    """Registra una crisis automática si no hay una activa reciente."""
    # Mapear nivel a severity_level
    sev = {"leve": 1, "moderada": 2, "grave": 3}.get(nivel, 1)

    # Buscar type_crisis correspondiente
    tc = db.execute(
        text("SELECT id_type_crisis FROM type_crisis WHERE severity_level = :sev ORDER BY created_at ASC LIMIT 1"),
        {"sev": sev},
    ).fetchone()
    if not tc:
        return  # No hay type_crisis configurado en la DB

    # Buscar id_action correspondiente al nivel
    action_name_map = {
        "leve":     "mostrar_pista",
        "moderada": "alerta_tutor",
        "grave":    "intervencion_profesional",
    }
    action_name = action_name_map.get(nivel, "mostrar_pista")
    ac = db.execute(
        text("SELECT id_action FROM action_rto WHERE action_name = :name LIMIT 1"),
        {"name": action_name},
    ).fetchone()
    if not ac:
        return

    # Evitar crisis duplicadas en los últimos 2 minutos
    recent = db.execute(
        text("""
            SELECT id_crisis FROM crisis
            WHERE id_session = :sid::uuid AND id_student = :stid::uuid
              AND resolved_at IS NULL
              AND detection_timestamp > NOW() - INTERVAL '2 minutes'
        """),
        {"sid": session_id, "stid": student_id},
    ).fetchone()
    if recent:
        return

    db.execute(
        text("""
            INSERT INTO crisis (id_session, id_type_crisis, id_action, id_student, required_human, notes)
            VALUES (:session_id::uuid, :type_crisis_id::uuid, :action_id::uuid, :student_id::uuid, :req_human, :notes)
        """),
        {
            "session_id":      session_id,
            "type_crisis_id":  str(tc[0]),
            "action_id":       str(ac[0]),
            "student_id":      student_id,
            "req_human":       nivel in ("moderada", "grave"),
            "notes":           f"Crisis {nivel} detectada automáticamente",
        },
    )


# ── REST: historial y estado ─────────────────────────────────

@router.get("/history/{session_id}", response_model=list[MonitoringResponse])
async def historial_monitoreo(
    session_id: str,
    limit:      int = 100,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    rows = db.execute(
        text("""
            SELECT id_monitoring, id_session, emotion, attention_level, stimming,
                   tactile_pressure, action_taken, detected_at
            FROM monitoring
            WHERE id_session = :sid::uuid
            ORDER BY detected_at DESC
            LIMIT :limit
        """),
        {"sid": session_id, "limit": limit},
    ).fetchall()

    return [
        MonitoringResponse(
            id_monitoring=str(r[0]), id_session=str(r[1]),
            emotion=r[2], attention_level=r[3], stimming=r[4],
            tactile_pressure=r[5], action_taken=r[6], detected_at=r[7],
        )
        for r in rows
    ]


@router.get("/status/{student_id}")
async def estado_actual(
    student_id: str,
    cu:         TokenData = Depends(get_current_user),
):
    state = adaptation_engine._states.get(student_id)
    if not state:
        return {"status": "offline", "mensaje": "Sin sesión de monitoreo activa"}
    return {
        "status":         "online",
        "student_id":     student_id,
        "session_id":     state.session_id,
        "emocion_actual": state.emocion_actual.value,
        "nivel_atencion": state.nivel_atencion,
        "stimming":       state.stimming,
        "ultima_crisis":  state.ultima_crisis_nivel.value if state.ultima_crisis_nivel else None,
    }
