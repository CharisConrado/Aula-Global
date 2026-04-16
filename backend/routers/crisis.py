"""
Aula Global — Router de crisis
Registro, consulta y resolución de crisis detectadas.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    CrisisCreate,
    CrisisUpdate,
    CrisisResponse,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


@router.post("/", response_model=CrisisResponse, status_code=status.HTTP_201_CREATED)
async def registrar_crisis(
    data: CrisisCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Registra una crisis manualmente (además de las detectadas automáticamente)."""
    result = db.execute(
        text("""
            INSERT INTO crisis (session_id, student_id, nivel, emocion_detectada, descripcion, datos_monitoreo, fecha_inicio)
            VALUES (:session_id, :student_id, :nivel, :emocion_detectada, :descripcion, :datos::jsonb, NOW())
            RETURNING id, session_id, student_id, nivel, emocion_detectada, descripcion,
                resuelta, resolucion, resuelta_por, fecha_inicio, fecha_fin, created_at
        """),
        {
            "session_id": data.session_id,
            "student_id": data.student_id,
            "nivel": data.nivel.value,
            "emocion_detectada": data.emocion_detectada,
            "descripcion": data.descripcion,
            "datos": __import__("json").dumps(data.datos_monitoreo) if data.datos_monitoreo else None,
        },
    )
    db.commit()
    row = result.fetchone()

    return CrisisResponse(
        id=row[0], session_id=row[1], student_id=row[2], nivel=row[3],
        emocion_detectada=row[4], descripcion=row[5], resuelta=row[6],
        resolucion=row[7], resuelta_por=row[8], fecha_inicio=row[9],
        fecha_fin=row[10], created_at=row[11],
    )


@router.get("/", response_model=list[CrisisResponse])
async def listar_crisis(
    student_id: Optional[int] = None,
    session_id: Optional[int] = None,
    resuelta: Optional[bool] = None,
    nivel: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista crisis con filtros opcionales."""
    query = """
        SELECT id, session_id, student_id, nivel, emocion_detectada, descripcion,
            resuelta, resolucion, resuelta_por, fecha_inicio, fecha_fin, created_at
        FROM crisis WHERE 1=1
    """
    params = {}

    if student_id:
        query += " AND student_id = :student_id"
        params["student_id"] = student_id
    if session_id:
        query += " AND session_id = :session_id"
        params["session_id"] = session_id
    if resuelta is not None:
        query += " AND resuelta = :resuelta"
        params["resuelta"] = resuelta
    if nivel:
        query += " AND nivel = :nivel"
        params["nivel"] = nivel

    # Tutores solo ven crisis de sus estudiantes
    if current_user.rol == RolUsuario.tutor:
        query += " AND student_id IN (SELECT id FROM student WHERE tutor_id = :tutor_id)"
        params["tutor_id"] = current_user.user_id

    query += " ORDER BY fecha_inicio DESC LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(query), params).fetchall()

    return [
        CrisisResponse(
            id=r[0], session_id=r[1], student_id=r[2], nivel=r[3],
            emocion_detectada=r[4], descripcion=r[5], resuelta=r[6],
            resolucion=r[7], resuelta_por=r[8], fecha_inicio=r[9],
            fecha_fin=r[10], created_at=r[11],
        )
        for r in rows
    ]


@router.get("/active", response_model=list[CrisisResponse])
async def listar_crisis_activas(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin, RolUsuario.tutor)),
):
    """Lista todas las crisis sin resolver (para panel de profesionales)."""
    query = """
        SELECT c.id, c.session_id, c.student_id, c.nivel, c.emocion_detectada, c.descripcion,
            c.resuelta, c.resolucion, c.resuelta_por, c.fecha_inicio, c.fecha_fin, c.created_at
        FROM crisis c WHERE c.resuelta = false
    """
    params = {}

    if current_user.rol == RolUsuario.tutor:
        query += " AND c.student_id IN (SELECT id FROM student WHERE tutor_id = :tutor_id)"
        params["tutor_id"] = current_user.user_id

    query += " ORDER BY CASE c.nivel WHEN 'grave' THEN 1 WHEN 'moderada' THEN 2 ELSE 3 END, c.fecha_inicio DESC"

    rows = db.execute(text(query), params).fetchall()

    return [
        CrisisResponse(
            id=r[0], session_id=r[1], student_id=r[2], nivel=r[3],
            emocion_detectada=r[4], descripcion=r[5], resuelta=r[6],
            resolucion=r[7], resuelta_por=r[8], fecha_inicio=r[9],
            fecha_fin=r[10], created_at=r[11],
        )
        for r in rows
    ]


@router.get("/{crisis_id}", response_model=CrisisResponse)
async def obtener_crisis(
    crisis_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene una crisis por ID."""
    row = db.execute(
        text("""
            SELECT id, session_id, student_id, nivel, emocion_detectada, descripcion,
                resuelta, resolucion, resuelta_por, fecha_inicio, fecha_fin, created_at
            FROM crisis WHERE id = :id
        """),
        {"id": crisis_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crisis no encontrada")

    return CrisisResponse(
        id=row[0], session_id=row[1], student_id=row[2], nivel=row[3],
        emocion_detectada=row[4], descripcion=row[5], resuelta=row[6],
        resolucion=row[7], resuelta_por=row[8], fecha_inicio=row[9],
        fecha_fin=row[10], created_at=row[11],
    )


@router.put("/{crisis_id}/resolve", response_model=CrisisResponse)
async def resolver_crisis(
    crisis_id: int,
    data: CrisisUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin, RolUsuario.tutor)),
):
    """Marca una crisis como resuelta."""
    result = db.execute(
        text("""
            UPDATE crisis SET
                resuelta = true,
                resolucion = :resolucion,
                resuelta_por = :resuelta_por,
                fecha_fin = NOW()
            WHERE id = :id AND resuelta = false
        """),
        {
            "id": crisis_id,
            "resolucion": data.resolucion,
            "resuelta_por": current_user.user_id,
        },
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crisis no encontrada o ya resuelta")

    return await obtener_crisis(crisis_id, db, current_user)
