"""
Aula Global — Router de tutores
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.schemas import (
    TutorUpdate, TutorResponse,
    StudentResponse, ResponsiblePrincipalResponse,
    TokenData, RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


def _row_to_tutor(r) -> TutorResponse:
    return TutorResponse(
        id_tutor=str(r[0]), full_name=r[1], email=r[2],
        relationship_type=r[3], phone=r[4],
        is_professional=r[5], is_active=r[6], created_at=r[7],
    )


@router.get("/", response_model=list[TutorResponse])
async def listar_tutores(
    db: Session = Depends(get_db),
    cu: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    rows = db.execute(
        text("""
            SELECT id_tutor, full_name, email, relationship_type, phone,
                   is_professional, is_active, created_at
            FROM tutor WHERE is_active = true ORDER BY full_name ASC
        """)
    ).fetchall()
    return [_row_to_tutor(r) for r in rows]


@router.get("/me", response_model=TutorResponse)
async def mi_perfil(
    db: Session = Depends(get_db),
    cu: TokenData = Depends(require_role(RolUsuario.tutor)),
):
    row = db.execute(
        text("""
            SELECT id_tutor, full_name, email, relationship_type, phone,
                   is_professional, is_active, created_at
            FROM tutor WHERE id_tutor = :id::uuid AND is_active = true
        """),
        {"id": cu.user_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tutor no encontrado")
    return _row_to_tutor(row)


@router.get("/{tutor_id}", response_model=TutorResponse)
async def obtener_tutor(
    tutor_id: str,
    db:       Session = Depends(get_db),
    cu:       TokenData = Depends(get_current_user),
):
    row = db.execute(
        text("""
            SELECT id_tutor, full_name, email, relationship_type, phone,
                   is_professional, is_active, created_at
            FROM tutor WHERE id_tutor = :id::uuid AND is_active = true
        """),
        {"id": tutor_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tutor no encontrado")
    return _row_to_tutor(row)


@router.put("/{tutor_id}", response_model=TutorResponse)
async def actualizar_tutor(
    tutor_id: str,
    data:     TutorUpdate,
    db:       Session = Depends(get_db),
    cu:       TokenData = Depends(get_current_user),
):
    if cu.rol == RolUsuario.tutor and cu.user_id != tutor_id:
        raise HTTPException(status_code=403, detail="Solo puedes modificar tu propio perfil")

    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    # Serializar enum si aplica
    if "relationship_type" in updates and hasattr(updates["relationship_type"], "value"):
        updates["relationship_type"] = updates["relationship_type"].value

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = tutor_id

    result = db.execute(
        text(f"UPDATE tutor SET {set_clause}, updated_at = NOW() WHERE id_tutor = :id::uuid AND is_active = true"),
        updates,
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tutor no encontrado")
    return await obtener_tutor(tutor_id, db, cu)


@router.delete("/{tutor_id}", status_code=204)
async def eliminar_tutor(
    tutor_id: str,
    db:       Session = Depends(get_db),
    cu:       TokenData = Depends(require_role(RolUsuario.admin)),
):
    result = db.execute(
        text("UPDATE tutor SET is_active = false WHERE id_tutor = :id::uuid"),
        {"id": tutor_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tutor no encontrado")


@router.get("/{tutor_id}/students", response_model=list[StudentResponse])
async def estudiantes_del_tutor(
    tutor_id: str,
    db:       Session = Depends(get_db),
    cu:       TokenData = Depends(get_current_user),
):
    if cu.rol == RolUsuario.tutor and cu.user_id != tutor_id:
        raise HTTPException(status_code=403, detail="Solo puedes ver tus propios estudiantes")

    rows = db.execute(
        text("""
            SELECT s.id_student, s.full_name, s.birth_date, s.id_degree,
                   s.account_status, s.avatar_url, s.created_at
            FROM student s
            JOIN responsible_principal rp ON rp.id_student = s.id_student
            WHERE rp.id_tutor = :tid::uuid AND rp.is_active = true
              AND s.account_status != 'suspendido'
            ORDER BY s.full_name ASC
        """),
        {"tid": tutor_id},
    ).fetchall()

    return [
        StudentResponse(
            id_student=str(r[0]), full_name=r[1], birth_date=r[2],
            id_degree=str(r[3]), account_status=r[4],
            avatar_url=r[5], created_at=r[6],
        )
        for r in rows
    ]


@router.post("/{tutor_id}/assign/{student_id}", response_model=ResponsiblePrincipalResponse, status_code=201)
async def asignar_responsable(
    tutor_id:   str,
    student_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """Asigna un tutor como responsable de un estudiante."""
    existing = db.execute(
        text("SELECT id_responsible FROM responsible_principal WHERE id_tutor = :tid::uuid AND id_student = :sid::uuid"),
        {"tid": tutor_id, "sid": student_id},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="La asignación ya existe")

    row = db.execute(
        text("""
            INSERT INTO responsible_principal (id_tutor, id_student, is_active)
            VALUES (:tid::uuid, :sid::uuid, true)
            RETURNING id_responsible, id_tutor, id_student, assigned_date, is_active, created_at
        """),
        {"tid": tutor_id, "sid": student_id},
    ).fetchone()
    db.commit()

    return ResponsiblePrincipalResponse(
        id_responsible=str(row[0]), id_tutor=str(row[1]),
        id_student=str(row[2]), assigned_date=row[3],
        is_active=row[4], created_at=row[5],
    )
