"""
Aula Global — Router de autenticación
Registro y login para tutores y profesionales usando Supabase Auth.
(Los estudiantes no tienen login propio — son gestionados por sus tutores.)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.schemas import (
    LoginRequest,
    RegisterTutorRequest,
    RegisterProfessionalRequest,
    TokenResponse,
    RolUsuario,
    TokenData,
)
from services.auth_service import (
    supabase_register,
    supabase_login,
    create_access_token,
    get_current_user,
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
    supabase_register(data.email, data.password)

    # Crear registro en la tabla tutor
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

    supabase_register(data.email, data.password)

    row = db.execute(
        text("""
            INSERT INTO professional (full_name, license_number, speciality, email, phone, is_active, verification_status)
            VALUES (:full_name, :license_number, :speciality, :email, :phone, true, 'pendiente')
            RETURNING id_professional
        """),
        {
            "full_name":      data.full_name,
            "license_number": data.license_number or "",
            "speciality":     data.resolved_speciality or "",
            "email":          data.email,
            "phone":          data.phone,
        },
    ).fetchone()
    db.commit()

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


# ── Login OAuth2 (Swagger UI) ────────────────────────────────

@router.post("/login/form", response_model=TokenResponse)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login con formulario estándar OAuth2 (para Swagger /docs)."""
    return await login(LoginRequest(email=form_data.username, password=form_data.password), db)


# ── Me ───────────────────────────────────────────────────────

@router.get("/me")
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """Devuelve los datos del usuario autenticado."""
    return {
        "user_id": current_user.user_id,
        "email":   current_user.email,
        "rol":     current_user.rol,
    }
