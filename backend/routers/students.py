"""
Aula Global — Router de estudiantes
CRUD de estudiantes, perfiles y diagnósticos.
Columnas ajustadas al schema real de Supabase.
"""

import json
import os
import secrets
import string
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database import get_db
from models.schemas import (
    StudentCreate, StudentUpdate, StudentResponse,
    ProfileCreate, ProfileCreatePayload, ProfileUpdate, ProfileResponse, ProfileHistoryResponse,
    InitialDiagnosisCreate, InitialDiagnosisResponse,
    ApprovedValidationCreate, ApprovedValidationResponse,
    ResponsiblePrincipalResponse,
    TokenData, RolUsuario,
)
from services.auth_service import get_current_user, require_role

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

def _generate_access_code(length: int = 8) -> str:
    """Genera un código alfanumérico legible (sin 0, O, I, l para evitar confusión)."""
    alphabet = string.ascii_uppercase.replace("O", "").replace("I", "") + \
               string.digits.replace("0", "")
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _row_to_student(r, include_code: bool = False) -> StudentResponse:
    # Columnas base: id_student, full_name, birth_date, id_degree, account_status,
    #                avatar_url, created_at, identity_document, access_code
    return StudentResponse(
        id_student=str(r[0]),  full_name=r[1],      birth_date=r[2],
        id_degree=str(r[3]),   account_status=r[4], avatar_url=r[5],
        created_at=r[6],
        identity_document=r[7] if len(r) > 7 else None,
        # access_code solo se devuelve al crear el estudiante
        access_code=r[8] if (include_code and len(r) > 8) else None,
    )

def _row_to_profile(r) -> ProfileResponse:
    return ProfileResponse(
        id_profile=str(r[0]), id_student=str(r[1]),
        volume_level=r[2], visual_contrast=r[3], feedback_type=r[4],
        font_size=r[5], animation_speed=r[6], max_session_min=r[7],
        needs_breaks=r[8], break_interval=r[9],
        is_active=r[10], start_date=r[11], created_at=r[12],
    )


# ── CRUD Estudiantes ─────────────────────────────────────────

@router.post("/admin-create", response_model=StudentResponse, status_code=201)
async def admin_crear_estudiante(
    data:     StudentCreate,
    tutor_id: str,
    db:       Session = Depends(get_db),
    cu:       TokenData = Depends(require_role(RolUsuario.admin)),
):
    """Admin crea un estudiante y lo asigna explícitamente a un tutor existente."""
    # Validar tutor
    t = db.execute(
        text("SELECT 1 FROM tutor WHERE id_tutor = CAST(:tid AS uuid) AND is_active = true"),
        {"tid": tutor_id},
    ).fetchone()
    if not t:
        raise HTTPException(status_code=404, detail="Tutor no encontrado")

    # Verificar documento duplicado
    existing_doc = db.execute(
        text("SELECT id_student FROM student WHERE identity_document = :doc"),
        {"doc": data.identity_document},
    ).fetchone()
    if existing_doc:
        raise HTTPException(status_code=409, detail="Ya existe un estudiante con ese documento")

    # Validar grado
    degree = db.execute(
        text("SELECT 1 FROM degree WHERE id_degree = CAST(:id AS uuid)"),
        {"id": data.id_degree},
    ).fetchone()
    if not degree:
        raise HTTPException(status_code=404, detail="Grado no encontrado")

    access_code = _generate_access_code()
    row = db.execute(
        text("""
            INSERT INTO student (full_name, birth_date, id_degree, account_status,
                                 identity_document, access_code)
            VALUES (:full_name, :birth_date, CAST(:id_degree AS uuid), 'activo',
                    :identity_document, :access_code)
            RETURNING id_student, full_name, birth_date, id_degree, account_status,
                      avatar_url, created_at, identity_document, access_code
        """),
        {
            "full_name":         data.full_name,
            "birth_date":        str(data.birth_date),
            "id_degree":         data.id_degree,
            "identity_document": data.identity_document,
            "access_code":       access_code,
        },
    ).fetchone()
    id_student = str(row[0])

    # Crear asignación tutor ↔ estudiante
    db.execute(
        text("""
            INSERT INTO responsible_principal (id_tutor, id_student, is_active)
            VALUES (CAST(:tid AS uuid), CAST(:sid AS uuid), true)
        """),
        {"tid": tutor_id, "sid": id_student},
    )

    db.commit()
    return _row_to_student(row, include_code=True)


@router.post("/", response_model=StudentResponse, status_code=201)
async def crear_estudiante(
    data: StudentCreate,
    db:   Session = Depends(get_db),
    cu:   TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """
    Crea un estudiante, lo asigna al tutor que lo registra (si aplica)
    y crea su perfil sensorial inicial en la misma transacción.
    Si no se entrega `profile`, se usa uno por defecto.
    """
    # Verificar documento de identidad duplicado
    existing_doc = db.execute(
        text("SELECT id_student FROM student WHERE identity_document = :doc"),
        {"doc": data.identity_document},
    ).fetchone()
    if existing_doc:
        raise HTTPException(status_code=409, detail="Ya existe un estudiante con ese documento de identidad")

    # Verificar que el grado exista
    degree = db.execute(
        text("SELECT id_degree FROM degree WHERE id_degree = :id"),
        {"id": data.id_degree},
    ).fetchone()
    if not degree:
        raise HTTPException(status_code=404, detail="Grado no encontrado")

    access_code = _generate_access_code()

    # ── Paso CRÍTICO: Insertar estudiante (debe funcionar SÍ o SÍ) ──
    try:
        row = db.execute(
            text("""
                INSERT INTO student (full_name, birth_date, id_degree, account_status,
                                     identity_document, access_code)
                VALUES (:full_name, :birth_date, CAST(:id_degree AS uuid), 'activo',
                        :identity_document, :access_code)
                RETURNING id_student, full_name, birth_date, id_degree, account_status,
                          avatar_url, created_at, identity_document, access_code
            """),
            {
                "full_name":         data.full_name,
                "birth_date":        str(data.birth_date),
                "id_degree":         data.id_degree,
                "identity_document": data.identity_document,
                "access_code":       access_code,
            },
        ).fetchone()

        id_student = str(row[0])

        # Si el que registra es tutor, crear relación responsible_principal
        if cu.rol == RolUsuario.tutor:
            db.execute(
                text("""
                    INSERT INTO responsible_principal (id_tutor, id_student)
                    VALUES (CAST(:id_tutor AS uuid), CAST(:id_student AS uuid))
                """),
                {"id_tutor": cu.user_id, "id_student": id_student},
            )

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        # Loguear con más detalle para diagnóstico
        import logging
        logging.error(f"[crear_estudiante] FALLO al insertar estudiante: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear estudiante: {e}")

    # ── Paso NO FATAL: Crear perfil sensorial ──
    # Si falla, el estudiante igual queda creado.
    try:
        prof = data.profile or ProfileCreatePayload()
        db.execute(
            text("""
                INSERT INTO profile (id_student, volume_level, visual_contrast, feedback_type,
                    font_size, animation_speed, max_session_min, needs_breaks, break_interval, is_active)
                VALUES (CAST(:id_student AS uuid), :volume_level, :visual_contrast, :feedback_type,
                    :font_size, :animation_speed, :max_session_min, :needs_breaks, :break_interval, true)
            """),
            {
                "id_student":      id_student,
                "volume_level":    prof.volume_level,
                "visual_contrast": prof.visual_contrast,
                "feedback_type":   prof.feedback_type,
                "font_size":       prof.font_size,
                "animation_speed": prof.animation_speed,
                "max_session_min": prof.max_session_min,
                "needs_breaks":    prof.needs_breaks,
                "break_interval":  prof.break_interval,
            },
        )
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logging.warning(f"[crear_estudiante] Perfil sensorial no se pudo crear (no fatal): {type(e).__name__}: {e}")
        # No rompemos — el estudiante ya está. El tutor podrá crear el perfil después.

    # include_code=True para devolver el código al tutor en el momento del registro
    return _row_to_student(row, include_code=True)


@router.get("/", response_model=list[StudentResponse])
async def listar_estudiantes(
    tutor_id:  Optional[str] = None,
    degree_id: Optional[str] = None,
    db:        Session = Depends(get_db),
    cu:        TokenData = Depends(get_current_user),
):
    """Lista estudiantes. Los tutores solo ven los suyos (vía responsible_principal)."""
    if cu.rol == RolUsuario.tutor:
        # Filtrar por los estudiantes asignados a este tutor
        query = """
            SELECT s.id_student, s.full_name, s.birth_date, s.id_degree,
                   s.account_status, s.avatar_url, s.created_at,
                   s.identity_document, s.access_code
            FROM student s
            JOIN responsible_principal rp ON rp.id_student = s.id_student
            WHERE rp.id_tutor = CAST(:tutor_id AS uuid) AND rp.is_active = true
              AND s.account_status != 'suspendido'
        """
        params: dict = {"tutor_id": cu.user_id}
        if degree_id:
            query += " AND s.id_degree = CAST(:degree_id AS uuid)"
            params["degree_id"] = degree_id
    else:
        query = """
            SELECT id_student, full_name, birth_date, id_degree,
                   account_status, avatar_url, created_at,
                   identity_document, access_code
            FROM student WHERE account_status != 'suspendido'
        """
        params = {}
        if tutor_id:
            query = """
                SELECT s.id_student, s.full_name, s.birth_date, s.id_degree,
                       s.account_status, s.avatar_url, s.created_at,
                       s.identity_document, s.access_code
                FROM student s
                JOIN responsible_principal rp ON rp.id_student = s.id_student
                WHERE rp.id_tutor = CAST(:tutor_id AS uuid) AND rp.is_active = true
            """
            params["tutor_id"] = tutor_id
        if degree_id:
            query += " AND s.id_degree = CAST(:degree_id AS uuid)" if tutor_id else " AND id_degree = CAST(:degree_id AS uuid)"
            params["degree_id"] = degree_id

    query += " ORDER BY full_name ASC"
    rows = db.execute(text(query), params).fetchall()
    return [_row_to_student(r) for r in rows]


@router.get("/{student_id}", response_model=StudentResponse)
async def obtener_estudiante(
    student_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    row = db.execute(
        text("""
            SELECT id_student, full_name, birth_date, id_degree,
                   account_status, avatar_url, created_at,
                   identity_document, access_code
            FROM student WHERE id_student = CAST(:id AS uuid)
        """),
        {"id": student_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")

    # Tutores solo pueden ver sus propios estudiantes
    if cu.rol == RolUsuario.tutor:
        rel = db.execute(
            text("SELECT 1 FROM responsible_principal WHERE id_tutor = CAST(:tid AS uuid) AND id_student = CAST(:sid AS uuid) AND is_active = true"),
            {"tid": cu.user_id, "sid": student_id},
        ).fetchone()
        if not rel:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudiante")

    return _row_to_student(row)


@router.put("/{student_id}", response_model=StudentResponse)
async def actualizar_estudiante(
    student_id: str,
    data:       StudentUpdate,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Sin datos para actualizar")

    # Castear UUIDs
    set_parts = []
    for k in list(updates):
        if k == "id_degree":
            set_parts.append(f"{k} = CAST(:{k} AS uuid)")
        elif k == "birth_date":
            updates[k] = str(updates[k])
            set_parts.append(f"{k} = :{k}")
        elif k == "account_status":
            updates[k] = updates[k].value if hasattr(updates[k], "value") else updates[k]
            set_parts.append(f"{k} = :{k}")
        else:
            set_parts.append(f"{k} = :{k}")

    updates["id"] = student_id
    db.execute(
        text(f"UPDATE student SET {', '.join(set_parts)}, updated_at = NOW() WHERE id_student = CAST(:id AS uuid)"),
        updates,
    )
    db.commit()
    return await obtener_estudiante(student_id, db, cu)


@router.delete("/{student_id}", status_code=204)
async def eliminar_estudiante(
    student_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.admin)),
):
    # Tutores solo pueden eliminar sus propios estudiantes
    if cu.rol == RolUsuario.tutor:
        rel = db.execute(
            text("SELECT 1 FROM responsible_principal WHERE id_tutor = CAST(:tid AS uuid) AND id_student = CAST(:sid AS uuid) AND is_active = true"),
            {"tid": cu.user_id, "sid": student_id},
        ).fetchone()
        if not rel:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudiante")

    result = db.execute(
        text("UPDATE student SET account_status = 'suspendido' WHERE id_student = CAST(:id AS uuid)"),
        {"id": student_id},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")


# ── Perfil ───────────────────────────────────────────────────

@router.post("/{student_id}/profile", response_model=ProfileResponse, status_code=201)
async def crear_perfil(
    student_id: str,
    data:       ProfileCreate,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    existing = db.execute(
        text("SELECT id_profile FROM profile WHERE id_student = CAST(:sid AS uuid) AND is_active = true"),
        {"sid": student_id},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=409, detail="El estudiante ya tiene un perfil activo")

    row = db.execute(
        text("""
            INSERT INTO profile (id_student, volume_level, visual_contrast, feedback_type,
                font_size, animation_speed, max_session_min, needs_breaks, break_interval, is_active)
            VALUES (CAST(:id_student AS uuid), :volume_level, :visual_contrast, :feedback_type,
                :font_size, :animation_speed, :max_session_min, :needs_breaks, :break_interval, true)
            RETURNING id_profile, id_student, volume_level, visual_contrast, feedback_type,
                font_size, animation_speed, max_session_min, needs_breaks, break_interval,
                is_active, start_date, created_at
        """),
        {
            "id_student":      student_id,
            "volume_level":    data.volume_level,
            "visual_contrast": data.visual_contrast,
            "feedback_type":   data.feedback_type,
            "font_size":       data.font_size,
            "animation_speed": data.animation_speed,
            "max_session_min": data.max_session_min,
            "needs_breaks":    data.needs_breaks,
            "break_interval":  data.break_interval,
        },
    ).fetchone()
    db.commit()
    return _row_to_profile(row)


@router.get("/{student_id}/profile", response_model=ProfileResponse)
async def obtener_perfil(
    student_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    row = db.execute(
        text("""
            SELECT id_profile, id_student, volume_level, visual_contrast, feedback_type,
                font_size, animation_speed, max_session_min, needs_breaks, break_interval,
                is_active, start_date, created_at
            FROM profile WHERE id_student = CAST(:sid AS uuid) AND is_active = true
            ORDER BY start_date DESC LIMIT 1
        """),
        {"sid": student_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return _row_to_profile(row)


@router.put("/{student_id}/profile", response_model=ProfileResponse)
async def actualizar_perfil(
    student_id: str,
    data:       ProfileUpdate,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    # Obtener perfil actual
    profile = db.execute(
        text("""
            SELECT id_profile, volume_level, visual_contrast, feedback_type, font_size,
                animation_speed, max_session_min, needs_breaks, break_interval
            FROM profile WHERE id_student = CAST(:sid AS uuid) AND is_active = true
            ORDER BY start_date DESC LIMIT 1
        """),
        {"sid": student_id},
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    id_profile = str(profile[0])
    fields     = ["volume_level","visual_contrast","feedback_type","font_size",
                  "animation_speed","max_session_min","needs_breaks","break_interval"]
    old_data   = {fields[i]: profile[i+1] for i in range(len(fields))}
    updates    = data.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(status_code=400, detail="Sin cambios para aplicar")

    new_data_snapshot = {**old_data, **updates}

    # Guardar historial
    db.execute(
        text("""
            INSERT INTO profile_history (id_profile, changed_by, changed_by_role, previous_data, new_data, change_reason)
            VALUES (CAST(:pid AS uuid), CAST(:changed_by AS uuid), :role, CAST(:prev AS jsonb), CAST(:new AS jsonb), :reason)
        """),
        {
            "pid":        id_profile,
            "changed_by": cu.user_id,
            "role":       cu.rol.value,
            "prev":       json.dumps(old_data),
            "new":        json.dumps(new_data_snapshot),
            "reason":     "Actualización desde el dashboard",
        },
    )

    set_parts = [f"{k} = :{k}" for k in updates]
    updates["sid"] = student_id
    db.execute(
        text(f"UPDATE profile SET {', '.join(set_parts)}, updated_at = NOW() WHERE id_student = CAST(:sid AS uuid) AND is_active = true"),
        updates,
    )
    db.commit()
    return await obtener_perfil(student_id, db, cu)


@router.get("/{student_id}/profile/history", response_model=list[ProfileHistoryResponse])
async def historial_perfil(
    student_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    profile = db.execute(
        text("SELECT id_profile FROM profile WHERE id_student = CAST(:sid AS uuid) AND is_active = true ORDER BY start_date DESC LIMIT 1"),
        {"sid": student_id},
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")

    rows = db.execute(
        text("""
            SELECT id_history, id_profile, changed_by, changed_by_role,
                previous_data, new_data, change_reason, created_at
            FROM profile_history WHERE id_profile = CAST(:pid AS uuid) ORDER BY created_at DESC
        """),
        {"pid": str(profile[0])},
    ).fetchall()

    return [
        ProfileHistoryResponse(
            id_history=str(r[0]), id_profile=str(r[1]),
            changed_by=str(r[2]) if r[2] else None,
            changed_by_role=r[3], previous_data=r[4], new_data=r[5],
            change_reason=r[6], created_at=r[7],
        )
        for r in rows
    ]


# ── Diagnóstico inicial ──────────────────────────────────────

@router.post("/{student_id}/diagnosis", response_model=InitialDiagnosisResponse, status_code=201)
async def crear_diagnostico(
    student_id: str,
    data:       InitialDiagnosisCreate,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    row = db.execute(
        text("""
            INSERT INTO initial_diagnosis (id_student, id_type_diagnosis, description, document_url)
            VALUES (CAST(:id_student AS uuid), CAST(:id_type_diagnosis AS uuid), :description, :document_url)
            RETURNING id_diagnosis, id_student, id_type_diagnosis, description, document_url, registration_date, created_at
        """),
        {
            "id_student":        student_id,
            "id_type_diagnosis": data.id_type_diagnosis,
            "description":       data.description,
            "document_url":      data.document_url,
        },
    ).fetchone()
    db.commit()
    return InitialDiagnosisResponse(
        id_diagnosis=str(row[0]), id_student=str(row[1]), id_type_diagnosis=str(row[2]),
        description=row[3], document_url=row[4], registration_date=row[5], created_at=row[6],
    )


@router.get("/{student_id}/diagnosis", response_model=list[InitialDiagnosisResponse])
async def listar_diagnosticos(
    student_id: str,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(get_current_user),
):
    rows = db.execute(
        text("""
            SELECT id_diagnosis, id_student, id_type_diagnosis, description, document_url, registration_date, created_at
            FROM initial_diagnosis WHERE id_student = CAST(:sid AS uuid) ORDER BY registration_date DESC
        """),
        {"sid": student_id},
    ).fetchall()
    return [
        InitialDiagnosisResponse(
            id_diagnosis=str(r[0]), id_student=str(r[1]), id_type_diagnosis=str(r[2]),
            description=r[3], document_url=r[4], registration_date=r[5], created_at=r[6],
        )
        for r in rows
    ]


# ── Subida de archivo de diagnóstico ──────────────────────────

# Carpeta local para archivos subidos
_UPLOAD_ROOT      = Path(__file__).parent.parent / "uploads"
_DIAGNOSIS_FOLDER = _UPLOAD_ROOT / "diagnoses"
_DIAGNOSIS_FOLDER.mkdir(parents=True, exist_ok=True)

# Tipos MIME permitidos (PDF + imágenes comunes)
_ALLOWED_MIMES = {
    "application/pdf":  ".pdf",
    "image/jpeg":       ".jpg",
    "image/png":        ".png",
    "image/webp":       ".webp",
}
_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("/{student_id}/diagnosis/upload", response_model=InitialDiagnosisResponse, status_code=201)
async def subir_diagnostico(
    student_id:        str,
    id_type_diagnosis: str = Form(...),
    description:       Optional[str] = Form(None),
    file:              UploadFile = File(...),
    db:                Session = Depends(get_db),
    cu:                TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """
    Sube un archivo de diagnóstico (PDF o imagen) y crea el registro asociado.
    El archivo se guarda en backend/uploads/diagnoses/ y se sirve vía /uploads/diagnoses/<nombre>.
    """
    # ── Validar tipo MIME ──
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_MIMES:
        raise HTTPException(
            status_code=400,
            detail="Formato no permitido. Acepta PDF, JPG, PNG o WebP.",
        )
    ext = _ALLOWED_MIMES[mime]

    # ── Verificar permisos: tutor solo sobre sus propios estudiantes ──
    if cu.rol == RolUsuario.tutor:
        rel = db.execute(
            text("""
                SELECT 1 FROM responsible_principal
                WHERE id_tutor = CAST(:tid AS uuid) AND id_student = CAST(:sid AS uuid)
                  AND is_active = true
            """),
            {"tid": cu.user_id, "sid": student_id},
        ).fetchone()
        if not rel:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudiante")

    # ── Leer archivo con límite ──
    contents = await file.read()
    if len(contents) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="El archivo supera los 5 MB permitidos.")
    if len(contents) == 0:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    # ── Guardar a disco con nombre único ──
    filename = f"{student_id}_{uuid.uuid4().hex}{ext}"
    file_path = _DIAGNOSIS_FOLDER / filename
    try:
        file_path.write_bytes(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al guardar archivo: {e}")

    # URL pública (servida por StaticFiles montado en /uploads)
    doc_url = f"/uploads/diagnoses/{filename}"

    # ── Crear registro en initial_diagnosis ──
    try:
        row = db.execute(
            text("""
                INSERT INTO initial_diagnosis (id_student, id_type_diagnosis, description, document_url)
                VALUES (CAST(:id_student AS uuid), CAST(:id_type_diagnosis AS uuid), :description, :document_url)
                RETURNING id_diagnosis, id_student, id_type_diagnosis, description, document_url,
                          registration_date, created_at
            """),
            {
                "id_student":        student_id,
                "id_type_diagnosis": id_type_diagnosis,
                "description":       description,
                "document_url":      doc_url,
            },
        ).fetchone()
        db.commit()
    except Exception as e:
        db.rollback()
        # Si el INSERT falla, borrar el archivo huérfano
        try:
            os.remove(file_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Error al guardar el diagnóstico: {e}")

    return InitialDiagnosisResponse(
        id_diagnosis=str(row[0]), id_student=str(row[1]), id_type_diagnosis=str(row[2]),
        description=row[3], document_url=row[4], registration_date=row[5], created_at=row[6],
    )


@router.delete("/{student_id}/diagnosis/{diagnosis_id}", status_code=204)
async def eliminar_diagnostico(
    student_id:   str,
    diagnosis_id: str,
    db:           Session = Depends(get_db),
    cu:           TokenData = Depends(require_role(RolUsuario.tutor, RolUsuario.profesional, RolUsuario.admin)),
):
    """Elimina un diagnóstico y, si tiene archivo asociado en disco, lo borra también."""
    # Tutor solo sobre sus propios estudiantes
    if cu.rol == RolUsuario.tutor:
        rel = db.execute(
            text("""
                SELECT 1 FROM responsible_principal
                WHERE id_tutor = CAST(:tid AS uuid) AND id_student = CAST(:sid AS uuid) AND is_active = true
            """),
            {"tid": cu.user_id, "sid": student_id},
        ).fetchone()
        if not rel:
            raise HTTPException(status_code=403, detail="No tienes acceso a este estudiante")

    row = db.execute(
        text("SELECT document_url FROM initial_diagnosis WHERE id_diagnosis = CAST(:id AS uuid) AND id_student = CAST(:sid AS uuid)"),
        {"id": diagnosis_id, "sid": student_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Diagnóstico no encontrado")

    doc_url = row[0] or ""
    db.execute(
        text("DELETE FROM initial_diagnosis WHERE id_diagnosis = CAST(:id AS uuid)"),
        {"id": diagnosis_id},
    )
    db.commit()

    # Borrar archivo asociado si está dentro de uploads/diagnoses
    if doc_url.startswith("/uploads/diagnoses/"):
        fname = doc_url.replace("/uploads/diagnoses/", "")
        fpath = _DIAGNOSIS_FOLDER / fname
        try:
            if fpath.exists():
                fpath.unlink()
        except Exception:
            pass


# ── Validación ───────────────────────────────────────────────

@router.post("/{student_id}/validation", response_model=ApprovedValidationResponse, status_code=201)
async def validar_diagnostico(
    student_id: str,
    data:       ApprovedValidationCreate,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.profesional, RolUsuario.admin)),
):
    row = db.execute(
        text("""
            INSERT INTO approved_validation
                (id_student, id_tutor, id_professional, accepts_camera, access_level,
                 clinical_notes, validation_status, acceptance_date)
            VALUES
                (CAST(:id_student AS uuid), CAST(:id_tutor AS uuid), CAST(:id_professional AS uuid), :accepts_camera,
                 :access_level, :clinical_notes, 'aprobado', NOW())
            RETURNING id_validation, id_student, id_tutor, id_professional,
                accepts_camera, access_level, validation_status, clinical_notes, link_date, created_at
        """),
        {
            "id_student":      student_id,
            "id_tutor":        data.id_tutor,
            "id_professional": data.id_professional or cu.user_id,
            "accepts_camera":  data.accepts_camera,
            "access_level":    data.access_level,
            "clinical_notes":  data.clinical_notes,
        },
    ).fetchone()
    db.commit()
    return ApprovedValidationResponse(
        id_validation=str(row[0]), id_student=str(row[1]), id_tutor=str(row[2]),
        id_professional=str(row[3]) if row[3] else None,
        accepts_camera=row[4], access_level=row[5], validation_status=row[6],
        clinical_notes=row[7], link_date=row[8], created_at=row[9],
    )
