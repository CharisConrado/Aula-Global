"""
Aula Global — Router de sesiones
Crear, iniciar, cerrar sesiones y gestionar actividades del estudiante.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    SessionCreate,
    SessionResponse,
    SessionClose,
    StudentActivityCreate,
    StudentActivityUpdate,
    StudentActivityResponse,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


@router.post("/", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def crear_sesion(
    data: SessionCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Crea una nueva sesión para un estudiante."""
    # Verificar que el estudiante exista
    student = db.execute(
        text("SELECT id, tutor_id FROM student WHERE id = :id AND is_active = true"),
        {"id": data.student_id},
    ).fetchone()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")

    # Verificar permisos
    if current_user.rol == RolUsuario.tutor and student[1] != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a este estudiante")

    # Cerrar sesiones activas previas del estudiante
    db.execute(
        text("""
            UPDATE session SET is_active = false, fecha_fin = NOW()
            WHERE student_id = :sid AND is_active = true
        """),
        {"sid": data.student_id},
    )

    result = db.execute(
        text("""
            INSERT INTO session (student_id, fecha_inicio, is_active)
            VALUES (:student_id, NOW(), true)
            RETURNING id, student_id, fecha_inicio, fecha_fin, duracion_total,
                actividades_completadas, nota_cuantitativa, nota_cualitativa,
                crisis_ocurridas, intervenciones_realizadas, is_active, created_at
        """),
        {"student_id": data.student_id},
    )
    db.commit()
    row = result.fetchone()

    return SessionResponse(
        id=row[0], student_id=row[1], fecha_inicio=row[2], fecha_fin=row[3],
        duracion_total=row[4], actividades_completadas=row[5],
        nota_cuantitativa=row[6], nota_cualitativa=row[7],
        crisis_ocurridas=row[8], intervenciones_realizadas=row[9],
        is_active=row[10], created_at=row[11],
    )


@router.get("/", response_model=list[SessionResponse])
async def listar_sesiones(
    student_id: Optional[int] = None,
    activa: Optional[bool] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista sesiones con filtros opcionales."""
    query = """
        SELECT id, student_id, fecha_inicio, fecha_fin, duracion_total,
            actividades_completadas, nota_cuantitativa, nota_cualitativa,
            crisis_ocurridas, intervenciones_realizadas, is_active, created_at
        FROM session WHERE 1=1
    """
    params = {}

    if student_id:
        query += " AND student_id = :student_id"
        params["student_id"] = student_id

    if activa is not None:
        query += " AND is_active = :activa"
        params["activa"] = activa

    # Tutores solo ven sesiones de sus estudiantes
    if current_user.rol == RolUsuario.tutor:
        query += " AND student_id IN (SELECT id FROM student WHERE tutor_id = :tutor_id)"
        params["tutor_id"] = current_user.user_id

    # Estudiantes solo ven sus propias sesiones
    if current_user.rol == RolUsuario.estudiante:
        query += " AND student_id = :own_id"
        params["own_id"] = current_user.user_id

    query += " ORDER BY fecha_inicio DESC LIMIT :limit"
    params["limit"] = limit

    rows = db.execute(text(query), params).fetchall()

    return [
        SessionResponse(
            id=r[0], student_id=r[1], fecha_inicio=r[2], fecha_fin=r[3],
            duracion_total=r[4], actividades_completadas=r[5],
            nota_cuantitativa=r[6], nota_cualitativa=r[7],
            crisis_ocurridas=r[8], intervenciones_realizadas=r[9],
            is_active=r[10], created_at=r[11],
        )
        for r in rows
    ]


@router.get("/{session_id}", response_model=SessionResponse)
async def obtener_sesion(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene una sesión por ID."""
    row = db.execute(
        text("""
            SELECT id, student_id, fecha_inicio, fecha_fin, duracion_total,
                actividades_completadas, nota_cuantitativa, nota_cualitativa,
                crisis_ocurridas, intervenciones_realizadas, is_active, created_at
            FROM session WHERE id = :id
        """),
        {"id": session_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada")

    return SessionResponse(
        id=row[0], student_id=row[1], fecha_inicio=row[2], fecha_fin=row[3],
        duracion_total=row[4], actividades_completadas=row[5],
        nota_cuantitativa=row[6], nota_cualitativa=row[7],
        crisis_ocurridas=row[8], intervenciones_realizadas=row[9],
        is_active=row[10], created_at=row[11],
    )


@router.put("/{session_id}/close", response_model=SessionResponse)
async def cerrar_sesion(
    session_id: int,
    data: SessionClose,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Cierra una sesión activa, calculando estadísticas finales."""
    session = db.execute(
        text("SELECT id, student_id, fecha_inicio FROM session WHERE id = :id AND is_active = true"),
        {"id": session_id},
    ).fetchone()

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión activa no encontrada")

    # Calcular estadísticas
    stats = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE completada = true) as completadas,
                AVG(nota) FILTER (WHERE nota IS NOT NULL) as promedio_nota
            FROM student_activity WHERE session_id = :sid
        """),
        {"sid": session_id},
    ).fetchone()

    crisis_count = db.execute(
        text("SELECT COUNT(*) FROM crisis WHERE session_id = :sid"),
        {"sid": session_id},
    ).fetchone()[0]

    intervention_count = db.execute(
        text("SELECT COUNT(*) FROM intervention WHERE crisis_id IN (SELECT id FROM crisis WHERE session_id = :sid)"),
        {"sid": session_id},
    ).fetchone()[0]

    db.execute(
        text("""
            UPDATE session SET
                is_active = false,
                fecha_fin = NOW(),
                duracion_total = EXTRACT(EPOCH FROM (NOW() - fecha_inicio))::int,
                actividades_completadas = :completadas,
                nota_cuantitativa = :promedio,
                nota_cualitativa = :cualitativa,
                crisis_ocurridas = :crisis,
                intervenciones_realizadas = :intervenciones
            WHERE id = :id
        """),
        {
            "id": session_id,
            "completadas": stats[0] or 0,
            "promedio": round(stats[1], 2) if stats[1] else None,
            "cualitativa": data.nota_cualitativa,
            "crisis": crisis_count,
            "intervenciones": intervention_count,
        },
    )
    db.commit()

    return await obtener_sesion(session_id, db, current_user)


# --- Actividades del estudiante dentro de la sesión ---

@router.post("/{session_id}/activities", response_model=StudentActivityResponse, status_code=status.HTTP_201_CREATED)
async def iniciar_actividad(
    session_id: int,
    data: StudentActivityCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Inicia una actividad dentro de una sesión."""
    # Verificar que la sesión esté activa
    session = db.execute(
        text("SELECT id FROM session WHERE id = :id AND is_active = true"),
        {"id": session_id},
    ).fetchone()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión activa no encontrada")

    result = db.execute(
        text("""
            INSERT INTO student_activity (session_id, activity_id, student_id, fecha_inicio)
            VALUES (:session_id, :activity_id, :student_id, NOW())
            RETURNING id, session_id, activity_id, student_id, nota, completada,
                tiempo_dedicado, intentos, formato_usado, stimming_detectado,
                presion_tactil, nivel_atencion_promedio, respuestas_json,
                fecha_inicio, fecha_fin, created_at
        """),
        {
            "session_id": session_id,
            "activity_id": data.activity_id,
            "student_id": data.student_id,
        },
    )
    db.commit()
    row = result.fetchone()

    return StudentActivityResponse(
        id=row[0], session_id=row[1], activity_id=row[2], student_id=row[3],
        nota=row[4], completada=row[5], tiempo_dedicado=row[6], intentos=row[7],
        formato_usado=row[8], stimming_detectado=row[9], presion_tactil=row[10],
        nivel_atencion_promedio=row[11], respuestas_json=row[12],
        fecha_inicio=row[13], fecha_fin=row[14], created_at=row[15],
    )


@router.put("/{session_id}/activities/{activity_record_id}", response_model=StudentActivityResponse)
async def actualizar_actividad(
    session_id: int,
    activity_record_id: int,
    data: StudentActivityUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Actualiza el progreso de una actividad (nota, completada, etc.)."""
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se proporcionaron datos")

    # Si se marca como completada, agregar fecha_fin
    if updates.get("completada"):
        updates["fecha_fin_val"] = True

    set_parts = []
    for k in updates:
        if k == "fecha_fin_val":
            continue
        if k == "respuestas_json":
            set_parts.append(f"{k} = :{k}::jsonb")
        else:
            set_parts.append(f"{k} = :{k}")

    if updates.get("fecha_fin_val"):
        set_parts.append("fecha_fin = NOW()")
        del updates["fecha_fin_val"]

    set_clause = ", ".join(set_parts)
    updates["id"] = activity_record_id
    updates["sid"] = session_id

    # Serializar respuestas_json si existe
    if "respuestas_json" in updates and updates["respuestas_json"] is not None:
        import json
        updates["respuestas_json"] = json.dumps(updates["respuestas_json"])

    result = db.execute(
        text(f"UPDATE student_activity SET {set_clause} WHERE id = :id AND session_id = :sid"),
        updates,
    )
    db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de actividad no encontrado")

    row = db.execute(
        text("""
            SELECT id, session_id, activity_id, student_id, nota, completada,
                tiempo_dedicado, intentos, formato_usado, stimming_detectado,
                presion_tactil, nivel_atencion_promedio, respuestas_json,
                fecha_inicio, fecha_fin, created_at
            FROM student_activity WHERE id = :id
        """),
        {"id": activity_record_id},
    ).fetchone()

    return StudentActivityResponse(
        id=row[0], session_id=row[1], activity_id=row[2], student_id=row[3],
        nota=row[4], completada=row[5], tiempo_dedicado=row[6], intentos=row[7],
        formato_usado=row[8], stimming_detectado=row[9], presion_tactil=row[10],
        nivel_atencion_promedio=row[11], respuestas_json=row[12],
        fecha_inicio=row[13], fecha_fin=row[14], created_at=row[15],
    )


@router.get("/{session_id}/activities", response_model=list[StudentActivityResponse])
async def listar_actividades_sesion(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista todas las actividades realizadas en una sesión."""
    rows = db.execute(
        text("""
            SELECT id, session_id, activity_id, student_id, nota, completada,
                tiempo_dedicado, intentos, formato_usado, stimming_detectado,
                presion_tactil, nivel_atencion_promedio, respuestas_json,
                fecha_inicio, fecha_fin, created_at
            FROM student_activity WHERE session_id = :sid ORDER BY fecha_inicio ASC
        """),
        {"sid": session_id},
    ).fetchall()

    return [
        StudentActivityResponse(
            id=r[0], session_id=r[1], activity_id=r[2], student_id=r[3],
            nota=r[4], completada=r[5], tiempo_dedicado=r[6], intentos=r[7],
            formato_usado=r[8], stimming_detectado=r[9], presion_tactil=r[10],
            nivel_atencion_promedio=r[11], respuestas_json=r[12],
            fecha_inicio=r[13], fecha_fin=r[14], created_at=r[15],
        )
        for r in rows
    ]
