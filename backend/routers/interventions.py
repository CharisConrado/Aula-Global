"""
Aula Global — Router de intervenciones
Creación y gestión de intervenciones por crisis o consulta externa.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    InterventionCreate,
    InterventionUpdate,
    InterventionResponse,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


@router.post("/", response_model=InterventionResponse, status_code=status.HTTP_201_CREATED)
async def crear_intervencion(
    data: InterventionCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin, RolUsuario.tutor)),
):
    """Crea una nueva intervención (por crisis o consulta externa)."""
    # Si es por crisis, verificar que la crisis exista
    if data.crisis_id:
        crisis = db.execute(
            text("SELECT id FROM crisis WHERE id = :id"),
            {"id": data.crisis_id},
        ).fetchone()
        if not crisis:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crisis no encontrada")

    result = db.execute(
        text("""
            INSERT INTO intervention (crisis_id, student_id, professional_id, tipo, descripcion, fecha_inicio)
            VALUES (:crisis_id, :student_id, :professional_id, :tipo, :descripcion, NOW())
            RETURNING id, crisis_id, student_id, professional_id, tipo, descripcion,
                completada, notas, resultado, fecha_inicio, fecha_fin, created_at
        """),
        {
            "crisis_id": data.crisis_id,
            "student_id": data.student_id,
            "professional_id": data.professional_id or (
                current_user.user_id if current_user.rol == RolUsuario.profesional else None
            ),
            "tipo": data.tipo.value,
            "descripcion": data.descripcion,
        },
    )
    db.commit()
    row = result.fetchone()

    return InterventionResponse(
        id=row[0], crisis_id=row[1], student_id=row[2], professional_id=row[3],
        tipo=row[4], descripcion=row[5], completada=row[6], notas=row[7],
        resultado=row[8], fecha_inicio=row[9], fecha_fin=row[10], created_at=row[11],
    )


@router.get("/", response_model=list[InterventionResponse])
async def listar_intervenciones(
    student_id: Optional[int] = None,
    tipo: Optional[str] = None,
    completada: Optional[bool] = None,
    professional_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista intervenciones con filtros opcionales."""
    query = """
        SELECT id, crisis_id, student_id, professional_id, tipo, descripcion,
            completada, notas, resultado, fecha_inicio, fecha_fin, created_at
        FROM intervention WHERE 1=1
    """
    params = {}

    if student_id:
        query += " AND student_id = :student_id"
        params["student_id"] = student_id
    if tipo:
        query += " AND tipo = :tipo"
        params["tipo"] = tipo
    if completada is not None:
        query += " AND completada = :completada"
        params["completada"] = completada
    if professional_id:
        query += " AND professional_id = :professional_id"
        params["professional_id"] = professional_id

    # Tutores solo ven intervenciones de sus estudiantes
    if current_user.rol == RolUsuario.tutor:
        query += " AND student_id IN (SELECT id FROM student WHERE tutor_id = :tutor_id)"
        params["tutor_id"] = current_user.user_id

    query += " ORDER BY fecha_inicio DESC LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(query), params).fetchall()

    return [
        InterventionResponse(
            id=r[0], crisis_id=r[1], student_id=r[2], professional_id=r[3],
            tipo=r[4], descripcion=r[5], completada=r[6], notas=r[7],
            resultado=r[8], fecha_inicio=r[9], fecha_fin=r[10], created_at=r[11],
        )
        for r in rows
    ]


@router.get("/pending", response_model=list[InterventionResponse])
async def listar_intervenciones_pendientes(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """Lista intervenciones pendientes (para profesionales)."""
    rows = db.execute(
        text("""
            SELECT id, crisis_id, student_id, professional_id, tipo, descripcion,
                completada, notas, resultado, fecha_inicio, fecha_fin, created_at
            FROM intervention
            WHERE completada = false
            ORDER BY
                CASE tipo WHEN 'crisis_grave' THEN 1 WHEN 'crisis_leve' THEN 2
                    WHEN 'seguimiento' THEN 3 ELSE 4 END,
                fecha_inicio ASC
        """)
    ).fetchall()

    return [
        InterventionResponse(
            id=r[0], crisis_id=r[1], student_id=r[2], professional_id=r[3],
            tipo=r[4], descripcion=r[5], completada=r[6], notas=r[7],
            resultado=r[8], fecha_inicio=r[9], fecha_fin=r[10], created_at=r[11],
        )
        for r in rows
    ]


@router.get("/{intervention_id}", response_model=InterventionResponse)
async def obtener_intervencion(
    intervention_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene una intervención por ID."""
    row = db.execute(
        text("""
            SELECT id, crisis_id, student_id, professional_id, tipo, descripcion,
                completada, notas, resultado, fecha_inicio, fecha_fin, created_at
            FROM intervention WHERE id = :id
        """),
        {"id": intervention_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intervención no encontrada")

    return InterventionResponse(
        id=row[0], crisis_id=row[1], student_id=row[2], professional_id=row[3],
        tipo=row[4], descripcion=row[5], completada=row[6], notas=row[7],
        resultado=row[8], fecha_inicio=row[9], fecha_fin=row[10], created_at=row[11],
    )


@router.put("/{intervention_id}", response_model=InterventionResponse)
async def actualizar_intervencion(
    intervention_id: int,
    data: InterventionUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """Actualiza una intervención (completar, agregar notas, resultado)."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se proporcionaron datos")

    set_parts = [f"{k} = :{k}" for k in updates]

    if updates.get("completada"):
        set_parts.append("fecha_fin = NOW()")

    set_clause = ", ".join(set_parts)
    updates["id"] = intervention_id

    result = db.execute(
        text(f"UPDATE intervention SET {set_clause} WHERE id = :id"),
        updates,
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Intervención no encontrada")

    return await obtener_intervencion(intervention_id, db, current_user)


@router.post("/request-external", response_model=InterventionResponse, status_code=status.HTTP_201_CREATED)
async def solicitar_consulta_externa(
    student_id: int,
    descripcion: str = "Consulta externa solicitada",
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional)),
):
    """Solicita una consulta externa sin que haya una crisis activa."""
    # Buscar un profesional disponible
    profesional = db.execute(
        text("SELECT id FROM professional WHERE is_active = true ORDER BY id ASC LIMIT 1")
    ).fetchone()

    result = db.execute(
        text("""
            INSERT INTO intervention (student_id, professional_id, tipo, descripcion, fecha_inicio)
            VALUES (:student_id, :professional_id, 'consulta_externa', :descripcion, NOW())
            RETURNING id, crisis_id, student_id, professional_id, tipo, descripcion,
                completada, notas, resultado, fecha_inicio, fecha_fin, created_at
        """),
        {
            "student_id": student_id,
            "professional_id": profesional[0] if profesional else None,
            "descripcion": descripcion,
        },
    )
    db.commit()
    row = result.fetchone()

    return InterventionResponse(
        id=row[0], crisis_id=row[1], student_id=row[2], professional_id=row[3],
        tipo=row[4], descripcion=row[5], completada=row[6], notas=row[7],
        resultado=row[8], fecha_inicio=row[9], fecha_fin=row[10], created_at=row[11],
    )
