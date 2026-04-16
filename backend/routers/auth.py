"""
Aula Global — Router de autenticación
Registro y login con JWT para los 4 roles del sistema.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.schemas import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    RolUsuario,
    TokenData,
)
from services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """Registra un nuevo usuario según su rol."""

    # Verificar que el email no exista en la tabla correspondiente
    table_map = {
        RolUsuario.estudiante: None,  # Los estudiantes se registran desde el tutor
        RolUsuario.tutor: "tutor",
        RolUsuario.profesional: "professional",
        RolUsuario.admin: "professional",
    }

    if data.rol == RolUsuario.estudiante:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Los estudiantes se registran a través del tutor, no directamente",
        )

    table = table_map[data.rol]

    # Verificar email duplicado
    existing = db.execute(
        text(f"SELECT id FROM {table} WHERE email = :email"),
        {"email": data.email},
    ).fetchone()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un usuario registrado con este correo electrónico",
        )

    hashed = hash_password(data.password)

    if data.rol in (RolUsuario.profesional, RolUsuario.admin):
        result = db.execute(
            text("""
                INSERT INTO professional (nombre, apellido, email, password_hash, is_active, rol)
                VALUES (:nombre, :apellido, :email, :password_hash, true, :rol)
                RETURNING id
            """),
            {
                "nombre": data.nombre,
                "apellido": data.apellido,
                "email": data.email,
                "password_hash": hashed,
                "rol": data.rol.value,
            },
        )
    else:
        result = db.execute(
            text("""
                INSERT INTO tutor (nombre, apellido, email, password_hash, es_profesional, is_active)
                VALUES (:nombre, :apellido, :email, :password_hash, false, true)
                RETURNING id
            """),
            {
                "nombre": data.nombre,
                "apellido": data.apellido,
                "email": data.email,
                "password_hash": hashed,
            },
        )

    db.commit()
    user_id = result.fetchone()[0]

    token = create_access_token(
        data={"sub": user_id, "email": data.email, "rol": data.rol.value}
    )

    return TokenResponse(
        access_token=token,
        rol=data.rol,
        user_id=user_id,
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Inicia sesión y devuelve un token JWT."""

    # Buscar en todas las tablas de usuarios
    tables = [
        ("tutor", "tutor"),
        ("professional", None),  # Rol se determina por campo 'rol' en la tabla
        ("student", "estudiante"),
    ]

    for table, default_rol in tables:
        if table == "student":
            row = db.execute(
                text(f"SELECT id, password_hash, username FROM {table} WHERE username = :email AND is_active = true"),
                {"email": data.email},
            ).fetchone()
        else:
            row = db.execute(
                text(f"SELECT id, password_hash{', rol' if table == 'professional' else ''} FROM {table} WHERE email = :email AND is_active = true"),
                {"email": data.email},
            ).fetchone()

        if row and verify_password(data.password, row[1]):
            user_id = row[0]

            if table == "professional":
                rol = row[2] if row[2] else "profesional"
            elif table == "student":
                rol = "estudiante"
            else:
                rol = default_rol

            token = create_access_token(
                data={"sub": user_id, "email": data.email, "rol": rol}
            )
            return TokenResponse(
                access_token=token,
                rol=RolUsuario(rol),
                user_id=user_id,
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales incorrectas",
    )


@router.get("/me")
async def get_me(current_user: TokenData = Depends(get_current_user)):
    """Devuelve los datos del usuario autenticado."""
    return {
        "user_id": current_user.user_id,
        "email": current_user.email,
        "rol": current_user.rol,
    }


@router.post("/login/form", response_model=TokenResponse)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Login con formulario OAuth2 (para documentación interactiva de Swagger)."""
    return await login(
        LoginRequest(email=form_data.username, password=form_data.password),
        db,
    )
