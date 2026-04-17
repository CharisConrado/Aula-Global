"""
Aula Global — Router de sesiones
Columnas: id_session, id_student, start_time, end_time, duration_sec, status
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    SessionCreate, SessionResponse, SessionClose,
    StudentActivityCreate, StudentActivityUpdate, StudentActivityResponse,
    TokenData, RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


def _row_to_session(r) -> SessionResponse:
    return SessionResponse(
        id_session=str(r[0]), id_student=str(r[1]),
        session_type=r[2], start_time=r[3], end_time=r[4],
        duration_sec=r[5], device=r[6], device_type=r[7],
        status=r[8], created_at=r[9],
    )


# ── Sesiones ─────────────────────────────────────────────────

@router.post("/", response_model=SessionResponse, status_code=201)
async def crear_sesion(
    data: SessionCreate,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(get_current_user),
):
    """Crea una nueva sesión para un estudiante. Cierra sesiones activas previas."""
    # Verificar estudiante
    student = db.execute(
        text("SELECT id_student FROM student WHERE id_student = :id::uuid AND account_status = 'activo'"),
        {"id": data.id_student},
    ).fetchone()
    if not student:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado o inactivo")

    # Cerrar sesiones activas anteriores
    db.execute(
        text("""
            UPDATE session SET status = 'interrumpida', end_time = NOW(),
                duration_sec = EXTRACT(EPOCH FROM (NOW() - start_time))::int
            WHERE id_student = :sid::uuid AND status = 'activa'
        """),
        {"sid": data.id_student},
    )

    row = db.execute(
        text("""
            INSERT INTO session (id_student, session_type, device, device_type, status)
            VALUES (:id_student::uuid, :session_type, :device, :device_type, 'activa')
            RETURNING id_session, id_student, session_type, start_time, end_time,
                duration_sec, device, device_type, status, created_at
        """),
        {
            "id_student":   data.id_student,
            "session_type": data.session_type,
            "device":       data.device,
            "device_type":  data.device_type,
        },
    ).fetchone()
    db.commit()
    return _row_to_session(row)


@router.get("/", response_model=list[SessionResponse])
async def listar_sesiones(
    student_id: Optional[str]  = None,
    activa:     Optional[bool] = None,
    limit:      int            = 50,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    query = """
        SELECT id_session, id_student, session_type, start_time, end_time,
               duration_sec, device, device_type, status, created_at
        FROM session WHERE 1=1
    """
    params: dict = {}

    if student_id:
        query += " AND id_student = :student_id::uuid"
        params["student_id"] = student_id

    if activa is not None:
        query += " AND status = :st"
        params["st"] = "activa" if activa else "completada"

    # Tutores solo ven sesiones de sus estudiantes
    if cu.rol == RolUsuario.tutor:
        query += """
            AND id_student IN (
                SELECT id_student FROM responsible_principal
                WHERE id_tutor = :tutor_id::uuid AND is_active = true
            )
        """
        params["tutor_id"] = cu.user_id

    query += " ORDER BY start_time DESC LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(query), params).fetchall()
    return [_row_to_session(r) for r in rows]


@router.get("/{session_id}", response_model=SessionResponse)
async def obtener_sesion(
    session_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    row = db.execute(
        text("""
            SELECT id_session, id_student, session_type, start_time, end_time,
                   duration_sec, device, device_type, status, created_at
            FROM session WHERE id_session = :id::uuid
        """),
        {"id": session_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return _row_to_session(row)


@router.put("/{session_id}/close", response_model=SessionResponse)
async def cerrar_sesion(
    session_id: str,
    data:       SessionClose,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    """Cierra una sesión activa y calcula su duración."""
    session = db.execute(
        text("SELECT id_session FROM session WHERE id_session = :id::uuid AND status = 'activa'"),
        {"id": session_id},
    ).fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión activa no encontrada")

    close_status = data.status if data.status in ("completada", "interrumpida", "crisis") else "completada"

    db.execute(
        text("""
            UPDATE session SET
                status       = :status,
                end_time     = NOW(),
                duration_sec = EXTRACT(EPOCH FROM (NOW() - start_time))::int
            WHERE id_session = :id::uuid
        """),
        {"id": session_id, "status": close_status},
    )
    db.commit()
    return await obtener_sesion(session_id, db, cu)


# ── Actividades dentro de la sesión ──────────────────────────

def _row_to_sa(r) -> StudentActivityResponse:
    return StudentActivityResponse(
        id_student_activity=str(r[0]), id_student=str(r[1]),
        id_activity=str(r[2]), id_session=str(r[3]),
        score=r[4], achievement_level=r[5], success_rate=r[6],
        stress_level=r[7], time_spent_sec=r[8], had_crisis=r[9],
        tactile_pressure=r[10], stimming_detected=r[11],
        format_used=r[12], qualitative_notes=r[13],
        completion_date=r[14], is_completed=r[15],
    )


@router.post("/{session_id}/activities", response_model=StudentActivityResponse, status_code=201)
async def iniciar_actividad(
    session_id: str,
    data:       StudentActivityCreate,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    # Verificar sesión activa
    session = db.execute(
        text("SELECT id_session FROM session WHERE id_session = :id::uuid AND status = 'activa'"),
        {"id": session_id},
    ).fetchone()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión activa no encontrada")

    row = db.execute(
        text("""
            INSERT INTO student_activity (id_student, id_activity, id_session,
                achievement_level, had_crisis, tactile_pressure, stimming_detected, is_completed)
            VALUES (:id_student::uuid, :id_activity::uuid, :id_session::uuid,
                'en_progreso', false, false, false, false)
            RETURNING id_student_activity, id_student, id_activity, id_session,
                score, achievement_level, success_rate, stress_level, time_spent_sec,
                had_crisis, tactile_pressure, stimming_detected, format_used,
                qualitative_notes, completion_date, is_completed
        """),
        {
            "id_student":  data.id_student,
            "id_activity": data.id_activity,
            "id_session":  session_id,
        },
    ).fetchone()
    db.commit()
    return _row_to_sa(row)


@router.put("/{session_id}/activities/{record_id}", response_model=StudentActivityResponse)
async def actualizar_actividad(
    session_id: str,
    record_id:  str,
    data:       StudentActivityUpdate,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    set_parts = [f"{k} = :{k}" for k in updates]
    updates["id"]  = record_id
    updates["sid"] = session_id

    db.execute(
        text(f"UPDATE student_activity SET {', '.join(set_parts)} WHERE id_student_activity = :id::uuid AND id_session = :sid::uuid"),
        updates,
    )
    db.commit()

    row = db.execute(
        text("""
            SELECT id_student_activity, id_student, id_activity, id_session,
                score, achievement_level, success_rate, stress_level, time_spent_sec,
                had_crisis, tactile_pressure, stimming_detected, format_used,
                qualitative_notes, completion_date, is_completed
            FROM student_activity WHERE id_student_activity = :id::uuid
        """),
        {"id": record_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return _row_to_sa(row)


@router.get("/{session_id}/activities", response_model=list[StudentActivityResponse])
async def listar_actividades_sesion(
    session_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    rows = db.execute(
        text("""
            SELECT id_student_activity, id_student, id_activity, id_session,
                score, achievement_level, success_rate, stress_level, time_spent_sec,
                had_crisis, tactile_pressure, stimming_detected, format_used,
                qualitative_notes, completion_date, is_completed
            FROM student_activity WHERE id_session = :sid::uuid
            ORDER BY completion_date ASC
        """),
        {"sid": session_id},
    ).fetchall()
    return [_row_to_sa(r) for r in rows]
