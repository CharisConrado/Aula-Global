"""
Aula Global — Servicio de autenticación
Usa Supabase Auth como primario; si no hay conectividad cae a autenticación
local con bcrypt (almacenada en local_auth.json dentro del directorio backend).
Emite nuestro propio JWT con {sub, email, rol} para los endpoints FastAPI.
"""

import os
import json
import uuid
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from supabase import create_client, Client

from models.schemas import TokenData, RolUsuario

logger = logging.getLogger(__name__)

# ── Bcrypt para auth local ───────────────────────────────────
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Archivo donde se guardan los usuarios locales (desarrollo sin red)
_LOCAL_AUTH_FILE = Path(__file__).parent.parent / "local_auth.json"


def _load_local_auth() -> dict:
    if _LOCAL_AUTH_FILE.exists():
        try:
            return json.loads(_LOCAL_AUTH_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _save_local_auth(data: dict) -> None:
    try:
        _LOCAL_AUTH_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    except Exception as e:
        logger.error(f"[LocalAuth] No se pudo guardar local_auth.json: {e}")


def _is_network_error(msg: str) -> bool:
    """Detecta errores de conectividad con Supabase."""
    msg_lower = msg.lower()
    return any(x in msg_lower for x in [
        "getaddrinfo", "connection refused", "network is unreachable",
        "nodename nor servname", "temporarilyfailed", "name or service not known",
        "failed to establish", "connection error", "connecttimeout",
        "remote end closed", "errno 11001", "errno 111", "errno 110",
    ])

# ── Configuración ────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY    = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

SECRET_KEY                  = os.getenv("SECRET_KEY", "dev-secret-key-cambiar-en-produccion")
ALGORITHM                   = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# ── Clientes Supabase ────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

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

def _auto_confirm_email(user_id: str, email: str) -> None:
    """Marca el email como confirmado en Supabase para que pueda ingresar sin verificar."""
    if not supabase_admin:
        return
    try:
        supabase_admin.auth.admin.update_user_by_id(user_id, {"email_confirm": True})
        logger.info(f"[Auth] Email auto-confirmado: {email}")
    except Exception as e:
        logger.warning(f"[Auth] No se pudo auto-confirmar email para {email}: {e}")


def supabase_register(email: str, password: str) -> str:
    """
    Crea un usuario en Supabase Auth y devuelve su UUID.
    Auto-confirma el email para que pueda ingresar sin verificación previa.
    Si Supabase no es alcanzable (sin red), usa autenticación local con bcrypt.
    """
    # ── Si tenemos admin client, crear usuario ya confirmado directamente ──
    if supabase_admin:
        try:
            admin_res = supabase_admin.auth.admin.create_user({
                "email":         email,
                "password":      password,
                "email_confirm": True,
            })
            if admin_res.user:
                logger.info(f"[Auth] Usuario creado y confirmado vía admin: {email}")
                return str(admin_res.user.id)
        except Exception as admin_err:
            msg = str(admin_err).lower()
            if any(x in msg for x in ["already registered", "already exists", "user already", "email_exists"]):
                raise HTTPException(status_code=409, detail="El correo ya está registrado en el sistema")
            if _is_network_error(msg):
                return _local_register(email, password)
            logger.warning(f"[Auth] admin.create_user falló, usando sign_up: {admin_err}")
            # cae al sign_up regular abajo

    try:
        # ── Intento 2: sign_up (envía correo automáticamente si SMTP está configurado) ──
        res = supabase.auth.sign_up({"email": email, "password": password})

        if res.user:
            logger.info(f"[Auth] Usuario creado en Supabase: {email}")
            _auto_confirm_email(str(res.user.id), email)
            return str(res.user.id)

        # res.user = None → email ya existe en Supabase (anti-enumeración)
        logger.warning(f"[Auth] sign_up devolvió user=None para {email} (posible huérfano)")

    except Exception as e:
        msg = str(e)

        # ── Sin red → auth local ─────────────────────────────────────────
        if _is_network_error(msg):
            return _local_register(email, password)

        # ── Email signups desactivados en Supabase → auth local ──────────
        if "email signups are disabled" in msg.lower() or "signups not allowed" in msg.lower():
            logger.warning(f"[Auth] Email signups desactivados en Supabase, usando auth local para {email}")
            return _local_register(email, password)

        # ── Email duplicado ──────────────────────────────────────────────
        if any(x in msg.lower() for x in [
            "already registered", "already exists", "user already", "email address",
        ]):
            raise HTTPException(status_code=409, detail="El correo ya está registrado en el sistema")

        # ── SMTP no configurado / fallo al enviar correo ─────────────────
        if "sending confirmation email" in msg.lower() or "smtp" in msg.lower():
            logger.warning(f"[Auth] SMTP falló ({msg}), usando admin fallback para {email}")
            if supabase_admin:
                try:
                    page  = supabase_admin.auth.admin.list_users()
                    users = page if isinstance(page, list) else getattr(page, "users", [])
                    for u in users:
                        if getattr(u, "email", None) == email:
                            logger.info(f"[Auth] Usuario encontrado tras fallo SMTP: {u.id}")
                            return str(u.id)
                    admin_res = supabase_admin.auth.admin.create_user({
                        "email": email, "password": password, "email_confirm": False,
                    })
                    if admin_res.user:
                        return str(admin_res.user.id)
                except Exception as admin_err:
                    logger.error(f"[Auth] Admin fallback falló: {admin_err}")
            raise HTTPException(
                status_code=503,
                detail="Cuenta creada pero no pudimos enviar el correo de confirmación.",
            )

        raise HTTPException(status_code=400, detail=f"Error al crear la cuenta: {msg}")

    # ── Recuperar UUID de usuario huérfano ───────────────────────────────
    if supabase_admin:
        try:
            page  = supabase_admin.auth.admin.list_users()
            users = page if isinstance(page, list) else getattr(page, "users", [])
            for u in users:
                if getattr(u, "email", None) == email:
                    uid = str(u.id)
                    logger.info(f"[Auth] Huérfano recuperado: {uid}")
                    try:
                        supabase.auth.resend({"type": "signup", "email": email})
                    except Exception:
                        pass
                    return uid
        except Exception as list_err:
            logger.warning(f"[Auth] list_users falló: {list_err}")

    raise HTTPException(
        status_code=409,
        detail="El correo ya está registrado. Intenta iniciar sesión.",
    )


def _local_register(email: str, password: str) -> str:
    """Registra un usuario localmente (sin Supabase) usando bcrypt."""
    store = _load_local_auth()
    if email in store:
        raise HTTPException(status_code=409, detail="El correo ya está registrado en el sistema")
    uid = str(uuid.uuid4())
    store[email] = {"user_id": uid, "password_hash": _pwd_ctx.hash(password)}
    _save_local_auth(store)
    logger.warning(f"[LocalAuth] Usuario registrado localmente (sin Supabase): {email}")
    return uid


def _local_login(email: str, password: str) -> dict:
    """Verifica credenciales localmente cuando Supabase no está disponible."""
    store = _load_local_auth()
    entry = store.get(email)
    if not entry:
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    if not _pwd_ctx.verify(password, entry["password_hash"]):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    logger.warning(f"[LocalAuth] Login local (sin Supabase): {email}")
    return {"user_id": entry["user_id"], "email": email}


def supabase_login(email: str, password: str) -> dict:
    """
    Autentica con Supabase Auth.
    Si Supabase no es alcanzable, verifica contra el store local.
    """
    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        if res.user:
            return {"user_id": str(res.user.id), "email": res.user.email}
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)

        # ── Sin red o Supabase Auth desactivado → verificar localmente ──
        if _is_network_error(msg) or "email signups are disabled" in msg.lower():
            return _local_login(email, password)

        if "Email not confirmed" in msg or "email_not_confirmed" in msg:
            # ── Auto-confirmar tutores existentes que no verificaron su email ──
            if supabase_admin:
                try:
                    page  = supabase_admin.auth.admin.list_users()
                    users = page if isinstance(page, list) else getattr(page, "users", [])
                    for u in users:
                        if getattr(u, "email", None) == email:
                            supabase_admin.auth.admin.update_user_by_id(
                                str(u.id), {"email_confirm": True}
                            )
                            logger.info(f"[Auth] Email auto-confirmado en login para {email}")
                            # Reintentar login después de confirmar
                            retry = supabase.auth.sign_in_with_password(
                                {"email": email, "password": password}
                            )
                            if retry.user:
                                return {"user_id": str(retry.user.id), "email": retry.user.email}
                            break
                except Exception as auto_err:
                    logger.warning(f"[Auth] Auto-confirmación en login falló: {auto_err}")

            try:
                supabase.auth.resend({"type": "signup", "email": email})
            except Exception:
                pass
            raise HTTPException(
                status_code=403,
                detail=(
                    "Tu correo aún no está confirmado. "
                    "Te hemos reenviado el email de verificación — revisa tu bandeja de entrada "
                    "(y la carpeta de spam)."
                ),
            )
        if "Invalid login" in msg or "invalid" in msg.lower():
            raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
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
