"""
Aula Global — Router de crisis
Columnas: id_crisis, id_session, id_type_crisis, id_action, id_student,
          detection_timestamp, resolved_at, was_effective, required_human, notes
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    CrisisCreate, CrisisUpdate, CrisisResponse,
    TokenData, RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


def _row_to_crisis(r) -> CrisisResponse:
    return CrisisResponse(
        id_crisis=str(r[0]), id_session=str(r[1]),
        id_type_crisis=str(r[2]), id_action=str(r[3]), id_student=str(r[4]),
        detection_timestamp=r[5], resolved_at=r[6],
        was_effective=r[7], required_human=r[8], notes=r[9], created_at=r[10],
    )


@router.post("/", response_model=CrisisResponse, status_code=201)
async def registrar_crisis(
    data: CrisisCreate,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(get_current_user),
):
    """Registra una crisis manualmente."""
    row = db.execute(
        text("""
            INSERT INTO crisis (id_session, id_type_crisis, id_action, id_student, required_human, notes)
            VALUES (:id_session::uuid, :id_type_crisis::uuid, :id_action::uuid,
                    :id_student::uuid, :required_human, :notes)
            RETURNING id_crisis, id_session, id_type_crisis, id_action, id_student,
                detection_timestamp, resolved_at, was_effective, required_human, notes, created_at
        """),
        {
            "id_session":      data.id_session,
            "id_type_crisis":  data.id_type_crisis,
            "id_action":       data.id_action,
            "id_student":      data.id_student,
            "required_human":  data.required_human,
            "notes":           data.notes,
        },
    ).fetchone()
    db.commit()
    return _row_to_crisis(row)


@router.get("/", response_model=list[CrisisResponse])
async def listar_crisis(
    student_id: Optional[str]  = None,
    session_id: Optional[str]  = None,
    resuelta:   Optional[bool] = None,
    limit:      int            = 50,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    query = """
        SELECT id_crisis, id_session, id_type_crisis, id_action, id_student,
               detection_timestamp, resolved_at, was_effective, required_human, notes, created_at
        FROM crisis WHERE 1=1
    """
    params: dict = {}

    if student_id:
        query += " AND id_student = :student_id::uuid"
        params["student_id"] = student_id
    if session_id:
        query += " AND id_session = :session_id::uuid"
        params["session_id"] = session_id
    if resuelta is True:
        query += " AND resolved_at IS NOT NULL"
    elif resuelta is False:
        query += " AND resolved_at IS NULL"

    # Tutores solo ven crisis de sus estudiantes
    if cu.rol == RolUsuario.tutor:
        query += """
            AND id_student IN (
                SELECT id_student FROM responsible_principal
                WHERE id_tutor = :tutor_id::uuid AND is_active = true
            )
        """
        params["tutor_id"] = cu.user_id

    query += " ORDER BY detection_timestamp DESC LIMIT :limit"
    params["limit"] = limit
    rows = db.execute(text(query), params).fetchall()
    return [_row_to_crisis(r) for r in rows]


@router.get("/active", response_model=list[CrisisResponse])
async def crisis_activas(
    db: Session = Depends(get_db),
    cu: TokenData = Depends(get_current_user),
):
    """Lista crisis sin resolver, ordenadas por gravedad (via type_crisis.severity_level)."""
    query = """
        SELECT c.id_crisis, c.id_session, c.id_type_crisis, c.id_action, c.id_student,
               c.detection_timestamp, c.resolved_at, c.was_effective, c.required_human,
               c.notes, c.created_at
        FROM crisis c
        JOIN type_crisis tc ON tc.id_type_crisis = c.id_type_crisis
        WHERE c.resolved_at IS NULL
    """
    params: dict = {}

    if cu.rol == RolUsuario.tutor:
        query += """
            AND c.id_student IN (
                SELECT id_student FROM responsible_principal
                WHERE id_tutor = :tutor_id::uuid AND is_active = true
            )
        """
        params["tutor_id"] = cu.user_id

    query += " ORDER BY tc.severity_level DESC, c.detection_timestamp ASC"
    rows = db.execute(text(query), params).fetchall()
    return [_row_to_crisis(r) for r in rows]


@router.get("/{crisis_id}", response_model=CrisisResponse)
async def obtener_crisis(
    crisis_id: str,
    db:        Session = Depends(get_db),
    cu:        TokenData = Depends(get_current_user),
):
    row = db.execute(
        text("""
            SELECT id_crisis, id_session, id_type_crisis, id_action, id_student,
                   detection_timestamp, resolved_at, was_effective, required_human, notes, created_at
            FROM crisis WHERE id_crisis = :id::uuid
        """),
        {"id": crisis_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Crisis no encontrada")
    return _row_to_crisis(row)


@router.put("/{crisis_id}/resolve", response_model=CrisisResponse)
async def resolver_crisis(
    crisis_id: str,
    data:      CrisisUpdate,
    db:        Session = Depends(get_db),
    cu:        TokenData = Depends(get_current_user),
):
    """Marca una crisis como resuelta."""
    result = db.execute(
        text("""
            UPDATE crisis
            SET resolved_at   = NOW(),
                was_effective = :was_effective,
                notes         = COALESCE(:notes, notes)
            WHERE id_crisis = :id::uuid AND resolved_at IS NULL
        """),
        {
            "id":           crisis_id,
            "was_effective": data.was_effective,
            "notes":         data.notes,
        },
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Crisis no encontrada o ya resuelta")
    return await obtener_crisis(crisis_id, db, cu)
