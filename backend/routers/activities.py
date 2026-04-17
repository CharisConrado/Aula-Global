"""
Aula Global — Router de actividades
Columnas: id_activity, id_subject, id_type_activity, title, difficulty_level,
          content (jsonb), estimated_minutes, publication_status
"""

import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    ActivityCreate, ActivityUpdate, ActivityResponse,
    SubjectCreate, SubjectResponse,
    DegreeResponse, TypeCrisisResponse,
    TokenData, RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


def _row_to_activity(r) -> ActivityResponse:
    return ActivityResponse(
        id_activity=str(r[0]), id_subject=str(r[1]), id_type_activity=str(r[2]),
        title=r[3], description=r[4], difficulty_level=r[5],
        content=r[6], estimated_minutes=r[7], publication_status=r[8],
        thumbnail_url=r[9], created_at=r[10],
    )

def _row_to_subject(r) -> SubjectResponse:
    return SubjectResponse(
        id_subject=str(r[0]), id_degree=str(r[1]), subject_name=r[2],
        description=r[3], icon=r[4], color=r[5], is_active=r[6], created_at=r[7],
    )


# ── Grados ───────────────────────────────────────────────────

@router.get("/degrees", response_model=list[DegreeResponse])
async def listar_grados(db: Session = Depends(get_db)):
    """Lista los grados (1° a 5° primaria)."""
    rows = db.execute(
        text("SELECT id_degree, grade_name, level, created_at FROM degree ORDER BY level ASC")
    ).fetchall()
    return [DegreeResponse(id_degree=str(r[0]), grade_name=r[1], level=r[2], created_at=r[3]) for r in rows]


# ── Tipos de actividad ────────────────────────────────────────

@router.get("/types")
async def listar_tipos(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT id_type_activity, name, description, created_at FROM type_activity ORDER BY name ASC")
    ).fetchall()
    return [{"id_type_activity": str(r[0]), "name": r[1], "description": r[2], "created_at": r[3]} for r in rows]


# ── Tipos de diagnóstico ──────────────────────────────────────

@router.get("/diagnosis-types")
async def listar_tipos_diagnostico(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT id_type_diagnosis, name, created_at FROM type_diagnosis ORDER BY name ASC")
    ).fetchall()
    return [{"id_type_diagnosis": str(r[0]), "name": r[1], "created_at": r[2]} for r in rows]


# ── Tipos de crisis ───────────────────────────────────────────

@router.get("/crisis-types", response_model=list[TypeCrisisResponse])
async def listar_tipos_crisis(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT id_type_crisis, name, description, severity_level, created_at FROM type_crisis ORDER BY severity_level ASC")
    ).fetchall()
    return [TypeCrisisResponse(id_type_crisis=str(r[0]), name=r[1], description=r[2], severity_level=r[3], created_at=r[4]) for r in rows]


# ── Acciones RTO ──────────────────────────────────────────────

@router.get("/actions")
async def listar_acciones(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT id_action, action_name, description, auto_apply, created_at FROM action_rto ORDER BY action_name ASC")
    ).fetchall()
    return [{"id_action": str(r[0]), "action_name": r[1], "description": r[2], "auto_apply": r[3], "created_at": r[4]} for r in rows]


# ── Materias ──────────────────────────────────────────────────

@router.post("/subjects", response_model=SubjectResponse, status_code=201)
async def crear_materia(
    data: SubjectCreate,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(require_role(RolUsuario.admin, RolUsuario.profesional)),
):
    row = db.execute(
        text("""
            INSERT INTO subject (id_degree, subject_name, description, icon, color, is_active)
            VALUES (:id_degree::uuid, :subject_name, :description, :icon, :color, true)
            RETURNING id_subject, id_degree, subject_name, description, icon, color, is_active, created_at
        """),
        {
            "id_degree": data.id_degree, "subject_name": data.subject_name,
            "description": data.description, "icon": data.icon, "color": data.color,
        },
    ).fetchone()
    db.commit()
    return _row_to_subject(row)


@router.get("/subjects", response_model=list[SubjectResponse])
async def listar_materias(
    degree_id: Optional[str] = None,
    db:        Session = Depends(get_db),
):
    query  = "SELECT id_subject, id_degree, subject_name, description, icon, color, is_active, created_at FROM subject WHERE is_active = true"
    params: dict = {}
    if degree_id:
        query += " AND id_degree = :degree_id::uuid"
        params["degree_id"] = degree_id
    query += " ORDER BY subject_name ASC"
    rows = db.execute(text(query), params).fetchall()
    return [_row_to_subject(r) for r in rows]


# ── Actividades ───────────────────────────────────────────────

@router.post("/", response_model=ActivityResponse, status_code=201)
async def crear_actividad(
    data: ActivityCreate,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(require_role(RolUsuario.admin, RolUsuario.profesional)),
):
    content_str = json.dumps(data.content) if data.content else None
    row = db.execute(
        text("""
            INSERT INTO activity (id_subject, id_type_activity, title, description,
                difficulty_level, content, estimated_minutes, publication_status, thumbnail_url)
            VALUES (:id_subject::uuid, :id_type_activity::uuid, :title, :description,
                :difficulty_level, :content::jsonb, :estimated_minutes, :publication_status, :thumbnail_url)
            RETURNING id_activity, id_subject, id_type_activity, title, description,
                difficulty_level, content, estimated_minutes, publication_status, thumbnail_url, created_at
        """),
        {
            "id_subject":         data.id_subject,
            "id_type_activity":   data.id_type_activity,
            "title":              data.title,
            "description":        data.description,
            "difficulty_level":   data.difficulty_level.value,
            "content":            content_str,
            "estimated_minutes":  data.estimated_minutes,
            "publication_status": data.publication_status.value,
            "thumbnail_url":      data.thumbnail_url,
        },
    ).fetchone()
    db.commit()
    return _row_to_activity(row)


@router.get("/", response_model=list[ActivityResponse])
async def listar_actividades(
    subject_id:         Optional[str] = None,
    type_activity_id:   Optional[str] = None,
    difficulty_level:   Optional[str] = None,
    degree_id:          Optional[str] = None,
    publication_status: Optional[str] = "publicado",
    db:                 Session = Depends(get_db),
    cu:                 TokenData = Depends(get_current_user),
):
    query  = """
        SELECT a.id_activity, a.id_subject, a.id_type_activity, a.title, a.description,
               a.difficulty_level, a.content, a.estimated_minutes, a.publication_status,
               a.thumbnail_url, a.created_at
        FROM activity a
    """
    conditions = []
    params: dict = {}

    if degree_id:
        query += " JOIN subject s ON a.id_subject = s.id_subject"
        conditions.append("s.id_degree = :degree_id::uuid")
        params["degree_id"] = degree_id

    if publication_status:
        conditions.append("a.publication_status = :pub_status")
        params["pub_status"] = publication_status
    if subject_id:
        conditions.append("a.id_subject = :subject_id::uuid")
        params["subject_id"] = subject_id
    if type_activity_id:
        conditions.append("a.id_type_activity = :type_activity_id::uuid")
        params["type_activity_id"] = type_activity_id
    if difficulty_level:
        conditions.append("a.difficulty_level = :difficulty_level")
        params["difficulty_level"] = difficulty_level

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY a.title ASC"

    rows = db.execute(text(query), params).fetchall()
    return [_row_to_activity(r) for r in rows]


@router.get("/{activity_id}", response_model=ActivityResponse)
async def obtener_actividad(
    activity_id: str,
    db:          Session = Depends(get_db),
    cu:          TokenData = Depends(get_current_user),
):
    row = db.execute(
        text("""
            SELECT id_activity, id_subject, id_type_activity, title, description,
                difficulty_level, content, estimated_minutes, publication_status,
                thumbnail_url, created_at
            FROM activity WHERE id_activity = :id::uuid
        """),
        {"id": activity_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    return _row_to_activity(row)


@router.put("/{activity_id}", response_model=ActivityResponse)
async def actualizar_actividad(
    activity_id: str,
    data:        ActivityUpdate,
    db:          Session = Depends(get_db),
    cu:          TokenData = Depends(require_role(RolUsuario.admin, RolUsuario.profesional)),
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    set_parts = []
    for k, v in list(updates.items()):
        if k == "content" and v is not None:
            updates[k] = json.dumps(v)
            set_parts.append(f"{k} = :{k}::jsonb")
        elif k in ("difficulty_level", "publication_status") and hasattr(v, "value"):
            updates[k] = v.value
            set_parts.append(f"{k} = :{k}")
        else:
            set_parts.append(f"{k} = :{k}")

    updates["id"] = activity_id
    result = db.execute(
        text(f"UPDATE activity SET {', '.join(set_parts)}, updated_at = NOW() WHERE id_activity = :id::uuid"),
        updates,
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    return await obtener_actividad(activity_id, db, cu)


@router.delete("/{activity_id}", status_code=204)
async def eliminar_actividad(
    activity_id: str,
    db:          Session = Depends(get_db),
    cu:          TokenData = Depends(require_role(RolUsuario.admin)),
):
    result = db.execute(
        text("UPDATE activity SET publication_status = 'archivado' WHERE id_activity = :id::uuid"),
        {"id": activity_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
