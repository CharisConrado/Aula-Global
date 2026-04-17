"""
Aula Global — Router de intervenciones
Columnas: id_intervention, id_session, id_tutor, id_professional, id_crisis,
          help_type, session_moment, description, status, resolved_at
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    InterventionCreate, InterventionUpdate, InterventionResponse,
    TokenData, RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


def _row_to_intervention(r) -> InterventionResponse:
    return InterventionResponse(
        id_intervention=str(r[0]), id_session=str(r[1]),
        id_crisis=str(r[2]) if r[2] else None,
        id_tutor=str(r[3]) if r[3] else None,
        id_professional=str(r[4]) if r[4] else None,
        help_type=r[5], session_moment=r[6], description=r[7],
        status=r[8], resolved_at=r[9], created_at=r[10],
    )


@router.post("/", response_model=InterventionResponse, status_code=201)
async def crear_intervencion(
    data: InterventionCreate,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(get_current_user),
):
    """Crea una intervención (por crisis o consulta externa)."""
    # Asignar tutor o profesional según el rol actual si no se especifica
    id_tutor        = data.id_tutor or (cu.user_id if cu.rol == RolUsuario.tutor else None)
    id_professional = data.id_professional or (cu.user_id if cu.rol == RolUsuario.profesional else None)

    row = db.execute(
        text("""
            INSERT INTO intervention (id_session, id_tutor, id_professional, id_crisis,
                help_type, session_moment, description, status)
            VALUES (:id_session::uuid,
                    :id_tutor::uuid,
                    :id_professional::uuid,
                    :id_crisis::uuid,
                    :help_type, :session_moment, :description, 'pendiente')
            RETURNING id_intervention, id_session, id_crisis, id_tutor, id_professional,
                help_type, session_moment, description, status, resolved_at, created_at
        """),
        {
            "id_session":      data.id_session,
            "id_tutor":        id_tutor,
            "id_professional": id_professional,
            "id_crisis":       data.id_crisis,
            "help_type":       data.help_type.value,
            "session_moment":  data.session_moment,
            "description":     data.description,
        },
    ).fetchone()
    db.commit()
    return _row_to_intervention(row)


@router.get("/", response_model=list[InterventionResponse])
async def listar_intervenciones(
    session_id:  Optional[str]  = None,
    help_type:   Optional[str]  = None,
    pendiente:   Optional[bool] = None,
    limit:       int            = 50,
    db:          Session = Depends(get_db),
    cu:          TokenData = Depends(get_current_user),
):
    query = """
        SELECT id_intervention, id_session, id_crisis, id_tutor, id_professional,
               help_type, session_moment, description, status, resolved_at, created_at
        FROM intervention WHERE 1=1
    """
    params: dict = {}

    if session_id:
        query += " AND id_session = :session_id::uuid"
        params["session_id"] = session_id
    if help_type:
        query += " AND help_type = :help_type"
        params["help_type"] = help_type
    if pendiente is True:
        query += " AND status = 'pendiente'"
    elif pendiente is False:
        query += " AND status = 'resuelta'"

    # Tutores solo ven sus propias intervenciones o las de su sesión
    if cu.rol == RolUsuario.tutor:
        query += " AND id_tutor = :tutor_id::uuid"
        params["tutor_id"] = cu.user_id

    query += " ORDER BY created_at DESC LIMIT :limit"
    params["limit"] = limit
    rows = db.execute(text(query), params).fetchall()
    return [_row_to_intervention(r) for r in rows]


@router.get("/pending", response_model=list[InterventionResponse])
async def pendientes(
    db: Session = Depends(get_db),
    cu: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """Intervenciones pendientes para profesionales, ordenadas por prioridad."""
    rows = db.execute(
        text("""
            SELECT id_intervention, id_session, id_crisis, id_tutor, id_professional,
                   help_type, session_moment, description, status, resolved_at, created_at
            FROM intervention WHERE status != 'resuelta'
            ORDER BY
                CASE help_type
                    WHEN 'crisis_grave'  THEN 1
                    WHEN 'crisis_leve'   THEN 2
                    WHEN 'seguimiento'   THEN 3
                    ELSE 4
                END,
                created_at ASC
        """)
    ).fetchall()
    return [_row_to_intervention(r) for r in rows]


@router.get("/{intervention_id}", response_model=InterventionResponse)
async def obtener_intervencion(
    intervention_id: str,
    db:              Session = Depends(get_db),
    cu:              TokenData = Depends(get_current_user),
):
    row = db.execute(
        text("""
            SELECT id_intervention, id_session, id_crisis, id_tutor, id_professional,
                   help_type, session_moment, description, status, resolved_at, created_at
            FROM intervention WHERE id_intervention = :id::uuid
        """),
        {"id": intervention_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Intervención no encontrada")
    return _row_to_intervention(row)


@router.put("/{intervention_id}", response_model=InterventionResponse)
async def actualizar_intervencion(
    intervention_id: str,
    data:            InterventionUpdate,
    db:              Session = Depends(get_db),
    cu:              TokenData = Depends(get_current_user),
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    set_parts = []
    for k, v in list(updates.items()):
        if k == "status" and hasattr(v, "value"):
            updates[k] = v.value
        set_parts.append(f"{k} = :{k}")

    # Si se resuelve, marcar fecha
    if updates.get("status") == "resuelta" and "resolved_at" not in updates:
        set_parts.append("resolved_at = NOW()")

    updates["id"] = intervention_id
    result = db.execute(
        text(f"UPDATE intervention SET {', '.join(set_parts)} WHERE id_intervention = :id::uuid"),
        updates,
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Intervención no encontrada")
    return await obtener_intervencion(intervention_id, db, cu)


@router.post("/request-external", response_model=InterventionResponse, status_code=201)
async def solicitar_consulta_externa(
    id_session:  str,
    descripcion: str = "Consulta externa solicitada por tutor",
    db:          Session = Depends(get_db),
    cu:          TokenData = Depends(get_current_user),
):
    """Solicita una consulta externa sin necesidad de una crisis activa."""
    # Buscar profesional disponible
    prof = db.execute(
        text("SELECT id_professional FROM professional WHERE is_active = true ORDER BY created_at ASC LIMIT 1")
    ).fetchone()

    id_tutor        = cu.user_id if cu.rol == RolUsuario.tutor else None
    id_professional = str(prof[0]) if prof else None

    row = db.execute(
        text("""
            INSERT INTO intervention (id_session, id_tutor, id_professional, help_type, description, status)
            VALUES (:id_session::uuid, :id_tutor::uuid, :id_professional::uuid,
                    'consulta_externa', :description, 'pendiente')
            RETURNING id_intervention, id_session, id_crisis, id_tutor, id_professional,
                help_type, session_moment, description, status, resolved_at, created_at
        """),
        {
            "id_session":      id_session,
            "id_tutor":        id_tutor,
            "id_professional": id_professional,
            "description":     descripcion,
        },
    ).fetchone()
    db.commit()
    return _row_to_intervention(row)
