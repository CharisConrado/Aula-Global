"""
Aula Global — Servicio de autenticación
Manejo de JWT, hashing de contraseñas y verificación de roles.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.schemas import TokenData, RolUsuario

SECRET_KEY = os.getenv("SECRET_KEY", "aula-global-secret-key-cambiar-en-produccion")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    """Genera un hash bcrypt de la contraseña."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica una contraseña contra su hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea un token JWT con los datos proporcionados."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenData:
    """Decodifica y valida un token JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        email: str = payload.get("email")
        rol: str = payload.get("rol")
        if user_id is None or email is None or rol is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido: faltan campos requeridos",
            )
        return TokenData(user_id=user_id, email=email, rol=RolUsuario(rol))
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
        )


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> TokenData:
    """Obtiene el usuario actual a partir del token JWT."""
    token_data = decode_token(token)

    # Verificar que el usuario siga existiendo en la tabla correspondiente
    table_map = {
        RolUsuario.estudiante: "student",
        RolUsuario.tutor: "tutor",
        RolUsuario.profesional: "professional",
        RolUsuario.admin: "professional",
    }
    table = table_map.get(token_data.rol)
    if table:
        result = db.execute(
            text(f"SELECT id FROM {table} WHERE id = :id AND is_active = true"),
            {"id": token_data.user_id},
        ).fetchone()
        if not result:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuario no encontrado o inactivo",
            )
    return token_data


def require_role(*roles: RolUsuario):
    """Decorador de dependencia que requiere uno o más roles específicos."""
    async def role_checker(
        current_user: TokenData = Depends(get_current_user),
    ) -> TokenData:
        if current_user.rol not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado. Se requiere rol: {', '.join(r.value for r in roles)}",
            )
        return current_user
    return role_checker
