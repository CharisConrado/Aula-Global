"""
Aula Global — Servicio de autenticación
Usa Supabase Auth para gestión de contraseñas (las tablas no tienen password_hash).
Emite nuestro propio JWT con {sub, email, rol} para los endpoints FastAPI.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from supabase import create_client, Client

from models.schemas import TokenData, RolUsuario

# ── Configuración ────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY    = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

SECRET_KEY                  = os.getenv("SECRET_KEY", "dev-secret-key-cambiar-en-produccion")
ALGORITHM                   = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# ── Clientes Supabase ────────────────────────────────────────
# Cliente anon — para sign_in y sign_up de usuarios normales
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Cliente admin — para crear usuarios con email confirmado automáticamente
supabase_admin: Optional[Client] = (
    create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    if SUPABASE_SERVICE_KEY else None
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── JWT propio ───────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea nuestro JWT con {sub, email, rol}."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenData:
    """Decodifica y valida nuestro JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        sub:   str = payload.get("sub")
        email: str = payload.get("email")
        rol:   str = payload.get("rol")
        if not sub or not email or not rol:
            raise HTTPException(status_code=401, detail="Token inválido: faltan campos")
        return TokenData(user_id=sub, email=email, rol=RolUsuario(rol))
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


# ── Supabase Auth ────────────────────────────────────────────

def supabase_register(email: str, password: str) -> str:
    """
    Crea un usuario en Supabase Auth.
    Devuelve el UUID del usuario creado.
    Usa el cliente admin (service key) para confirmar el email automáticamente.
    """
    try:
        if supabase_admin:
            # Con service key: email confirmado automáticamente
            res = supabase_admin.auth.admin.create_user({
                "email": email,
                "password": password,
                "email_confirm": True,
            })
            return str(res.user.id)
        else:
            # Sin service key: el usuario debe confirmar email
            res = supabase.auth.sign_up({"email": email, "password": password})
            if res.user:
                return str(res.user.id)
            raise HTTPException(status_code=400, detail="No se pudo crear el usuario en Supabase Auth")
    except Exception as e:
        msg = str(e)
        if "already registered" in msg or "already exists" in msg:
            raise HTTPException(status_code=409, detail="El correo ya está registrado")
        raise HTTPException(status_code=400, detail=f"Error en Supabase Auth: {msg}")


def supabase_login(email: str, password: str) -> dict:
    """
    Autentica con Supabase Auth.
    Devuelve {user_id, email} si es correcto; lanza HTTPException si falla.
    """
    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        if res.user:
            return {"user_id": str(res.user.id), "email": res.user.email}
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    except Exception as e:
        msg = str(e)
        if "Invalid login" in msg or "invalid" in msg.lower():
            raise HTTPException(status_code=401, detail="Credenciales incorrectas")
        raise HTTPException(status_code=401, detail=f"Error de autenticación: {msg}")


# ── Dependencias FastAPI ─────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
) -> TokenData:
    """Obtiene el usuario actual desde nuestro JWT."""
    return decode_token(token)


def require_role(*roles: RolUsuario):
    """Dependencia que verifica que el usuario tenga uno de los roles indicados."""
    async def checker(
        current_user: TokenData = Depends(get_current_user),
    ) -> TokenData:
        if current_user.rol not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Acceso denegado. Roles permitidos: {', '.join(r.value for r in roles)}",
            )
        return current_user
    return checker
