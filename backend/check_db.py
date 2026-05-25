"""
Aula Global — Diagnóstico de base de datos y configuración

Verifica:
  1. Variables de entorno (DATABASE_URL, SUPABASE_*, ADMIN_MASTER_KEY)
  2. Conexión a Postgres / Supabase
  3. Que existan las tablas críticas
  4. Que existan las columnas que el código usa (font_size, animation_speed, etc.)
  5. Conexión a Supabase Auth (anon + service role)
  6. Que el admin pueda crear usuarios via service role
  7. Cuenta de registros existentes

Uso:
    cd backend
    python check_db.py
"""

import os
import sys
import traceback

# Cargar .env
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):   print(f"  {GREEN}✓{RESET} {msg}")
def err(msg):  print(f"  {RED}✗{RESET} {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET} {msg}")
def info(msg): print(f"  {BLUE}ℹ{RESET} {msg}")
def section(title):
    print(f"\n{BOLD}── {title} ──{RESET}")


issues = []

# ════════════════════════════════════════════════════════════════
# 1. Variables de entorno
# ════════════════════════════════════════════════════════════════
section("1. Variables de entorno")

env_vars = {
    "DATABASE_URL":         os.getenv("DATABASE_URL"),
    "SUPABASE_URL":         os.getenv("SUPABASE_URL"),
    "SUPABASE_ANON_KEY":    os.getenv("SUPABASE_ANON_KEY"),
    "SUPABASE_SERVICE_KEY": os.getenv("SUPABASE_SERVICE_KEY"),
    "SECRET_KEY":           os.getenv("SECRET_KEY"),
    "ADMIN_MASTER_KEY":     os.getenv("ADMIN_MASTER_KEY"),
}

for name, value in env_vars.items():
    if not value:
        if name in ("SUPABASE_SERVICE_KEY", "ADMIN_MASTER_KEY"):
            warn(f"{name} no configurada (algunos features requieren esta)")
            issues.append(f"Configurar {name} en .env")
        else:
            err(f"{name} NO configurada — CRÍTICO")
            issues.append(f"Configurar {name} en .env")
    else:
        masked = value[:8] + "..." if len(value) > 12 else value
        ok(f"{name} = {masked}")


# ════════════════════════════════════════════════════════════════
# 2. Conexión a Postgres / Supabase
# ════════════════════════════════════════════════════════════════
section("2. Conexión a la base de datos")

db_ok = False
try:
    from sqlalchemy import create_engine, text
    if not env_vars["DATABASE_URL"]:
        err("DATABASE_URL faltante, no se puede conectar")
    else:
        engine = create_engine(env_vars["DATABASE_URL"], pool_pre_ping=True, connect_args={"connect_timeout": 10})
        with engine.connect() as conn:
            v = conn.execute(text("SELECT version()")).scalar()
            ok(f"Conexión exitosa")
            info(f"PostgreSQL: {v[:80]}")
            db_ok = True
except Exception as e:
    err(f"No se pudo conectar: {type(e).__name__}: {e}")
    issues.append("Revisar DATABASE_URL — formato correcto: postgresql://user:pass@host:5432/db")
    if "could not translate host name" in str(e).lower():
        info("Posible causa: nombre de host incorrecto o Supabase project pausado")
    if "could not connect" in str(e).lower() or "timeout" in str(e).lower():
        info("Posible causa: red bloqueada, Supabase pausado, o firewall")


# ════════════════════════════════════════════════════════════════
# 3. Tablas críticas
# ════════════════════════════════════════════════════════════════
if db_ok:
    section("3. Tablas críticas")

    required_tables = [
        "tutor", "professional", "student", "profile",
        "admin_user", "degree", "subject", "activity",
        "type_activity", "type_diagnosis", "type_crisis",
        "initial_diagnosis", "responsible_principal",
        "session", "monitoring", "crisis", "action_rto",
    ]

    try:
        with engine.connect() as conn:
            existing = {r[0] for r in conn.execute(text("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public'
            """)).fetchall()}

            for t in required_tables:
                if t in existing:
                    ok(f"Tabla `{t}` existe")
                else:
                    err(f"Tabla `{t}` NO existe")
                    issues.append(f"Crear tabla `{t}` en Supabase")
    except Exception as e:
        err(f"Error al listar tablas: {e}")


# ════════════════════════════════════════════════════════════════
# 4. Columnas críticas
# ════════════════════════════════════════════════════════════════
if db_ok:
    section("4. Columnas críticas (las que el código usa)")

    required_columns = {
        "tutor":   ["id_tutor", "full_name", "email", "relationship_type", "phone", "is_professional", "is_active", "created_at"],
        "student": ["id_student", "full_name", "birth_date", "id_degree", "account_status", "identity_document", "access_code", "created_at"],
        "professional": ["id_professional", "full_name", "email", "license_number", "speciality", "phone", "verification_status", "is_active"],
        "profile": ["id_profile", "id_student", "volume_level", "visual_contrast", "feedback_type",
                    "font_size", "animation_speed", "max_session_min", "needs_breaks", "break_interval", "is_active"],
        "admin_user": ["id_admin", "full_name", "email", "access_code", "is_active"],
    }

    try:
        with engine.connect() as conn:
            for table, cols in required_columns.items():
                table_cols = {r[0] for r in conn.execute(text("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = :t
                """), {"t": table}).fetchall()}

                if not table_cols:
                    continue  # ya reportamos que la tabla no existe

                missing = [c for c in cols if c not in table_cols]
                if missing:
                    err(f"Tabla `{table}` falta columnas: {', '.join(missing)}")
                    issues.append(f"Ejecutar migration_fix.sql para agregar columnas a `{table}`")
                else:
                    ok(f"Tabla `{table}` tiene todas las columnas requeridas")
    except Exception as e:
        err(f"Error al verificar columnas: {e}")


# ════════════════════════════════════════════════════════════════
# 5. Supabase Auth
# ════════════════════════════════════════════════════════════════
section("5. Supabase Auth")

try:
    from supabase import create_client
    if env_vars["SUPABASE_URL"] and env_vars["SUPABASE_ANON_KEY"]:
        sb = create_client(env_vars["SUPABASE_URL"], env_vars["SUPABASE_ANON_KEY"])
        ok("Cliente anon creado")

        # Probar admin client
        if env_vars["SUPABASE_SERVICE_KEY"]:
            sb_admin = create_client(env_vars["SUPABASE_URL"], env_vars["SUPABASE_SERVICE_KEY"])
            try:
                page = sb_admin.auth.admin.list_users()
                users = page if isinstance(page, list) else getattr(page, "users", [])
                ok(f"Service role válido — {len(users)} usuario(s) en Supabase Auth")
            except Exception as e:
                err(f"Service role FALLA: {e}")
                issues.append("Verificar que SUPABASE_SERVICE_KEY sea la key service_role del proyecto correcto")
        else:
            warn("Sin SUPABASE_SERVICE_KEY — no se podrán auto-confirmar emails ni crear usuarios sin verificación")
            issues.append("Agregar SUPABASE_SERVICE_KEY al .env (Supabase → Settings → API → service_role)")
    else:
        err("SUPABASE_URL o SUPABASE_ANON_KEY faltantes")
except Exception as e:
    err(f"Error con Supabase: {e}")
    info(f"Detalle: {traceback.format_exc().splitlines()[-3:]}")


# ════════════════════════════════════════════════════════════════
# 6. Conteo de registros existentes
# ════════════════════════════════════════════════════════════════
if db_ok:
    section("6. Conteo de registros actuales")

    try:
        with engine.connect() as conn:
            for table in ["tutor", "student", "professional", "admin_user", "profile", "activity"]:
                try:
                    n = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                    info(f"{table:20s} → {n} registros")
                except Exception:
                    pass
    except Exception as e:
        err(f"Error al contar: {e}")


# ════════════════════════════════════════════════════════════════
# 7. Probar INSERT real en tutor (rollback al final)
# ════════════════════════════════════════════════════════════════
if db_ok:
    section("7. Test de INSERT en tabla tutor (con rollback)")

    try:
        with engine.connect() as conn:
            trans = conn.begin()
            try:
                test_email = f"_test_diag_{os.urandom(4).hex()}@example.com"
                conn.execute(text("""
                    INSERT INTO tutor (full_name, relationship_type, email, is_professional, is_active)
                    VALUES ('Test Diagnostic', 'familiar', :email, false, true)
                """), {"email": test_email})
                ok(f"INSERT en tutor: funciona correctamente (email de prueba: {test_email})")
                trans.rollback()  # No queremos dejar el registro
                ok("Rollback aplicado — la BD queda limpia")
            except Exception as e:
                trans.rollback()
                err(f"INSERT en tutor FALLA: {type(e).__name__}: {e}")
                issues.append("INSERT en tutor falla — revisar permisos, columnas, RLS")
    except Exception as e:
        err(f"Error en test de inserción: {e}")


# ════════════════════════════════════════════════════════════════
# RESUMEN
# ════════════════════════════════════════════════════════════════
print(f"\n{BOLD}══════════════════════════════════════{RESET}")
if not issues:
    print(f"{GREEN}{BOLD}✓ Sin problemas detectados{RESET}")
    print("Si el registro sigue fallando, revisa la consola del backend al hacer el request.")
else:
    print(f"{RED}{BOLD}✗ Se encontraron {len(issues)} problemas:{RESET}")
    for i, issue in enumerate(issues, 1):
        print(f"  {i}. {issue}")

print(f"\n{BLUE}Próximos pasos sugeridos:{RESET}")
print("  1. Si faltan columnas → ejecutar `backend/migration_fix.sql` en Supabase SQL Editor")
print("  2. Si SUPABASE_SERVICE_KEY falta → Supabase Dashboard → Settings → API → service_role")
print("  3. Si el proyecto Supabase está pausado → entrar al dashboard y reactivarlo")
print("  4. Iniciar el backend con uvicorn y mirar la consola al hacer el request")
print()
