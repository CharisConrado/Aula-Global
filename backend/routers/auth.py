"""
Aula Global — Router de autenticación
Registro y login para tutores y profesionales usando Supabase Auth.
(Los estudiantes no tienen login propio — son gestionados por sus tutores.)
"""

import os
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.schemas import (
    LoginRequest,
    RegisterTutorRequest,
    RegisterProfessionalRequest,
    StudentLoginRequest,
    TokenResponse,
    RolUsuario,
    TokenData,
    RegisterAdminRequest,
    AdminLoginRequest,
)
from services.auth_service import (
    supabase_register,
    supabase_login,
    create_access_token,
    get_current_user,
    supabase_admin,
)

router = APIRouter()


# ── Registro de tutor ────────────────────────────────────────

@router.post("/register/tutor", response_model=TokenResponse, status_code=201)
async def register_tutor(data: RegisterTutorRequest, db: Session = Depends(get_db)):
    """Registra un nuevo tutor (familiar / profesional externo / cuidador)."""

    # Verificar email duplicado en la tabla tutor
    existing = db.execute(
        text("SELECT id_tutor FROM tutor WHERE email = :email"),
        {"email": data.email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya está registrado como tutor")

    # Crear usuario en Supabase Auth
    supabase_uid = supabase_register(data.email, data.password)

    # Crear registro en la tabla tutor
    try:
        row = db.execute(
            text("""
                INSERT INTO tutor (full_name, relationship_type, email, phone, is_professional, is_active)
                VALUES (:full_name, :relationship_type, :email, :phone, :is_professional, true)
                RETURNING id_tutor
            """),
            {
                "full_name":         data.full_name,
                "relationship_type": data.relationship_type or "familiar",
                "email":             data.email,
                "phone":             data.phone,
                "is_professional":   False,
            },
        ).fetchone()
        db.commit()
    except Exception as db_err:
        # Si el INSERT en BD falla, eliminar el usuario de Supabase Auth para evitar huérfanos
        if supabase_admin and supabase_uid:
            try:
                supabase_admin.auth.admin.delete_user(supabase_uid)
            except Exception:
                pass
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar el tutor en la base de datos: {db_err}")

    id_tutor = str(row[0])
    token = create_access_token({"sub": id_tutor, "email": data.email, "rol": RolUsuario.tutor.value})

    return TokenResponse(access_token=token, rol=RolUsuario.tutor, user_id=id_tutor)


# ── Registro de profesional ──────────────────────────────────

@router.post("/register/professional", response_model=TokenResponse, status_code=201)
async def register_professional(data: RegisterProfessionalRequest, db: Session = Depends(get_db)):
    """Registra un nuevo profesional interno de Aula Global."""

    existing = db.execute(
        text("SELECT id_professional FROM professional WHERE email = :email"),
        {"email": data.email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya está registrado como profesional")

    supabase_uid = supabase_register(data.email, data.password)

    try:
        row = db.execute(
            text("""
                INSERT INTO professional (full_name, license_number, speciality, email, phone, is_active, verification_status)
                VALUES (:full_name, :license_number, :speciality, :email, :phone, true, 'pendiente')
                RETURNING id_professional
            """),
            {
                "full_name":      data.full_name,
                # NULL en lugar de "" para no violar el UNIQUE constraint en license_number
                "license_number": data.license_number if data.license_number else None,
                "speciality":     data.resolved_speciality or None,
                "email":          data.email,
                "phone":          data.phone or None,
            },
        ).fetchone()
        db.commit()
    except Exception as db_err:
        # Si el INSERT en BD falla, eliminar el usuario de Supabase Auth
        if supabase_admin and supabase_uid:
            try:
                supabase_admin.auth.admin.delete_user(supabase_uid)
            except Exception:
                pass
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar el profesional en la base de datos: {db_err}")

    id_prof = str(row[0])
    token = create_access_token({"sub": id_prof, "email": data.email, "rol": RolUsuario.profesional.value})

    return TokenResponse(access_token=token, rol=RolUsuario.profesional, user_id=id_prof)


# ── Login universal ──────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: Session = Depends(get_db)):
    """
    Login para tutores y profesionales.
    1) Verifica contraseña con Supabase Auth.
    2) Busca el registro correspondiente en tutor o professional.
    3) Devuelve nuestro JWT con rol y UUID.
    """
    # Verificar contraseña vía Supabase Auth
    supabase_login(data.email, data.password)

    # Buscar en tutor primero
    tutor = db.execute(
        text("SELECT id_tutor FROM tutor WHERE email = :email AND is_active = true"),
        {"email": data.email},
    ).fetchone()
    if tutor:
        id_tutor = str(tutor[0])
        token = create_access_token({"sub": id_tutor, "email": data.email, "rol": RolUsuario.tutor.value})
        return TokenResponse(access_token=token, rol=RolUsuario.tutor, user_id=id_tutor)

    # Buscar en professional
    prof = db.execute(
        text("SELECT id_professional FROM professional WHERE email = :email AND is_active = true"),
        {"email": data.email},
    ).fetchone()
    if prof:
        id_prof = str(prof[0])
        token = create_access_token({"sub": id_prof, "email": data.email, "rol": RolUsuario.profesional.value})
        return TokenResponse(access_token=token, rol=RolUsuario.profesional, user_id=id_prof)

    raise HTTPException(status_code=404, detail="Usuario no encontrado en la plataforma")


# ── Login estudiante (documento + código) ───────────────────

@router.post("/login/student", response_model=TokenResponse)
async def login_student(data: StudentLoginRequest, db: Session = Depends(get_db)):
    """
    Login para estudiantes usando documento de identidad + código de acceso
    generado por la plataforma al momento de su registro.
    """
    row = db.execute(
        text("""
            SELECT id_student, full_name, access_code
            FROM student
            WHERE identity_document = :doc AND account_status = 'activo'
        """),
        {"doc": data.identity_document},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Documento de identidad no encontrado")

    if row[2] != data.access_code:
        raise HTTPException(status_code=401, detail="Código de acceso incorrecto")

    id_student = str(row[0])
    full_name  = row[1]

    token = create_access_token({
        "sub":   id_student,
        "email": full_name,   # usamos el nombre como identificador en el token
        "rol":   RolUsuario.estudiante.value,
    })

    return TokenResponse(
        access_token=token,
        rol=RolUsuario.estudiante,
        user_id=id_student,
    )


# ── Login OAuth2 (Swagger UI) ────────────────────────────────

@router.post("/login/form", response_model=TokenResponse)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login con formulario estándar OAuth2 (para Swagger /docs)."""
    return await login(LoginRequest(email=form_data.username, password=form_data.password), db)


import random, string
ADMIN_MASTER_KEY = os.getenv("ADMIN_MASTER_KEY", "aulaglobal-admin-2026")

def _gen_code(n=8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=n))

# ── Registro de administrador ────────────────────────────────
@router.post("/register/admin", status_code=201)
async def register_admin(data: "RegisterAdminRequest", db: Session = Depends(get_db)):
    """Crea un nuevo administrador. Requiere la clave maestra del sistema."""
    from models.schemas import RegisterAdminRequest as _Req
    if data.master_key != ADMIN_MASTER_KEY:
        raise HTTPException(status_code=403, detail="Clave maestra incorrecta")

    existing = db.execute(
        text("SELECT id_admin FROM admin_user WHERE email = :email"),
        {"email": data.email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya está registrado como administrador")

    access_code = _gen_code()
    try:
        row = db.execute(
            text("""
                INSERT INTO admin_user (full_name, email, access_code, is_active)
                VALUES (:full_name, :email, :access_code, true)
                RETURNING id_admin
            """),
            {"full_name": data.full_name, "email": data.email, "access_code": access_code},
        ).fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al crear el administrador: {e}")

    id_admin = str(row[0])
    token = create_access_token({"sub": id_admin, "email": data.email, "rol": RolUsuario.admin.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "rol": RolUsuario.admin.value,
        "user_id": id_admin,
        "access_code": access_code,   # mostrar solo al crear
    }


# ── Login de administrador ───────────────────────────────────
@router.post("/login/admin")
async def login_admin(data: "AdminLoginRequest", db: Session = Depends(get_db)):
    """Login para administradores usando email + código de acceso."""
    from models.schemas import AdminLoginRequest as _Req
    row = db.execute(
        text("""
            SELECT id_admin FROM admin_user
            WHERE email = :email AND access_code = :code AND is_active = true
        """),
        {"email": data.email, "code": data.access_code.upper()},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Correo o código de acceso incorrecto")

    id_admin = str(row[0])
    token = create_access_token({"sub": id_admin, "email": data.email, "rol": RolUsuario.admin.value})
    return {
        "access_token": token,
        "token_type": "bearer",
        "rol": RolUsuario.admin.value,
        "user_id": id_admin,
    }


# ── Me ───────────────────────────────────────────────────────

@router.get("/me")
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """Devuelve los datos del usuario autenticado."""
    return {
        "user_id": current_user.user_id,
        "email":   current_user.email,
        "rol":     current_user.rol,
    }


# ────────────────────────────────────────────────────────────
# REGISTROS ADMIN-PROTEGIDOS
# (admin crea cuentas sin obtener token de la nueva cuenta)
# ────────────────────────────────────────────────────────────

from services.auth_service import require_role


@router.post("/admin/create-tutor", status_code=201)
async def admin_create_tutor(
    data: RegisterTutorRequest,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(require_role(RolUsuario.admin)),
):
    """Admin crea una cuenta de tutor. Devuelve el tutor creado (sin token)."""
    existing = db.execute(
        text("SELECT id_tutor FROM tutor WHERE email = :email"),
        {"email": data.email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya está registrado como tutor")

    supabase_uid = supabase_register(data.email, data.password)
    try:
        row = db.execute(
            text("""
                INSERT INTO tutor (full_name, relationship_type, email, phone, is_professional, is_active)
                VALUES (:full_name, :relationship_type, :email, :phone, false, true)
                RETURNING id_tutor, full_name, email, relationship_type, phone, is_professional, is_active, created_at
            """),
            {
                "full_name":         data.full_name,
                "relationship_type": data.relationship_type or "familiar",
                "email":             data.email,
                "phone":             data.phone,
            },
        ).fetchone()
        db.commit()
    except Exception as db_err:
        if supabase_admin and supabase_uid:
            try: supabase_admin.auth.admin.delete_user(supabase_uid)
            except Exception: pass
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar el tutor: {db_err}")

    return {
        "id_tutor":          str(row[0]),
        "full_name":         row[1],
        "email":             row[2],
        "relationship_type": row[3],
        "phone":             row[4],
        "is_professional":   row[5],
        "is_active":         row[6],
        "created_at":        row[7].isoformat() if row[7] else None,
    }


@router.post("/admin/create-professional", status_code=201)
async def admin_create_professional(
    data: RegisterProfessionalRequest,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(require_role(RolUsuario.admin)),
):
    """Admin crea una cuenta de profesional interno."""
    existing = db.execute(
        text("SELECT id_professional FROM professional WHERE email = :email"),
        {"email": data.email},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="El correo ya está registrado como profesional")

    supabase_uid = supabase_register(data.email, data.password)
    try:
        row = db.execute(
            text("""
                INSERT INTO professional (full_name, license_number, speciality, email, phone, is_active, verification_status)
                VALUES (:full_name, :license_number, :speciality, :email, :phone, true, 'aprobado')
                RETURNING id_professional, full_name, email, license_number, speciality, phone, verification_status, is_active, created_at
            """),
            {
                "full_name":      data.full_name,
                "license_number": data.license_number if data.license_number else None,
                "speciality":     data.resolved_speciality or None,
                "email":          data.email,
                "phone":          data.phone or None,
            },
        ).fetchone()
        db.commit()
    except Exception as db_err:
        if supabase_admin and supabase_uid:
            try: supabase_admin.auth.admin.delete_user(supabase_uid)
            except Exception: pass
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar el profesional: {db_err}")

    return {
        "id_professional":     str(row[0]),
        "full_name":           row[1],
        "email":               row[2],
        "license_number":      row[3] or "",
        "speciality":          row[4] or "",
        "phone":               row[5],
        "verification_status": row[6],
        "is_active":           row[7],
        "created_at":          row[8].isoformat() if row[8] else None,
    }
