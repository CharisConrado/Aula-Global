"""
Aula Global — Servidor principal FastAPI
Plataforma educativa adaptativa para niños con neurodivergencia (TDAH/TEA)
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from routers import (
    auth,
    students,
    tutors,
    professionals,
    sessions,
    activities,
    monitoring,
    crisis,
    interventions,
    reports,
    sesiones_asistidas,
)

load_dotenv()


def _run_migrations():
    """Migraciones automáticas al arrancar — idempotentes (IF NOT EXISTS / DROP IF EXISTS)."""
    try:
        from database import engine
        from sqlalchemy import text as _text
        with engine.connect() as conn:
            # Ampliar el constraint de verification_status para aceptar los 3 estados
            conn.execute(_text("""
                ALTER TABLE professional
                    DROP CONSTRAINT IF EXISTS professional_verification_status_check
            """))
            conn.execute(_text("""
                ALTER TABLE professional
                    ADD CONSTRAINT professional_verification_status_check
                    CHECK (verification_status IN ('pendiente', 'aprobado', 'rechazado'))
            """))
            # Nuevas columnas en sesion_asistida (idempotentes)
            conn.execute(_text("""
                ALTER TABLE sesion_asistida
                    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ
            """))
            conn.execute(_text("""
                ALTER TABLE sesion_asistida
                    ADD COLUMN IF NOT EXISTS professional_notes TEXT
            """))
            conn.commit()
    except Exception as e:
        print(f"[migration] advertencia: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="Aula Global API",
    description="API para la plataforma educativa adaptativa Aula Global",
    version="1.0.0",
)

# --- CORS ---
# allow_origins=["*"] permite cualquier dispositivo desde cualquier red.
# La seguridad real la proveen los JWT tokens en cada endpoint.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # debe ser False cuando allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(auth.router, prefix="/api/auth", tags=["Autenticación"])
app.include_router(students.router, prefix="/api/students", tags=["Estudiantes"])
app.include_router(tutors.router, prefix="/api/tutors", tags=["Tutores"])
app.include_router(professionals.router, prefix="/api/professionals", tags=["Profesionales"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["Sesiones"])
app.include_router(activities.router, prefix="/api/activities", tags=["Actividades"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["Monitoreo"])
app.include_router(crisis.router, prefix="/api/crisis", tags=["Crisis"])
app.include_router(interventions.router,      prefix="/api/interventions",       tags=["Intervenciones"])
app.include_router(reports.router,            prefix="/api/reports",             tags=["Reportes"])
app.include_router(sesiones_asistidas.router, prefix="/api/assisted-sessions",  tags=["Sesiones Asistidas"])

# --- Archivos subidos (diagnósticos, etc.) ---
_UPLOADS_DIR = Path(__file__).parent / "uploads"
_UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")


@app.get("/", tags=["Health"])
async def health_check():
    return {"status": "ok", "mensaje": "Aula Global API funcionando correctamente"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
