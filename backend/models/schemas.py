"""
Aula Global — Modelos Pydantic para validación de datos
Corresponden a las 20 tablas del schema de Supabase.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, date
from enum import Enum


# ============================================================
# ENUMS
# ============================================================

class RolUsuario(str, Enum):
    estudiante = "estudiante"
    tutor = "tutor"
    profesional = "profesional"
    admin = "admin"


class TipoDiagnostico(str, Enum):
    tdah = "TDAH"
    tea = "TEA"
    tdah_tea = "TDAH_TEA"
    otro = "otro"


class TipoActividad(str, Enum):
    quiz = "quiz"
    arrastrar = "arrastrar"
    completar = "completar"
    colorear = "colorear"
    audio = "audio"
    video = "video"
    lectura = "lectura"


class NivelDificultad(str, Enum):
    facil = "facil"
    medio = "medio"
    dificil = "dificil"


class Emocion(str, Enum):
    neutro = "neutro"
    feliz = "feliz"
    frustrado = "frustrado"
    ansioso = "ansioso"
    distraido = "distraido"
    estresado = "estresado"
    calmado = "calmado"


class NivelCrisis(str, Enum):
    leve = "leve"
    moderada = "moderada"
    grave = "grave"


class TipoIntervencion(str, Enum):
    crisis_leve = "crisis_leve"
    crisis_grave = "crisis_grave"
    consulta_externa = "consulta_externa"
    seguimiento = "seguimiento"


class AccionAdaptacion(str, Enum):
    simplificar_contenido = "simplificar_contenido"
    pausa_visual = "pausa_visual"
    cambiar_formato = "cambiar_formato"
    mostrar_pista = "mostrar_pista"
    adaptar_contenido = "adaptar_contenido"
    alerta_tutor = "alerta_tutor"
    intervencion_profesional = "intervencion_profesional"


# ============================================================
# AUTENTICACIÓN
# ============================================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    nombre: str = Field(..., min_length=2, max_length=100)
    apellido: str = Field(..., min_length=2, max_length=100)
    rol: RolUsuario


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    rol: RolUsuario
    user_id: int


class TokenData(BaseModel):
    user_id: int
    email: str
    rol: RolUsuario


# ============================================================
# GRADO (degree)
# ============================================================

class DegreeBase(BaseModel):
    name: str = Field(..., max_length=50)
    grade_number: int = Field(..., ge=1, le=5)


class DegreeResponse(DegreeBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# TIPO DE DIAGNÓSTICO (type_diagnosis)
# ============================================================

class TypeDiagnosisBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None


class TypeDiagnosisResponse(TypeDiagnosisBase):
    id: int

    class Config:
        from_attributes = True


# ============================================================
# TIPO DE ACTIVIDAD (type_activity)
# ============================================================

class TypeActivityBase(BaseModel):
    name: str = Field(..., max_length=50)
    description: Optional[str] = None


class TypeActivityResponse(TypeActivityBase):
    id: int

    class Config:
        from_attributes = True


# ============================================================
# PROFESIONAL (professional)
# ============================================================

class ProfessionalBase(BaseModel):
    nombre: str = Field(..., max_length=100)
    apellido: str = Field(..., max_length=100)
    email: EmailStr
    especialidad: Optional[str] = None
    licencia: Optional[str] = None


class ProfessionalCreate(ProfessionalBase):
    password: str = Field(..., min_length=6)


class ProfessionalResponse(ProfessionalBase):
    id: int
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# TUTOR (tutor)
# ============================================================

class TutorBase(BaseModel):
    nombre: str = Field(..., max_length=100)
    apellido: str = Field(..., max_length=100)
    email: EmailStr
    telefono: Optional[str] = Field(None, max_length=20)
    es_profesional: bool = False
    relacion: Optional[str] = Field(None, max_length=50)


class TutorCreate(TutorBase):
    password: str = Field(..., min_length=6)


class TutorUpdate(BaseModel):
    nombre: Optional[str] = Field(None, max_length=100)
    apellido: Optional[str] = Field(None, max_length=100)
    telefono: Optional[str] = Field(None, max_length=20)
    relacion: Optional[str] = Field(None, max_length=50)


class TutorResponse(TutorBase):
    id: int
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# ESTUDIANTE (student)
# ============================================================

class StudentBase(BaseModel):
    nombre: str = Field(..., max_length=100)
    apellido: str = Field(..., max_length=100)
    fecha_nacimiento: date
    grado_id: int
    tutor_id: int
    username: str = Field(..., min_length=3, max_length=50)


class StudentCreate(StudentBase):
    password: str = Field(..., min_length=4)


class StudentUpdate(BaseModel):
    nombre: Optional[str] = Field(None, max_length=100)
    apellido: Optional[str] = Field(None, max_length=100)
    fecha_nacimiento: Optional[date] = None
    grado_id: Optional[int] = None


class StudentResponse(StudentBase):
    id: int
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# DIAGNÓSTICO INICIAL (initial_diagnosis)
# ============================================================

class InitialDiagnosisBase(BaseModel):
    student_id: int
    type_diagnosis_id: int
    descripcion: Optional[str] = None
    fecha_diagnostico: Optional[date] = None
    profesional_externo: Optional[str] = None


class InitialDiagnosisCreate(InitialDiagnosisBase):
    pass


class InitialDiagnosisResponse(InitialDiagnosisBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# VALIDACIÓN APROBADA (approved_validation)
# ============================================================

class ApprovedValidationBase(BaseModel):
    student_id: int
    professional_id: int
    diagnosis_id: int
    accepts_camera: bool = False
    notas: Optional[str] = None


class ApprovedValidationCreate(ApprovedValidationBase):
    pass


class ApprovedValidationResponse(ApprovedValidationBase):
    id: int
    fecha_validacion: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# PERFIL (profile)
# ============================================================

class ProfileBase(BaseModel):
    student_id: int
    sensibilidad_visual: Optional[str] = Field(None, max_length=20)
    sensibilidad_auditiva: Optional[str] = Field(None, max_length=20)
    nivel_atencion_base: Optional[float] = Field(None, ge=0, le=1)
    prefiere_formato: Optional[str] = Field(None, max_length=30)
    tiempo_max_actividad: Optional[int] = Field(None, ge=1, le=120)
    necesita_pausas: bool = True
    frecuencia_pausas: Optional[int] = Field(None, ge=1, le=60)
    alto_contraste: bool = False
    tamano_fuente: Optional[str] = Field("grande", max_length=20)
    notas_adicionales: Optional[str] = None


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    sensibilidad_visual: Optional[str] = None
    sensibilidad_auditiva: Optional[str] = None
    nivel_atencion_base: Optional[float] = None
    prefiere_formato: Optional[str] = None
    tiempo_max_actividad: Optional[int] = None
    necesita_pausas: Optional[bool] = None
    frecuencia_pausas: Optional[int] = None
    alto_contraste: Optional[bool] = None
    tamano_fuente: Optional[str] = None
    notas_adicionales: Optional[str] = None


class ProfileResponse(ProfileBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# HISTORIAL DE PERFIL (profile_history)
# ============================================================

class ProfileHistoryResponse(BaseModel):
    id: int
    profile_id: int
    campo_modificado: str
    valor_anterior: Optional[str] = None
    valor_nuevo: Optional[str] = None
    modificado_por: Optional[int] = None
    fecha_modificacion: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# MATERIA (subject)
# ============================================================

class SubjectBase(BaseModel):
    name: str = Field(..., max_length=100)
    degree_id: int
    description: Optional[str] = None


class SubjectCreate(SubjectBase):
    pass


class SubjectResponse(SubjectBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# ACTIVIDAD (activity)
# ============================================================

class ActivityBase(BaseModel):
    titulo: str = Field(..., max_length=200)
    descripcion: Optional[str] = None
    subject_id: int
    type_activity_id: int
    dificultad: NivelDificultad = NivelDificultad.medio
    contenido_json: Optional[dict] = None
    duracion_estimada: Optional[int] = Field(None, ge=1, le=120)
    puntos: int = Field(default=10, ge=0, le=100)
    orden: int = Field(default=1, ge=1)


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    dificultad: Optional[NivelDificultad] = None
    contenido_json: Optional[dict] = None
    duracion_estimada: Optional[int] = None
    puntos: Optional[int] = None
    orden: Optional[int] = None


class ActivityResponse(ActivityBase):
    id: int
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# SESIÓN (session)
# ============================================================

class SessionCreate(BaseModel):
    student_id: int


class SessionResponse(BaseModel):
    id: int
    student_id: int
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    duracion_total: Optional[int] = None
    actividades_completadas: int = 0
    nota_cuantitativa: Optional[float] = None
    nota_cualitativa: Optional[str] = None
    crisis_ocurridas: int = 0
    intervenciones_realizadas: int = 0
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SessionClose(BaseModel):
    nota_cualitativa: Optional[str] = None


# ============================================================
# ACTIVIDAD DEL ESTUDIANTE (student_activity)
# ============================================================

class StudentActivityCreate(BaseModel):
    session_id: int
    activity_id: int
    student_id: int


class StudentActivityUpdate(BaseModel):
    nota: Optional[float] = Field(None, ge=0, le=5)
    completada: bool = False
    tiempo_dedicado: Optional[int] = None
    intentos: int = 1
    formato_usado: Optional[str] = None
    stimming_detectado: bool = False
    presion_tactil: Optional[str] = None
    nivel_atencion_promedio: Optional[float] = None
    respuestas_json: Optional[dict] = None


class StudentActivityResponse(BaseModel):
    id: int
    session_id: int
    activity_id: int
    student_id: int
    nota: Optional[float] = None
    completada: bool = False
    tiempo_dedicado: Optional[int] = None
    intentos: int = 1
    formato_usado: Optional[str] = None
    stimming_detectado: bool = False
    presion_tactil: Optional[str] = None
    nivel_atencion_promedio: Optional[float] = None
    respuestas_json: Optional[dict] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# MONITOREO (monitoring)
# ============================================================

class MonitoringData(BaseModel):
    """Datos enviados desde el frontend via WebSocket cada 2 segundos."""
    session_id: int
    student_id: int
    emocion: Emocion = Emocion.neutro
    nivel_atencion: float = Field(default=0.5, ge=0, le=1)
    stimming: bool = False
    presion_tactil: Optional[float] = Field(None, ge=0, le=1)
    velocidad_clics: Optional[float] = None
    landmarks_procesados: Optional[dict] = None


class MonitoringResponse(BaseModel):
    id: int
    session_id: int
    student_id: int
    emocion: str
    nivel_atencion: float
    stimming: bool
    presion_tactil: Optional[float] = None
    velocidad_clics: Optional[float] = None
    timestamp: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# ACCIÓN EN TIEMPO REAL (action_rto)
# ============================================================

class ActionRtoBase(BaseModel):
    session_id: int
    student_id: int
    accion: AccionAdaptacion
    motivo: Optional[str] = None
    datos_contexto: Optional[dict] = None


class ActionRtoResponse(ActionRtoBase):
    id: int
    ejecutada: bool = False
    timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# CRISIS (crisis)
# ============================================================

class CrisisCreate(BaseModel):
    session_id: int
    student_id: int
    nivel: NivelCrisis
    emocion_detectada: Optional[str] = None
    descripcion: Optional[str] = None
    datos_monitoreo: Optional[dict] = None


class CrisisUpdate(BaseModel):
    resuelta: bool = False
    resolucion: Optional[str] = None
    resuelta_por: Optional[int] = None


class CrisisResponse(BaseModel):
    id: int
    session_id: int
    student_id: int
    nivel: str
    emocion_detectada: Optional[str] = None
    descripcion: Optional[str] = None
    resuelta: bool = False
    resolucion: Optional[str] = None
    resuelta_por: Optional[int] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# INTERVENCIÓN (intervention)
# ============================================================

class InterventionCreate(BaseModel):
    crisis_id: Optional[int] = None
    student_id: int
    professional_id: Optional[int] = None
    tipo: TipoIntervencion
    descripcion: Optional[str] = None


class InterventionUpdate(BaseModel):
    completada: bool = False
    notas: Optional[str] = None
    resultado: Optional[str] = None


class InterventionResponse(BaseModel):
    id: int
    crisis_id: Optional[int] = None
    student_id: int
    professional_id: Optional[int] = None
    tipo: str
    descripcion: Optional[str] = None
    completada: bool = False
    notas: Optional[str] = None
    resultado: Optional[str] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# RESPONSABLE PRINCIPAL (responsible_principal)
# ============================================================

class ResponsiblePrincipalBase(BaseModel):
    student_id: int
    tutor_id: int
    es_principal: bool = True


class ResponsiblePrincipalResponse(ResponsiblePrincipalBase):
    id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================
# TIPO DE CRISIS (type_crisis)
# ============================================================

class TypeCrisisBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    nivel_default: NivelCrisis = NivelCrisis.leve


class TypeCrisisResponse(TypeCrisisBase):
    id: int

    class Config:
        from_attributes = True


# ============================================================
# RESPUESTAS DE ADAPTACIÓN (WebSocket)
# ============================================================

class AdaptationAction(BaseModel):
    """Acción de adaptación enviada al frontend via WebSocket."""
    accion: AccionAdaptacion
    motivo: str
    datos: Optional[dict] = None


class MonitoringWebSocketResponse(BaseModel):
    """Respuesta completa del WebSocket de monitoreo."""
    status: str = "ok"
    acciones: list[AdaptationAction] = []
    emocion_actual: Emocion = Emocion.neutro
    nivel_atencion: float = 0.5
    alerta_crisis: Optional[NivelCrisis] = None
