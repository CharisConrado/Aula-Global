/**
 * Aula Global — Cliente HTTP para comunicarse con el backend FastAPI
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: "Error de conexión con el servidor",
    }));
    throw new Error(error.detail || `Error ${response.status}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  login: (email: string, password: string) =>
    apiFetch<{
      access_token: string;
      token_type: string;
      rol: string;
      user_id: string;
    }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  registerTutor: (data: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    relationship_type?: string;
  }) =>
    apiFetch<{
      access_token: string;
      token_type: string;
      rol: string;
      user_id: string;
    }>("/api/auth/register/tutor", { method: "POST", body: data }),

  registerProfessional: (data: {
    email: string;
    password: string;
    full_name: string;
    speciality?: string;   // nombre real de la columna en DB
    specialty?: string;    // alias aceptado también por el backend
    phone?: string;
  }) =>
    apiFetch<{
      access_token: string;
      token_type: string;
      rol: string;
      user_id: string;
    }>("/api/auth/register/professional", { method: "POST", body: data }),

  getMe: (token: string) =>
    apiFetch<{ user_id: string; email: string; rol: string }>("/api/auth/me", {
      token,
    }),

  // ── Students ──────────────────────────────────────────────────────────────
  getStudents: (token: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<StudentResponse[]>(`/api/students${query}`, { token });
  },

  getStudent: (token: string, id: string) =>
    apiFetch<StudentResponse>(`/api/students/${id}`, { token }),

  createStudent: (
    token: string,
    data: {
      full_name: string;
      birth_date: string;
      id_degree: string;
      avatar_url?: string;
    }
  ) =>
    apiFetch<StudentResponse>("/api/students", {
      method: "POST",
      body: data,
      token,
    }),

  getStudentProfile: (token: string, id: string) =>
    apiFetch<ProfileResponse>(`/api/students/${id}/profile`, { token }),

  updateStudentProfile: (token: string, id: string, data: Partial<ProfileResponse>) =>
    apiFetch<ProfileResponse>(`/api/students/${id}/profile`, {
      method: "PUT",
      body: data,
      token,
    }),

  // ── Sessions ──────────────────────────────────────────────────────────────
  createSession: (
    token: string,
    data: { id_student: string; session_type?: string; device?: string; device_type?: string }
  ) =>
    apiFetch<SessionResponse>("/api/sessions", {
      method: "POST",
      body: data,
      token,
    }),

  getSessions: (token: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<SessionResponse[]>(`/api/sessions${query}`, { token });
  },

  getSession: (token: string, sessionId: string) =>
    apiFetch<SessionResponse>(`/api/sessions/${sessionId}`, { token }),

  closeSession: (
    token: string,
    sessionId: string,
    data?: { status?: string }
  ) =>
    apiFetch<SessionResponse>(`/api/sessions/${sessionId}/close`, {
      method: "PUT",
      body: data || {},
      token,
    }),

  // ── Session Activities ────────────────────────────────────────────────────
  startActivity: (
    token: string,
    sessionId: string,
    data: { id_student: string; id_activity: string }
  ) =>
    apiFetch<StudentActivityResponse>(`/api/sessions/${sessionId}/activities`, {
      method: "POST",
      body: data,
      token,
    }),

  updateActivity: (
    token: string,
    sessionId: string,
    recordId: string,
    data: Partial<StudentActivityUpdate>
  ) =>
    apiFetch<StudentActivityResponse>(
      `/api/sessions/${sessionId}/activities/${recordId}`,
      { method: "PUT", body: data, token }
    ),

  getSessionActivities: (token: string, sessionId: string) =>
    apiFetch<StudentActivityResponse[]>(
      `/api/sessions/${sessionId}/activities`,
      { token }
    ),

  // ── Activities ────────────────────────────────────────────────────────────
  getActivities: (token: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<ActivityResponse[]>(`/api/activities${query}`, { token });
  },

  getActivity: (token: string, id: string) =>
    apiFetch<ActivityResponse>(`/api/activities/${id}`, { token }),

  getDegrees: () => apiFetch<DegreeResponse[]>("/api/activities/degrees"),

  getSubjects: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<SubjectResponse[]>(`/api/activities/subjects${query}`);
  },

  getCrisisTypes: () =>
    apiFetch<TypeCrisisResponse[]>("/api/activities/crisis-types"),

  getActions: () =>
    apiFetch<ActionResponse[]>("/api/activities/actions"),

  // ── Crisis ────────────────────────────────────────────────────────────────
  getActiveCrisis: (token: string) =>
    apiFetch<CrisisResponse[]>("/api/crisis/active", { token }),

  getCrisis: (token: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<CrisisResponse[]>(`/api/crisis${query}`, { token });
  },

  resolveCrisis: (
    token: string,
    crisisId: string,
    data: { was_effective: boolean; notes?: string }
  ) =>
    apiFetch<CrisisResponse>(`/api/crisis/${crisisId}/resolve`, {
      method: "PUT",
      body: data,
      token,
    }),

  // ── Monitoring ────────────────────────────────────────────────────────────
  getMonitoringStatus: (token: string, studentId: string) =>
    apiFetch<MonitoringStatus>(`/api/monitoring/status/${studentId}`, { token }),

  getMonitoringHistory: (token: string, sessionId: string, limit = 100) =>
    apiFetch<MonitoringHistoryEntry[]>(
      `/api/monitoring/history/${sessionId}?limit=${limit}`,
      { token }
    ),

  // ── Interventions ─────────────────────────────────────────────────────────
  createIntervention: (token: string, data: InterventionCreate) =>
    apiFetch<InterventionResponse>("/api/interventions", {
      method: "POST",
      body: data,
      token,
    }),

  getInterventions: (token: string, params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiFetch<InterventionResponse[]>(`/api/interventions${query}`, {
      token,
    });
  },

  getPendingInterventions: (token: string) =>
    apiFetch<InterventionResponse[]>("/api/interventions/pending", { token }),

  requestExternalConsult: (
    token: string,
    sessionId: string,
    descripcion: string
  ) =>
    apiFetch<InterventionResponse>(
      `/api/interventions/request-external?id_session=${sessionId}&descripcion=${encodeURIComponent(descripcion)}`,
      { method: "POST", token }
    ),
};

// ── Tipos / Interfaces ────────────────────────────────────────────────────────

export interface StudentResponse {
  id_student: string;
  full_name: string;
  birth_date: string;        // "YYYY-MM-DD"
  id_degree: string;
  account_status: string;    // 'activo' | 'inactivo' | 'suspendido'
  avatar_url: string | null;
  created_at: string;
}

export interface ProfileResponse {
  id_profile: string;
  id_student: string;
  id_type_diagnosis: string | null;
  visual_sensitivity: string | null;   // 'alta' | 'media' | 'baja'
  auditory_sensitivity: string | null;
  attention_base_level: number | null;
  preferred_format: string | null;     // 'visual' | 'auditivo' | 'kinestesico' | 'mixto'
  max_activity_time: number | null;
  needs_breaks: boolean;
  break_frequency: number | null;
  high_contrast: boolean;
  font_size: string | null;            // 'pequeno' | 'mediano' | 'grande'
  additional_notes: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SessionResponse {
  id_session: string;
  id_student: string;
  session_type: string;               // 'aprendizaje' | 'evaluacion' | 'repaso'
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  device: string | null;
  device_type: string | null;         // 'tablet' | 'computador' | 'movil'
  status: string;                     // 'activa' | 'completada' | 'interrumpida' | 'crisis'
  created_at: string;
}

export interface ActivityResponse {
  id_activity: string;
  id_subject: string;
  id_type_activity: string;
  title: string;
  description: string | null;
  difficulty_level: string;           // 'facil' | 'medio' | 'dificil'
  content: Record<string, unknown> | null;
  estimated_minutes: number | null;
  publication_status: string;         // 'borrador' | 'publicado' | 'archivado'
  thumbnail_url: string | null;
  created_at: string;
}

export interface StudentActivityResponse {
  id_student_activity: string;
  id_student: string;
  id_activity: string;
  id_session: string;
  score: number | null;
  achievement_level: string;          // 'en_progreso' | 'completado' | 'fallido' | 'omitido'
  success_rate: number | null;
  stress_level: number | null;
  time_spent_sec: number | null;
  had_crisis: boolean;
  tactile_pressure: boolean;
  stimming_detected: boolean;
  format_used: string | null;
  qualitative_notes: string | null;
  completion_date: string | null;
  is_completed: boolean;
}

export interface StudentActivityUpdate {
  score?: number;
  achievement_level?: string;
  success_rate?: number;
  stress_level?: number;
  time_spent_sec?: number;
  had_crisis?: boolean;
  tactile_pressure?: boolean;
  stimming_detected?: boolean;
  format_used?: string;
  qualitative_notes?: string;
  completion_date?: string;
  is_completed?: boolean;
}

export interface DegreeResponse {
  id_degree: string;
  grade_name: string;                 // "Primero", "Segundo", etc.
  level: number;                      // 1-5
  created_at: string;
}

export interface SubjectResponse {
  id_subject: string;
  id_degree: string;
  subject_name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
}

export interface TypeCrisisResponse {
  id_type_crisis: string;
  name: string;
  description: string | null;
  severity_level: number;             // 1=leve, 2=moderada, 3=grave
  created_at: string;
}

export interface ActionResponse {
  id_action: string;
  action_name: string;
  description: string | null;
  auto_apply: boolean;
  created_at: string;
}

export interface CrisisResponse {
  id_crisis: string;
  id_session: string;
  id_type_crisis: string;
  id_action: string;
  id_student: string;
  detection_timestamp: string | null;
  resolved_at: string | null;
  was_effective: boolean | null;
  required_human: boolean;
  notes: string | null;
  created_at: string;
}

export interface InterventionCreate {
  id_session: string;
  help_type: string;                  // 'crisis_leve' | 'crisis_grave' | 'seguimiento' | 'consulta_externa'
  session_moment?: string;
  description?: string;
  id_crisis?: string;
  id_tutor?: string;
  id_professional?: string;
}

export interface InterventionResponse {
  id_intervention: string;
  id_session: string;
  id_crisis: string | null;
  id_tutor: string | null;
  id_professional: string | null;
  help_type: string;
  session_moment: string | null;
  description: string | null;
  status: string;                     // 'pendiente' | 'en_curso' | 'resuelta'
  resolved_at: string | null;
  created_at: string;
}

export interface MonitoringStatus {
  status: "online" | "offline";
  student_id?: string;
  session_id?: string;
  emocion_actual?: string;
  nivel_atencion?: number;
  stimming?: boolean;
  ultima_crisis?: string | null;
  mensaje?: string;
}

export interface MonitoringHistoryEntry {
  id_monitoring: string;
  id_session: string;
  emotion: string;
  attention_level: number;
  stimming: boolean;
  tactile_pressure: boolean;
  action_taken: string;
  detected_at: string;
}
