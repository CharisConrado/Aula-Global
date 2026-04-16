"""
Aula Global — Router de actividades
CRUD de actividades organizadas por grado, materia y tipo.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
import json

from database import get_db
from models.schemas import (
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse,
    SubjectCreate,
    SubjectResponse,
    DegreeResponse,
    TypeActivityResponse,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


# --- Grados ---

@router.get("/degrees", response_model=list[DegreeResponse])
async def listar_grados(db: Session = Depends(get_db)):
    """Lista todos los grados disponibles (1° a 5° primaria)."""
    rows = db.execute(
        text("SELECT id, name, grade_number, created_at FROM degree ORDER BY grade_number ASC")
    ).fetchall()
    return [DegreeResponse(id=r[0], name=r[1], grade_number=r[2], created_at=r[3]) for r in rows]


# --- Tipos de actividad ---

@router.get("/types", response_model=list[TypeActivityResponse])
async def listar_tipos_actividad(db: Session = Depends(get_db)):
    """Lista todos los tipos de actividad disponibles."""
    rows = db.execute(
        text("SELECT id, name, description FROM type_activity ORDER BY name ASC")
    ).fetchall()
    return [TypeActivityResponse(id=r[0], name=r[1], description=r[2]) for r in rows]


# --- Materias ---

@router.post("/subjects", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def crear_materia(
    data: SubjectCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.admin)),
):
    """Crea una nueva materia. Solo admins."""
    result = db.execute(
        text("""
            INSERT INTO subject (name, degree_id, description)
            VALUES (:name, :degree_id, :description)
            RETURNING id, name, degree_id, description, created_at
        """),
        {"name": data.name, "degree_id": data.degree_id, "description": data.description},
    )
    db.commit()
    row = result.fetchone()
    return SubjectResponse(id=row[0], name=row[1], degree_id=row[2], description=row[3], created_at=row[4])


@router.get("/subjects", response_model=list[SubjectResponse])
async def listar_materias(
    degree_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Lista materias, opcionalmente filtradas por grado."""
    query = "SELECT id, name, degree_id, description, created_at FROM subject"
    params = {}
    if degree_id:
        query += " WHERE degree_id = :degree_id"
        params["degree_id"] = degree_id
    query += " ORDER BY name ASC"

    rows = db.execute(text(query), params).fetchall()
    return [SubjectResponse(id=r[0], name=r[1], degree_id=r[2], description=r[3], created_at=r[4]) for r in rows]


# --- Actividades ---

@router.post("/", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def crear_actividad(
    data: ActivityCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.admin, RolUsuario.profesional)),
):
    """Crea una nueva actividad. Solo admins y profesionales."""
    contenido = json.dumps(data.contenido_json) if data.contenido_json else None

    result = db.execute(
        text("""
            INSERT INTO activity (titulo, descripcion, subject_id, type_activity_id, dificultad,
                contenido_json, duracion_estimada, puntos, orden, is_active)
            VALUES (:titulo, :descripcion, :subject_id, :type_activity_id, :dificultad,
                :contenido_json::jsonb, :duracion_estimada, :puntos, :orden, true)
            RETURNING id, titulo, descripcion, subject_id, type_activity_id, dificultad,
                contenido_json, duracion_estimada, puntos, orden, is_active, created_at
        """),
        {
            "titulo": data.titulo,
            "descripcion": data.descripcion,
            "subject_id": data.subject_id,
            "type_activity_id": data.type_activity_id,
            "dificultad": data.dificultad.value,
            "contenido_json": contenido,
            "duracion_estimada": data.duracion_estimada,
            "puntos": data.puntos,
            "orden": data.orden,
        },
    )
    db.commit()
    row = result.fetchone()

    return ActivityResponse(
        id=row[0], titulo=row[1], descripcion=row[2], subject_id=row[3],
        type_activity_id=row[4], dificultad=row[5], contenido_json=row[6],
        duracion_estimada=row[7], puntos=row[8], orden=row[9],
        is_active=row[10], created_at=row[11],
    )


@router.get("/", response_model=list[ActivityResponse])
async def listar_actividades(
    subject_id: Optional[int] = None,
    type_activity_id: Optional[int] = None,
    dificultad: Optional[str] = None,
    degree_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista actividades con filtros opcionales."""
    query = """
        SELECT a.id, a.titulo, a.descripcion, a.subject_id, a.type_activity_id, a.dificultad,
            a.contenido_json, a.duracion_estimada, a.puntos, a.orden, a.is_active, a.created_at
        FROM activity a
    """
    conditions = ["a.is_active = true"]
    params = {}

    if degree_id:
        query += " JOIN subject s ON a.subject_id = s.id"
        conditions.append("s.degree_id = :degree_id")
        params["degree_id"] = degree_id

    if subject_id:
        conditions.append("a.subject_id = :subject_id")
        params["subject_id"] = subject_id

    if type_activity_id:
        conditions.append("a.type_activity_id = :type_activity_id")
        params["type_activity_id"] = type_activity_id

    if dificultad:
        conditions.append("a.dificultad = :dificultad")
        params["dificultad"] = dificultad

    query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY a.orden ASC, a.titulo ASC"

    rows = db.execute(text(query), params).fetchall()

    return [
        ActivityResponse(
            id=r[0], titulo=r[1], descripcion=r[2], subject_id=r[3],
            type_activity_id=r[4], dificultad=r[5], contenido_json=r[6],
            duracion_estimada=r[7], puntos=r[8], orden=r[9],
            is_active=r[10], created_at=r[11],
        )
        for r in rows
    ]


@router.get("/{activity_id}", response_model=ActivityResponse)
async def obtener_actividad(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene una actividad por ID con su contenido completo."""
    row = db.execute(
        text("""
            SELECT id, titulo, descripcion, subject_id, type_activity_id, dificultad,
                contenido_json, duracion_estimada, puntos, orden, is_active, created_at
            FROM activity WHERE id = :id AND is_active = true
        """),
        {"id": activity_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada")

    return ActivityResponse(
        id=row[0], titulo=row[1], descripcion=row[2], subject_id=row[3],
        type_activity_id=row[4], dificultad=row[5], contenido_json=row[6],
        duracion_estimada=row[7], puntos=row[8], orden=row[9],
        is_active=row[10], created_at=row[11],
    )


@router.put("/{activity_id}", response_model=ActivityResponse)
async def actualizar_actividad(
    activity_id: int,
    data: ActivityUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.admin, RolUsuario.profesional)),
):
    """Actualiza una actividad existente."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se proporcionaron datos")

    set_parts = []
    for k, v in updates.items():
        if k == "contenido_json" and v is not None:
            updates[k] = json.dumps(v)
            set_parts.append(f"{k} = :{k}::jsonb")
        elif k == "dificultad" and v is not None:
            updates[k] = v.value if hasattr(v, "value") else v
            set_parts.append(f"{k} = :{k}")
        else:
            set_parts.append(f"{k} = :{k}")

    set_clause = ", ".join(set_parts)
    updates["id"] = activity_id

    result = db.execute(
        text(f"UPDATE activity SET {set_clause} WHERE id = :id AND is_active = true"),
        updates,
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada")

    return await obtener_actividad(activity_id, db, current_user)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_actividad(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.admin)),
):
    """Desactiva una actividad (borrado lógico). Solo admins."""
    result = db.execute(
        text("UPDATE activity SET is_active = false WHERE id = :id AND is_active = true"),
        {"id": activity_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada")
