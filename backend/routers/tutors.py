"""
Aula Global — Router de tutores
CRUD de tutores y asignación a estudiantes.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.schemas import (
    TutorUpdate,
    TutorResponse,
    StudentResponse,
    ResponsiblePrincipalBase,
    ResponsiblePrincipalResponse,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


@router.get("/", response_model=list[TutorResponse])
async def listar_tutores(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """Lista todos los tutores activos. Solo profesionales y admins."""
    rows = db.execute(
        text("""
            SELECT id, nombre, apellido, email, telefono, es_profesional, relacion, is_active, created_at
            FROM tutor WHERE is_active = true ORDER BY nombre ASC
        """)
    ).fetchall()

    return [
        TutorResponse(
            id=r[0], nombre=r[1], apellido=r[2], email=r[3],
            telefono=r[4], es_profesional=r[5], relacion=r[6],
            is_active=r[7], created_at=r[8],
        )
        for r in rows
    ]


@router.get("/me", response_model=TutorResponse)
async def obtener_mi_perfil(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.tutor)),
):
    """Obtiene el perfil del tutor autenticado."""
    row = db.execute(
        text("""
            SELECT id, nombre, apellido, email, telefono, es_profesional, relacion, is_active, created_at
            FROM tutor WHERE id = :id AND is_active = true
        """),
        {"id": current_user.user_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor no encontrado")

    return TutorResponse(
        id=row[0], nombre=row[1], apellido=row[2], email=row[3],
        telefono=row[4], es_profesional=row[5], relacion=row[6],
        is_active=row[7], created_at=row[8],
    )


@router.get("/{tutor_id}", response_model=TutorResponse)
async def obtener_tutor(
    tutor_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene un tutor por ID."""
    row = db.execute(
        text("""
            SELECT id, nombre, apellido, email, telefono, es_profesional, relacion, is_active, created_at
            FROM tutor WHERE id = :id AND is_active = true
        """),
        {"id": tutor_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor no encontrado")

    return TutorResponse(
        id=row[0], nombre=row[1], apellido=row[2], email=row[3],
        telefono=row[4], es_profesional=row[5], relacion=row[6],
        is_active=row[7], created_at=row[8],
    )


@router.put("/{tutor_id}", response_model=TutorResponse)
async def actualizar_tutor(
    tutor_id: int,
    data: TutorUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Actualiza los datos de un tutor. Solo el propio tutor o un admin."""
    if current_user.rol == RolUsuario.tutor and current_user.user_id != tutor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo puedes actualizar tu propio perfil")

    updates = {}
    data_dict = data.model_dump(exclude_unset=True)
    for k, v in data_dict.items():
        if v is not None:
            updates[k] = v

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se proporcionaron datos para actualizar")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = tutor_id

    result = db.execute(
        text(f"UPDATE tutor SET {set_clause} WHERE id = :id AND is_active = true"),
        updates,
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor no encontrado")

    return await obtener_tutor(tutor_id, db, current_user)


@router.delete("/{tutor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_tutor(
    tutor_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.admin)),
):
    """Desactiva un tutor (borrado lógico). Solo admins."""
    result = db.execute(
        text("UPDATE tutor SET is_active = false WHERE id = :id AND is_active = true"),
        {"id": tutor_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor no encontrado")


@router.get("/{tutor_id}/students", response_model=list[StudentResponse])
async def listar_estudiantes_del_tutor(
    tutor_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista los estudiantes asignados a un tutor."""
    if current_user.rol == RolUsuario.tutor and current_user.user_id != tutor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo puedes ver tus propios estudiantes")

    rows = db.execute(
        text("""
            SELECT id, nombre, apellido, fecha_nacimiento, grado_id, tutor_id, username, is_active, created_at
            FROM student WHERE tutor_id = :tid AND is_active = true ORDER BY nombre ASC
        """),
        {"tid": tutor_id},
    ).fetchall()

    return [
        StudentResponse(
            id=r[0], nombre=r[1], apellido=r[2], fecha_nacimiento=r[3],
            grado_id=r[4], tutor_id=r[5], username=r[6], is_active=r[7], created_at=r[8],
        )
        for r in rows
    ]


# --- Responsable principal ---

@router.post("/{tutor_id}/assign/{student_id}", response_model=ResponsiblePrincipalResponse, status_code=status.HTTP_201_CREATED)
async def asignar_responsable(
    tutor_id: int,
    student_id: int,
    es_principal: bool = True,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """Asigna un tutor como responsable de un estudiante."""
    # Verificar existencia de ambos
    tutor = db.execute(text("SELECT id FROM tutor WHERE id = :id AND is_active = true"), {"id": tutor_id}).fetchone()
    student = db.execute(text("SELECT id FROM student WHERE id = :id AND is_active = true"), {"id": student_id}).fetchone()

    if not tutor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tutor no encontrado")
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")

    # Verificar que no exista ya la asignación
    existing = db.execute(
        text("SELECT id FROM responsible_principal WHERE tutor_id = :tid AND student_id = :sid"),
        {"tid": tutor_id, "sid": student_id},
    ).fetchone()

    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta asignación ya existe")

    result = db.execute(
        text("""
            INSERT INTO responsible_principal (student_id, tutor_id, es_principal)
            VALUES (:sid, :tid, :es_principal)
            RETURNING id, student_id, tutor_id, es_principal, created_at
        """),
        {"sid": student_id, "tid": tutor_id, "es_principal": es_principal},
    )
    db.commit()
    row = result.fetchone()

    return ResponsiblePrincipalResponse(
        id=row[0], student_id=row[1], tutor_id=row[2],
        es_principal=row[3], created_at=row[4],
    )
