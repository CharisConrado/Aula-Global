"""
Aula Global — Router de sesiones asistidas
El tutor solicita el apoyo de un profesional especializado para un estudiante.

Flujo:
  1. Tutor → POST /  (solicita sesión, elige profesional + estudiante)
  2. Profesional → PUT /{id}/accept  (acepta la solicitud)
  3. Profesional → PUT /{id}/send-link  (pega enlace de Zoom/Meet/Teams)
  4. Tutor hace clic en el enlace y se une a la videollamada
  5. Profesional → PUT /{id}/close  (cierra la sesión)
"""

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db, engine
from models.schemas import (
    SesionAsistidaCreate,
    SesionAsistidaResponse,
    SendLinkPayload,
    AcceptSessionPayload,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()

# ── Crear tabla si no existe ─────────────────────────────────────────────────
def _ensure_table():
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS sesion_asistida (
                    id_sesion_asistida UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    id_tutor           UUID NOT NULL,
                    id_professional    UUID NOT NULL,
                    id_student         UUID NOT NULL,
                    status VARCHAR(20) DEFAULT 'pendiente'
                        CHECK (status IN ('pendiente','aceptada','en_curso','finalizada','rechazada')),
                    notes        TEXT,
                    meeting_link TEXT,
                    requested_at TIMESTAMPTZ DEFAULT NOW(),
                    accepted_at  TIMESTAMPTZ,
                    closed_at    TIMESTAMPTZ,
                    created_at   TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.commit()
    except Exception as exc:
        # No detener el arranque si ya existe u ocurre otro error
        print(f"[sesiones_asistidas] aviso al crear tabla: {exc}")

_ensure_table()


# ── Helper ───────────────────────────────────────────────────────────────────

_SELECT = """
    SELECT sa.id_sesion_asistida, sa.id_tutor, sa.id_professional, sa.id_student,
           sa.status, sa.notes, sa.meeting_link,
           sa.requested_at, sa.accepted_at, sa.closed_at, sa.created_at,
           t.full_name   AS tutor_name,
           p.full_name   AS professional_name,
           st.full_name  AS student_name,
           p.speciality  AS professional_speciality,
           sa.scheduled_at, sa.professional_notes
    FROM   sesion_asistida sa
    LEFT JOIN tutor       t  ON sa.id_tutor       = t.id_tutor
    LEFT JOIN professional p  ON sa.id_professional = p.id_professional
    LEFT JOIN student      st ON sa.id_student      = st.id_student
"""


def _to_response(r) -> SesionAsistidaResponse:
    return SesionAsistidaResponse(
        id_sesion_asistida      = str(r[0]),
        id_tutor                = str(r[1]),
        id_professional         = str(r[2]),
        id_student              = str(r[3]),
        status                  = r[4],
        notes                   = r[5],
        meeting_link            = r[6],
        requested_at            = r[7],
        accepted_at             = r[8],
        closed_at               = r[9],
        created_at              = r[10],
        tutor_name              = r[11],
        professional_name       = r[12],
        student_name            = r[13],
        professional_speciality = r[14],
        scheduled_at            = r[15],
        professional_notes      = r[16],
    )


def _get_one(session_id: str, db: Session) -> SesionAsistidaResponse:
    row = db.execute(
        text(_SELECT + " WHERE sa.id_sesion_asistida = CAST(:id AS uuid)"),
        {"id": session_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Sesión asistida no encontrada")
    return _to_response(row)


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/", response_model=SesionAsistidaResponse, status_code=201)
async def solicitar_sesion(
    data: SesionAsistidaCreate,
    db:   Session  = Depends(get_db),
    cu:   TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.admin)),
):
    """El tutor solicita una sesión asistida eligiendo profesional y estudiante."""
    row = db.execute(
        text("""
            INSERT INTO sesion_asistida (id_tutor, id_professional, id_student, notes)
            VALUES (CAST(:id_tutor AS uuid), CAST(:id_professional AS uuid),
                    CAST(:id_student AS uuid), :notes)
            RETURNING id_sesion_asistida
        """),
        {
            "id_tutor":        data.id_tutor,
            "id_professional": data.id_professional,
            "id_student":      data.id_student,
            "notes":           data.notes,
        },
    ).fetchone()
    db.commit()
    return _get_one(str(row[0]), db)


@router.get("/", response_model=list[SesionAsistidaResponse])
async def listar_sesiones(
    db: Session  = Depends(get_db),
    cu: TokenData = Depends(get_current_user),
):
    """
    Lista las sesiones asistidas:
    - Tutor: solo las que solicitó.
    - Profesional: solo las asignadas a él.
    - Admin: todas.
    """
    query  = _SELECT
    params: dict = {}

    if cu.rol == RolUsuario.tutor:
        query += " WHERE sa.id_tutor = CAST(:uid AS uuid)"
        params["uid"] = cu.user_id
    elif cu.rol == RolUsuario.profesional:
        query += " WHERE sa.id_professional = CAST(:uid AS uuid)"
        params["uid"] = cu.user_id
    elif cu.rol == RolUsuario.estudiante:
        query += " WHERE sa.id_student = CAST(:uid AS uuid)"
        params["uid"] = cu.user_id

    query += " ORDER BY sa.created_at DESC"
    rows = db.execute(text(query), params).fetchall()
    return [_to_response(r) for r in rows]


@router.get("/{session_id}", response_model=SesionAsistidaResponse)
async def obtener_sesion(
    session_id: str,
    db:         Session  = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    return _get_one(session_id, db)


@router.put("/{session_id}/accept", response_model=SesionAsistidaResponse)
async def aceptar_sesion(
    session_id: str,
    data:       AcceptSessionPayload = Body(default_factory=AcceptSessionPayload),
    db:         Session  = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """El profesional acepta la solicitud, opcionalmente con horario e indicaciones."""
    result = db.execute(
        text("""
            UPDATE sesion_asistida
               SET status             = 'aceptada',
                   accepted_at        = NOW(),
                   scheduled_at       = :scheduled_at,
                   professional_notes = :professional_notes
             WHERE id_sesion_asistida = CAST(:id AS uuid)
               AND status = 'pendiente'
        """),
        {
            "id":                 session_id,
            "scheduled_at":       data.scheduled_at,
            "professional_notes": data.professional_notes,
        },
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(
            status_code=400,
            detail="Sesión no encontrada o ya no está pendiente",
        )
    return _get_one(session_id, db)


@router.put("/{session_id}/send-link", response_model=SesionAsistidaResponse)
async def enviar_enlace(
    session_id: str,
    data:       SendLinkPayload,
    db:         Session  = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """El profesional pega el enlace de la videollamada (estado: aceptada → en_curso)."""
    result = db.execute(
        text("""
            UPDATE sesion_asistida
               SET meeting_link = :link, status = 'en_curso'
             WHERE id_sesion_asistida = CAST(:id AS uuid)
        """),
        {"link": data.meeting_link, "id": session_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return _get_one(session_id, db)


@router.put("/{session_id}/close", response_model=SesionAsistidaResponse)
async def cerrar_sesion(
    session_id: str,
    db:         Session  = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    """Cierra la sesión asistida (profesional o tutor pueden cerrarla)."""
    result = db.execute(
        text("""
            UPDATE sesion_asistida
               SET status = 'finalizada', closed_at = NOW()
             WHERE id_sesion_asistida = CAST(:id AS uuid)
        """),
        {"id": session_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    return _get_one(session_id, db)


@router.put("/{session_id}/reject", response_model=SesionAsistidaResponse)
async def rechazar_sesion(
    session_id: str,
    db:         Session  = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """El profesional rechaza la solicitud."""
    result = db.execute(
        text("""
            UPDATE sesion_asistida
               SET status = 'rechazada', closed_at = NOW()
             WHERE id_sesion_asistida = CAST(:id AS uuid)
               AND status = 'pendiente'
        """),
        {"id": session_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=400, detail="Sesión no encontrada o ya procesada")
    return _get_one(session_id, db)
