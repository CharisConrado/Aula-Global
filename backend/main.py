"""
Aula Global — Servidor principal FastAPI
Plataforma educativa adaptativa para niños con neurodivergencia (TDAH/TEA)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from routers import (
    auth,
    students,
    tutors,
    sessions,
    activities,
    monitoring,
    crisis,
    interventions,
)

load_dotenv()

app = FastAPI(
    title="Aula Global API",
    description="API para la plataforma educativa adaptativa Aula Global",
    version="1.0.0",
)

# --- CORS ---
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://*.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Routers ---
app.include_router(auth.router, prefix="/api/auth", tags=["Autenticación"])
app.include_router(students.router, prefix="/api/students", tags=["Estudiantes"])
app.include_router(tutors.router, prefix="/api/tutors", tags=["Tutores"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["Sesiones"])
app.include_router(activities.router, prefix="/api/activities", tags=["Actividades"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["Monitoreo"])
app.include_router(crisis.router, prefix="/api/crisis", tags=["Crisis"])
app.include_router(interventions.router, prefix="/api/interventions", tags=["Intervenciones"])


@app.get("/", tags=["Health"])
async def health_check():
    return {"status": "ok", "mensaje": "Aula Global API funcionando correctamente"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
