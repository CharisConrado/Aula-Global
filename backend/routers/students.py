"""
Aula Global — Router de estudiantes
CRUD completo de estudiantes con gestión de perfiles y diagnósticos.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    StudentCreate,
    StudentUpdate,
    StudentResponse,
    ProfileCreate,
    ProfileUpdate,
    ProfileResponse,
    ProfileHistoryResponse,
    InitialDiagnosisCreate,
    InitialDiagnosisResponse,
    ApprovedValidationCreate,
    ApprovedValidationResponse,
    TokenData,
    RolUsuario,
)
from services.auth_service import get_current_user, require_role, hash_password

router = APIRouter()


# --- CRUD de Estudiantes ---

@router.post("/", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
async def crear_estudiante(
    data: StudentCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """Crea un nuevo estudiante. Solo tutores, profesionales o admins pueden hacerlo."""

    # Verificar que el username no exista
    existing = db.execute(
        text("SELECT id FROM student WHERE username = :username"),
        {"username": data.username},
    ).fetchone()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El nombre de usuario ya está en uso",
        )

    # Verificar que el grado exista
    grado = db.execute(
        text("SELECT id FROM degree WHERE id = :id"),
        {"id": data.grado_id},
    ).fetchone()
    if not grado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El grado especificado no existe",
        )

    hashed = hash_password(data.password)

    result = db.execute(
        text("""
            INSERT INTO student (nombre, apellido, fecha_nacimiento, grado_id, tutor_id, username, password_hash, is_active)
            VALUES (:nombre, :apellido, :fecha_nacimiento, :grado_id, :tutor_id, :username, :password_hash, true)
            RETURNING id, nombre, apellido, fecha_nacimiento, grado_id, tutor_id, username, is_active, created_at
        """),
        {
            "nombre": data.nombre,
            "apellido": data.apellido,
            "fecha_nacimiento": str(data.fecha_nacimiento),
            "grado_id": data.grado_id,
            "tutor_id": data.tutor_id,
            "username": data.username,
            "password_hash": hashed,
        },
    )
    db.commit()
    row = result.fetchone()

    return StudentResponse(
        id=row[0], nombre=row[1], apellido=row[2],
        fecha_nacimiento=row[3], grado_id=row[4], tutor_id=row[5],
        username=row[6], is_active=row[7], created_at=row[8],
    )


@router.get("/", response_model=list[StudentResponse])
async def listar_estudiantes(
    tutor_id: Optional[int] = None,
    grado_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista estudiantes. Los tutores solo ven los suyos."""

    query = "SELECT id, nombre, apellido, fecha_nacimiento, grado_id, tutor_id, username, is_active, created_at FROM student WHERE is_active = true"
    params = {}

    # Los tutores solo ven sus propios estudiantes
    if current_user.rol == RolUsuario.tutor:
        query += " AND tutor_id = :tutor_id"
        params["tutor_id"] = current_user.user_id
    elif tutor_id:
        query += " AND tutor_id = :tutor_id"
        params["tutor_id"] = tutor_id

    if grado_id:
        query += " AND grado_id = :grado_id"
        params["grado_id"] = grado_id

    query += " ORDER BY nombre ASC"
    rows = db.execute(text(query), params).fetchall()

    return [
        StudentResponse(
            id=r[0], nombre=r[1], apellido=r[2], fecha_nacimiento=r[3],
            grado_id=r[4], tutor_id=r[5], username=r[6], is_active=r[7], created_at=r[8],
        )
        for r in rows
    ]


@router.get("/{student_id}", response_model=StudentResponse)
async def obtener_estudiante(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene un estudiante por ID."""
    row = db.execute(
        text("SELECT id, nombre, apellido, fecha_nacimiento, grado_id, tutor_id, username, is_active, created_at FROM student WHERE id = :id AND is_active = true"),
        {"id": student_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")

    # Tutores solo pueden ver sus propios estudiantes
    if current_user.rol == RolUsuario.tutor and row[5] != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a este estudiante")

    return StudentResponse(
        id=row[0], nombre=row[1], apellido=row[2], fecha_nacimiento=row[3],
        grado_id=row[4], tutor_id=row[5], username=row[6], is_active=row[7], created_at=row[8],
    )


@router.put("/{student_id}", response_model=StudentResponse)
async def actualizar_estudiante(
    student_id: int,
    data: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """Actualiza los datos de un estudiante."""
    # Verificar existencia
    existing = db.execute(
        text("SELECT id, tutor_id FROM student WHERE id = :id AND is_active = true"),
        {"id": student_id},
    ).fetchone()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")

    if current_user.rol == RolUsuario.tutor and existing[1] != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes acceso a este estudiante")

    # Construir actualización dinámica
    updates = {}
    if data.nombre is not None:
        updates["nombre"] = data.nombre
    if data.apellido is not None:
        updates["apellido"] = data.apellido
    if data.fecha_nacimiento is not None:
        updates["fecha_nacimiento"] = str(data.fecha_nacimiento)
    if data.grado_id is not None:
        updates["grado_id"] = data.grado_id

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se proporcionaron datos para actualizar")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = student_id

    db.execute(text(f"UPDATE student SET {set_clause} WHERE id = :id"), updates)
    db.commit()

    return await obtener_estudiante(student_id, db, current_user)


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def eliminar_estudiante(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.admin)),
):
    """Desactiva un estudiante (borrado lógico). Solo admins."""
    result = db.execute(
        text("UPDATE student SET is_active = false WHERE id = :id AND is_active = true"),
        {"id": student_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")


# --- Perfiles ---

@router.post("/{student_id}/profile", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def crear_perfil(
    student_id: int,
    data: ProfileCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """Crea el perfil de un estudiante."""
    # Verificar que el estudiante exista
    student = db.execute(
        text("SELECT id FROM student WHERE id = :id AND is_active = true"),
        {"id": student_id},
    ).fetchone()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estudiante no encontrado")

    # Verificar que no tenga ya un perfil
    existing = db.execute(
        text("SELECT id FROM profile WHERE student_id = :sid"),
        {"sid": student_id},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El estudiante ya tiene un perfil")

    result = db.execute(
        text("""
            INSERT INTO profile (
                student_id, sensibilidad_visual, sensibilidad_auditiva, nivel_atencion_base,
                prefiere_formato, tiempo_max_actividad, necesita_pausas, frecuencia_pausas,
                alto_contraste, tamano_fuente, notas_adicionales
            ) VALUES (
                :student_id, :sensibilidad_visual, :sensibilidad_auditiva, :nivel_atencion_base,
                :prefiere_formato, :tiempo_max_actividad, :necesita_pausas, :frecuencia_pausas,
                :alto_contraste, :tamano_fuente, :notas_adicionales
            ) RETURNING id, student_id, sensibilidad_visual, sensibilidad_auditiva, nivel_atencion_base,
                prefiere_formato, tiempo_max_actividad, necesita_pausas, frecuencia_pausas,
                alto_contraste, tamano_fuente, notas_adicionales, created_at, updated_at
        """),
        {
            "student_id": student_id,
            "sensibilidad_visual": data.sensibilidad_visual,
            "sensibilidad_auditiva": data.sensibilidad_auditiva,
            "nivel_atencion_base": data.nivel_atencion_base,
            "prefiere_formato": data.prefiere_formato,
            "tiempo_max_actividad": data.tiempo_max_actividad,
            "necesita_pausas": data.necesita_pausas,
            "frecuencia_pausas": data.frecuencia_pausas,
            "alto_contraste": data.alto_contraste,
            "tamano_fuente": data.tamano_fuente,
            "notas_adicionales": data.notas_adicionales,
        },
    )
    db.commit()
    row = result.fetchone()

    return ProfileResponse(
        id=row[0], student_id=row[1], sensibilidad_visual=row[2],
        sensibilidad_auditiva=row[3], nivel_atencion_base=row[4],
        prefiere_formato=row[5], tiempo_max_actividad=row[6],
        necesita_pausas=row[7], frecuencia_pausas=row[8],
        alto_contraste=row[9], tamano_fuente=row[10],
        notas_adicionales=row[11], created_at=row[12], updated_at=row[13],
    )


@router.get("/{student_id}/profile", response_model=ProfileResponse)
async def obtener_perfil(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene el perfil de un estudiante."""
    row = db.execute(
        text("""
            SELECT id, student_id, sensibilidad_visual, sensibilidad_auditiva, nivel_atencion_base,
                prefiere_formato, tiempo_max_actividad, necesita_pausas, frecuencia_pausas,
                alto_contraste, tamano_fuente, notas_adicionales, created_at, updated_at
            FROM profile WHERE student_id = :sid
        """),
        {"sid": student_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil no encontrado")

    return ProfileResponse(
        id=row[0], student_id=row[1], sensibilidad_visual=row[2],
        sensibilidad_auditiva=row[3], nivel_atencion_base=row[4],
        prefiere_formato=row[5], tiempo_max_actividad=row[6],
        necesita_pausas=row[7], frecuencia_pausas=row[8],
        alto_contraste=row[9], tamano_fuente=row[10],
        notas_adicionales=row[11], created_at=row[12], updated_at=row[13],
    )


@router.put("/{student_id}/profile", response_model=ProfileResponse)
async def actualizar_perfil(
    student_id: int,
    data: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """Actualiza el perfil de un estudiante y guarda historial de cambios."""
    # Obtener perfil actual
    profile = db.execute(
        text("SELECT id, sensibilidad_visual, sensibilidad_auditiva, nivel_atencion_base, prefiere_formato, tiempo_max_actividad, necesita_pausas, frecuencia_pausas, alto_contraste, tamano_fuente, notas_adicionales FROM profile WHERE student_id = :sid"),
        {"sid": student_id},
    ).fetchone()

    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil no encontrado")

    profile_id = profile[0]
    field_names = [
        "sensibilidad_visual", "sensibilidad_auditiva", "nivel_atencion_base",
        "prefiere_formato", "tiempo_max_actividad", "necesita_pausas",
        "frecuencia_pausas", "alto_contraste", "tamano_fuente", "notas_adicionales",
    ]
    current_values = {field_names[i]: profile[i + 1] for i in range(len(field_names))}

    updates = {}
    data_dict = data.model_dump(exclude_unset=True)

    for field, new_val in data_dict.items():
        if field in current_values:
            old_val = current_values[field]
            if str(old_val) != str(new_val):
                updates[field] = new_val
                # Guardar en historial
                db.execute(
                    text("""
                        INSERT INTO profile_history (profile_id, campo_modificado, valor_anterior, valor_nuevo, modificado_por)
                        VALUES (:pid, :campo, :anterior, :nuevo, :mod_por)
                    """),
                    {
                        "pid": profile_id,
                        "campo": field,
                        "anterior": str(old_val) if old_val is not None else None,
                        "nuevo": str(new_val),
                        "mod_por": current_user.user_id,
                    },
                )

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay cambios para aplicar")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["sid"] = student_id
    db.execute(text(f"UPDATE profile SET {set_clause}, updated_at = NOW() WHERE student_id = :sid"), updates)
    db.commit()

    return await obtener_perfil(student_id, db, current_user)


@router.get("/{student_id}/profile/history", response_model=list[ProfileHistoryResponse])
async def obtener_historial_perfil(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Obtiene el historial de cambios del perfil de un estudiante."""
    profile = db.execute(
        text("SELECT id FROM profile WHERE student_id = :sid"),
        {"sid": student_id},
    ).fetchone()

    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil no encontrado")

    rows = db.execute(
        text("""
            SELECT id, profile_id, campo_modificado, valor_anterior, valor_nuevo, modificado_por, fecha_modificacion
            FROM profile_history WHERE profile_id = :pid ORDER BY fecha_modificacion DESC
        """),
        {"pid": profile[0]},
    ).fetchall()

    return [
        ProfileHistoryResponse(
            id=r[0], profile_id=r[1], campo_modificado=r[2],
            valor_anterior=r[3], valor_nuevo=r[4],
            modificado_por=r[5], fecha_modificacion=r[6],
        )
        for r in rows
    ]


# --- Diagnósticos ---

@router.post("/{student_id}/diagnosis", response_model=InitialDiagnosisResponse, status_code=status.HTTP_201_CREATED)
async def crear_diagnostico(
    student_id: int,
    data: InitialDiagnosisCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """Registra un diagnóstico inicial para un estudiante."""
    result = db.execute(
        text("""
            INSERT INTO initial_diagnosis (student_id, type_diagnosis_id, descripcion, fecha_diagnostico, profesional_externo)
            VALUES (:student_id, :type_diagnosis_id, :descripcion, :fecha_diagnostico, :profesional_externo)
            RETURNING id, student_id, type_diagnosis_id, descripcion, fecha_diagnostico, profesional_externo, created_at
        """),
        {
            "student_id": student_id,
            "type_diagnosis_id": data.type_diagnosis_id,
            "descripcion": data.descripcion,
            "fecha_diagnostico": str(data.fecha_diagnostico) if data.fecha_diagnostico else None,
            "profesional_externo": data.profesional_externo,
        },
    )
    db.commit()
    row = result.fetchone()

    return InitialDiagnosisResponse(
        id=row[0], student_id=row[1], type_diagnosis_id=row[2],
        descripcion=row[3], fecha_diagnostico=row[4],
        profesional_externo=row[5], created_at=row[6],
    )


@router.get("/{student_id}/diagnosis", response_model=list[InitialDiagnosisResponse])
async def listar_diagnosticos(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Lista los diagnósticos de un estudiante."""
    rows = db.execute(
        text("""
            SELECT id, student_id, type_diagnosis_id, descripcion, fecha_diagnostico, profesional_externo, created_at
            FROM initial_diagnosis WHERE student_id = :sid ORDER BY created_at DESC
        """),
        {"sid": student_id},
    ).fetchall()

    return [
        InitialDiagnosisResponse(
            id=r[0], student_id=r[1], type_diagnosis_id=r[2],
            descripcion=r[3], fecha_diagnostico=r[4],
            profesional_externo=r[5], created_at=r[6],
        )
        for r in rows
    ]


# --- Validación de diagnóstico ---

@router.post("/{student_id}/validation", response_model=ApprovedValidationResponse, status_code=status.HTTP_201_CREATED)
async def validar_diagnostico(
    student_id: int,
    data: ApprovedValidationCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    """Un profesional interno valida el diagnóstico de un estudiante."""
    result = db.execute(
        text("""
            INSERT INTO approved_validation (student_id, professional_id, diagnosis_id, accepts_camera, notas)
            VALUES (:student_id, :professional_id, :diagnosis_id, :accepts_camera, :notas)
            RETURNING id, student_id, professional_id, diagnosis_id, accepts_camera, notas, fecha_validacion, created_at
        """),
        {
            "student_id": student_id,
            "professional_id": data.professional_id,
            "diagnosis_id": data.diagnosis_id,
            "accepts_camera": data.accepts_camera,
            "notas": data.notas,
        },
    )
    db.commit()
    row = result.fetchone()

    return ApprovedValidationResponse(
        id=row[0], student_id=row[1], professional_id=row[2],
        diagnosis_id=row[3], accepts_camera=row[4], notas=row[5],
        fecha_validacion=row[6], created_at=row[7],
    )
