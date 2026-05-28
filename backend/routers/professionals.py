"""
Aula Global — Router de profesionales internos
Permite al admin y al propio profesional gestionar las cuentas.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models.schemas import ProfessionalResponse, TokenData, RolUsuario
from services.auth_service import get_current_user, require_role

router = APIRouter()


# ── Schema de actualización ──────────────────────────────────
class ProfessionalUpdate(BaseModel):
    full_name:           Optional[str] = None
    license_number:      Optional[str] = None
    speciality:          Optional[str] = None
    phone:               Optional[str] = None
    verification_status: Optional[str] = None   # 'pendiente' | 'aprobado' | 'rechazado'


def _row_to_prof(r) -> ProfessionalResponse:
    return ProfessionalResponse(
        id_professional=str(r[0]), full_name=r[1], email=r[2],
        license_number=r[3] or "", speciality=r[4] or "",
        phone=r[5], verification_status=r[6],
        is_active=r[7], created_at=r[8],
    )


# ── Profesionales disponibles (sin sesión asistida activa) ───
@router.get("/available", response_model=list[ProfessionalResponse])
async def profesionales_disponibles(
    db: Session = Depends(get_db),
    cu: TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.admin)),
):
    """
    Devuelve los profesionales activos que NO tienen una sesión asistida
    pendiente, aceptada o en_curso. Si la tabla aún no existe, devuelve todos.
    """
    try:
        rows = db.execute(text("""
            SELECT id_professional, full_name, email, license_number, speciality,
                   phone, verification_status, is_active, created_at
            FROM professional
            WHERE is_active = true
              AND id_professional NOT IN (
                  SELECT id_professional
                  FROM sesion_asistida
                  WHERE status IN ('pendiente', 'aceptada', 'en_curso')
              )
            ORDER BY speciality ASC, full_name ASC
        """)).fetchall()
    except Exception:
        # Fallback: tabla sesion_asistida aún no existe
        rows = db.execute(text("""
            SELECT id_professional, full_name, email, license_number, speciality,
                   phone, verification_status, is_active, created_at
            FROM professional
            WHERE is_active = true
            ORDER BY speciality ASC, full_name ASC
        """)).fetchall()
    return [_row_to_prof(r) for r in rows]


# ── Listar todos los profesionales ────────────────────────────
@router.get("/", response_model=list[ProfessionalResponse])
async def listar_profesionales(
    db: Session = Depends(get_db),
    cu: TokenData = Depends(require_role(RolUsuario.admin, RolUsuario.profesional)),
):
    rows = db.execute(text("""
        SELECT id_professional, full_name, email, license_number, speciality,
               phone, verification_status, is_active, created_at
        FROM professional
        WHERE is_active = true
        ORDER BY full_name ASC
    """)).fetchall()
    return [_row_to_prof(r) for r in rows]


# ── Obtener uno ──────────────────────────────────────────────
@router.get("/{prof_id}", response_model=ProfessionalResponse)
async def obtener_profesional(
    prof_id: str,
    db: Session = Depends(get_db),
    cu: TokenData = Depends(get_current_user),
):
    row = db.execute(text("""
        SELECT id_professional, full_name, email, license_number, speciality,
               phone, verification_status, is_active, created_at
        FROM professional
        WHERE id_professional = CAST(:id AS uuid)
    """), {"id": prof_id}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profesional no encontrado")
    return _row_to_prof(row)


# ── Actualizar ──────────────────────────────────────────────
@router.put("/{prof_id}", response_model=ProfessionalResponse)
async def actualizar_profesional(
    prof_id: str,
    data: ProfessionalUpdate,
    db: Session = Depends(get_db),
    cu: TokenData = Depends(get_current_user),
):
    # Profesionales solo pueden editarse a sí mismos
    if cu.rol == RolUsuario.profesional and cu.user_id != prof_id:
        raise HTTPException(status_code=403, detail="Solo puedes modificar tu propio perfil")
    # Admins pueden editar a cualquiera
    if cu.rol not in (RolUsuario.admin, RolUsuario.profesional):
        raise HTTPException(status_code=403, detail="No autorizado")

    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = prof_id
    result = db.execute(
        text(f"UPDATE professional SET {set_clause}, updated_at = NOW() WHERE id_professional = CAST(:id AS uuid)"),
        updates,
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Profesional no encontrado")
    return await obtener_profesional(prof_id, db, cu)


# ── Eliminar (soft delete) ──────────────────────────────────
@router.delete("/{prof_id}", status_code=204)
async def eliminar_profesional(
    prof_id: str,
    db: Session = Depends(get_db),
    cu: TokenData = Depends(require_role(RolUsuario.admin)),
):
    result = db.execute(
        text("UPDATE professional SET is_active = false WHERE id_professional = CAST(:id AS uuid)"),
        {"id": prof_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Profesional no encontrado")
