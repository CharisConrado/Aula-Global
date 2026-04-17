"""
Aula Global — Modelos Pydantic
Ajustados al schema real de Supabase (UUIDs, nombres de columnas correctos).
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Any
from datetime import datetime, date
from enum import Enum


# ============================================================
# ENUMS  (valores exactos del CHECK en la base de datos)
# ============================================================

class RolUsuario(str, Enum):
    tutor        = "tutor"
    profesional  = "profesional"
    admin        = "admin"


class NivelDificultad(str, Enum):
    facil   = "facil"
    medio   = "medio"
    dificil = "dificil"


class PublicationStatus(str, Enum):
    borrador  = "borrador"
    publicado = "publicado"
    archivado = "archivado"


class Emocion(str, Enum):
    neutro    = "neutro"
    feliz     = "feliz"
    frustrado = "frustrado"
    ansioso   = "ansioso"
    distraido = "distraido"
    estresado = "estresado"
    calmado   = "calmado"


class AccionMonitoreo(str, Enum):
    ninguna                  = "ninguna"
    simplificar_contenido    = "simplificar_contenido"
    pausa_visual             = "pausa_visual"
    cambiar_formato          = "cambiar_formato"
    mostrar_pista            = "mostrar_pista"
    alerta_tutor             = "alerta_tutor"
    intervencion_profesional = "intervencion_profesional"
    finalizar_sesion         = "finalizar_sesion"

# Alias usado por el motor de adaptación
AccionAdaptacion = AccionMonitoreo


class NivelCrisis(str, Enum):
    leve     = "leve"
    moderada = "moderada"
    grave    = "grave"


class TipoIntervencion(str, Enum):
    crisis_leve      = "crisis_leve"
    crisis_grave     = "crisis_grave"
    consulta_externa = "consulta_externa"
    seguimiento      = "seguimiento"


class EstadoIntervencion(str, Enum):
    pendiente  = "pendiente"
    en_curso   = "en_curso"
    resuelta   = "resuelta"


class EstadoSesion(str, Enum):
    activa       = "activa"
    completada   = "completada"
    interrumpida = "interrumpida"
    crisis       = "crisis"


class RelationshipType(str, Enum):
    familiar             = "familiar"
    profesional_externo  = "profesional_externo"
    cuidador             = "cuidador"


class ValidationStatus(str, Enum):
    pendiente  = "pendiente"
    aprobado   = "aprobado"
    rechazado  = "rechazado"


class AccountStatus(str, Enum):
    activo     = "activo"
    inactivo   = "inactivo"
    suspendido = "suspendido"


# ============================================================
# AUTH
# ============================================================

class LoginRequest(BaseModel):
    email:    EmailStr
    password: str = Field(..., min_length=6)


class RegisterTutorRequest(BaseModel):
    email:             EmailStr
    password:          str = Field(..., min_length=6)
    full_name:         str = Field(..., min_length=2, max_length=200)
    # Se acepta cualquier string libre (familiar, padre, docente, cuidador, etc.)
    relationship_type: Optional[str] = "familiar"
    phone:             Optional[str] = None


class RegisterProfessionalRequest(BaseModel):
    email:          EmailStr
    password:       str = Field(..., min_length=6)
    full_name:      str = Field(..., min_length=2, max_length=200)
    # Campos opcionales para no romper el formulario de registro rápido
    license_number: Optional[str] = None
    speciality:     Optional[str] = None   # columna en DB
    specialty:      Optional[str] = None   # alias del frontend
    phone:          Optional[str] = None

    @property
    def resolved_speciality(self) -> Optional[str]:
        """Devuelve speciality o specialty, el que venga informado."""
        return self.speciality or self.specialty


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    rol:          RolUsuario
    user_id:      str   # UUID


class TokenData(BaseModel):
    user_id: str        # UUID del tutor / profesional
    email:   str
    rol:     RolUsuario


# ============================================================
# DEGREE
# ============================================================

class DegreeResponse(BaseModel):
    id_degree:  str
    grade_name: str
    level:      int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# TUTOR
# ============================================================

class TutorUpdate(BaseModel):
    full_name:         Optional[str] = None
    phone:             Optional[str] = None
    relationship_type: Optional[RelationshipType] = None


class TutorResponse(BaseModel):
    id_tutor:          str
    full_name:         str
    email:             str
    relationship_type: str
    phone:             Optional[str] = None
    is_professional:   bool
    is_active:         bool
    created_at:        Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# PROFESSIONAL
# ============================================================

class ProfessionalResponse(BaseModel):
    id_professional:     str
    full_name:           str
    email:               str
    license_number:      str
    speciality:          str
    phone:               Optional[str] = None
    verification_status: str
    is_active:           bool
    created_at:          Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# STUDENT
# ============================================================

class StudentCreate(BaseModel):
    full_name:  str = Field(..., min_length=2, max_length=200)
    birth_date: date
    id_degree:  str   # UUID


class StudentUpdate(BaseModel):
    full_name:      Optional[str] = None
    birth_date:     Optional[date] = None
    id_degree:      Optional[str] = None
    account_status: Optional[AccountStatus] = None


class StudentResponse(BaseModel):
    id_student:     str
    full_name:      str
    birth_date:     date
    id_degree:      str
    account_status: str
    avatar_url:     Optional[str] = None
    created_at:     Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# INITIAL DIAGNOSIS
# ============================================================

class InitialDiagnosisCreate(BaseModel):
    id_student:        str
    id_type_diagnosis: str
    description:       Optional[str] = None
    document_url:      Optional[str] = None


class InitialDiagnosisResponse(BaseModel):
    id_diagnosis:      str
    id_student:        str
    id_type_diagnosis: str
    description:       Optional[str] = None
    document_url:      Optional[str] = None
    registration_date: Optional[datetime] = None
    created_at:        Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# APPROVED VALIDATION
# ============================================================

class ApprovedValidationCreate(BaseModel):
    id_student:             str
    id_tutor:               str
    id_professional:        Optional[str] = None
    accepts_camera:         bool = False
    access_level:           str = "basico"
    clinical_notes:         Optional[str] = None


class ApprovedValidationResponse(BaseModel):
    id_validation:       str
    id_student:          str
    id_tutor:            str
    id_professional:     Optional[str] = None
    accepts_camera:      bool
    access_level:        str
    validation_status:   str
    clinical_notes:      Optional[str] = None
    link_date:           Optional[datetime] = None
    created_at:          Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# PROFILE
# ============================================================

class ProfileCreate(BaseModel):
    id_student:      str
    volume_level:    int = Field(default=5, ge=0, le=10)
    visual_contrast: str = "normal"
    feedback_type:   str = "visual"
    font_size:       str = "normal"
    animation_speed: str = "normal"
    max_session_min: int = 30
    needs_breaks:    bool = True
    break_interval:  int = 10


class ProfileUpdate(BaseModel):
    volume_level:    Optional[int]  = Field(None, ge=0, le=10)
    visual_contrast: Optional[str]  = None
    feedback_type:   Optional[str]  = None
    font_size:       Optional[str]  = None
    animation_speed: Optional[str]  = None
    max_session_min: Optional[int]  = None
    needs_breaks:    Optional[bool] = None
    break_interval:  Optional[int]  = None


class ProfileResponse(BaseModel):
    id_profile:      str
    id_student:      str
    volume_level:    int
    visual_contrast: str
    feedback_type:   str
    font_size:       Optional[str] = None
    animation_speed: Optional[str] = None
    max_session_min: Optional[int] = None
    needs_breaks:    Optional[bool] = None
    break_interval:  Optional[int] = None
    is_active:       bool
    start_date:      Optional[datetime] = None
    created_at:      Optional[datetime] = None

    class Config:
        from_attributes = True


class ProfileHistoryResponse(BaseModel):
    id_history:      str
    id_profile:      str
    changed_by:      Optional[str] = None
    changed_by_role: Optional[str] = None
    previous_data:   Optional[Any] = None
    new_data:        Optional[Any] = None
    change_reason:   Optional[str] = None
    created_at:      Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# SUBJECT
# ============================================================

class SubjectCreate(BaseModel):
    id_degree:    str
    subject_name: str = Field(..., min_length=2)
    description:  Optional[str] = None
    icon:         Optional[str] = None
    color:        Optional[str] = None


class SubjectResponse(BaseModel):
    id_subject:   str
    id_degree:    str
    subject_name: str
    description:  Optional[str] = None
    icon:         Optional[str] = None
    color:        Optional[str] = None
    is_active:    bool
    created_at:   Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# ACTIVITY
# ============================================================

class ActivityCreate(BaseModel):
    id_subject:         str
    id_type_activity:   str
    title:              str = Field(..., min_length=2)
    description:        Optional[str] = None
    difficulty_level:   NivelDificultad = NivelDificultad.facil
    content:            Optional[dict] = None
    estimated_minutes:  int = Field(default=10, ge=1, le=120)
    publication_status: PublicationStatus = PublicationStatus.borrador
    thumbnail_url:      Optional[str] = None


class ActivityUpdate(BaseModel):
    title:              Optional[str] = None
    description:        Optional[str] = None
    difficulty_level:   Optional[NivelDificultad] = None
    content:            Optional[dict] = None
    estimated_minutes:  Optional[int] = None
    publication_status: Optional[PublicationStatus] = None
    thumbnail_url:      Optional[str] = None


class ActivityResponse(BaseModel):
    id_activity:        str
    id_subject:         str
    id_type_activity:   str
    title:              str
    description:        Optional[str] = None
    difficulty_level:   str
    content:            Optional[Any] = None
    estimated_minutes:  Optional[int] = None
    publication_status: str
    thumbnail_url:      Optional[str] = None
    created_at:         Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# SESSION
# ============================================================

class SessionCreate(BaseModel):
    id_student:   str
    session_type: str = "normal"
    device:       Optional[str] = None
    device_type:  Optional[str] = None


class SessionResponse(BaseModel):
    id_session:   str
    id_student:   str
    session_type: str
    start_time:   Optional[datetime] = None
    end_time:     Optional[datetime] = None
    duration_sec: Optional[int] = None
    device:       Optional[str] = None
    device_type:  Optional[str] = None
    status:       str
    created_at:   Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionClose(BaseModel):
    status: str = "completada"


# ============================================================
# STUDENT ACTIVITY
# ============================================================

class StudentActivityCreate(BaseModel):
    id_student:  str
    id_activity: str
    id_session:  str


class StudentActivityUpdate(BaseModel):
    score:             Optional[float] = Field(None, ge=0, le=5)
    achievement_level: Optional[str]  = None
    success_rate:      Optional[float] = Field(None, ge=0, le=100)
    stress_level:      Optional[int]  = Field(None, ge=0, le=10)
    time_spent_sec:    Optional[int]  = None
    had_crisis:        Optional[bool] = None
    tactile_pressure:  Optional[bool] = None
    stimming_detected: Optional[bool] = None
    format_used:       Optional[str]  = None
    qualitative_notes: Optional[str]  = None
    is_completed:      Optional[bool] = None


class StudentActivityResponse(BaseModel):
    id_student_activity: str
    id_student:          str
    id_activity:         str
    id_session:          str
    score:               Optional[float] = None
    achievement_level:   str
    success_rate:        Optional[float] = None
    stress_level:        Optional[int]   = None
    time_spent_sec:      Optional[int]   = None
    had_crisis:          bool
    tactile_pressure:    bool
    stimming_detected:   bool
    format_used:         Optional[str]   = None
    qualitative_notes:   Optional[str]   = None
    completion_date:     Optional[datetime] = None
    is_completed:        bool

    class Config:
        from_attributes = True


# ============================================================
# MONITORING
# ============================================================

class MonitoringData(BaseModel):
    """Datos enviados desde MediaPipe en el navegador cada 2 segundos."""
    id_session:       str
    emotion:          Emocion = Emocion.neutro
    attention_level:  float   = Field(default=0.5, ge=0, le=1)
    stimming:         bool    = False
    tactile_pressure: bool    = False   # Booleano en la DB


class MonitoringResponse(BaseModel):
    id_monitoring:   str
    id_session:      str
    emotion:         str
    attention_level: Optional[float] = None
    stimming:        bool
    tactile_pressure: bool
    action_taken:    Optional[str]   = None
    detected_at:     Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# ACTION RTO
# ============================================================

class ActionRtoResponse(BaseModel):
    id_action:   str
    action_name: str
    description: Optional[str] = None
    auto_apply:  bool
    created_at:  Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# TYPE CRISIS
# ============================================================

class TypeCrisisResponse(BaseModel):
    id_type_crisis: str
    name:           str
    description:    Optional[str] = None
    severity_level: int
    created_at:     Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# CRISIS
# ============================================================

class CrisisCreate(BaseModel):
    id_session:      str
    id_student:      str
    id_type_crisis:  str
    id_action:       str
    notes:           Optional[str] = None
    required_human:  bool = False


class CrisisUpdate(BaseModel):
    resolved_at:    Optional[datetime] = None
    was_effective:  Optional[bool]     = None
    required_human: Optional[bool]     = None
    notes:          Optional[str]      = None


class CrisisResponse(BaseModel):
    id_crisis:            str
    id_session:           str
    id_type_crisis:       str
    id_action:            str
    id_student:           str
    detection_timestamp:  Optional[datetime] = None
    resolved_at:          Optional[datetime] = None
    was_effective:        Optional[bool]     = None
    required_human:       bool
    notes:                Optional[str]      = None
    created_at:           Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# INTERVENTION
# ============================================================

class InterventionCreate(BaseModel):
    id_session:      str
    id_crisis:       Optional[str] = None
    id_tutor:        Optional[str] = None
    id_professional: Optional[str] = None
    help_type:       TipoIntervencion
    description:     Optional[str] = None
    session_moment:  Optional[str] = None


class InterventionUpdate(BaseModel):
    status:      Optional[EstadoIntervencion] = None
    description: Optional[str]               = None
    resolved_at: Optional[datetime]          = None


class InterventionResponse(BaseModel):
    id_intervention: str
    id_session:      str
    id_crisis:       Optional[str] = None
    id_tutor:        Optional[str] = None
    id_professional: Optional[str] = None
    help_type:       str
    session_moment:  Optional[str] = None
    description:     Optional[str] = None
    status:          str
    resolved_at:     Optional[datetime] = None
    created_at:      Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# RESPONSIBLE PRINCIPAL
# ============================================================

class ResponsiblePrincipalResponse(BaseModel):
    id_responsible: str
    id_tutor:       str
    id_student:     str
    assigned_date:  Optional[datetime] = None
    is_active:      bool
    created_at:     Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# WEBSOCKET — Motor de adaptación
# ============================================================

class AdaptationAction(BaseModel):
    accion: str
    motivo: str
    datos:  Optional[dict] = None


class MonitoringWebSocketResponse(BaseModel):
    status:         str = "ok"
    acciones:       list[AdaptationAction] = []
    emocion_actual: str = "neutro"
    nivel_atencion: float = 0.5
    alerta_crisis:  Optional[str] = None
