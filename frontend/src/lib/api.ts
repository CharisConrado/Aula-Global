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

/** Rango de fechas opcional para los reportes. */
export interface ReportDateRange {
  start_date?: string;   // YYYY-MM-DD
  end_date?: string;     // YYYY-MM-DD
}

/** Helper: serializa el rango como query string (?start_date=…&end_date=…). */
function buildRangeQuery(range?: ReportDateRange, fallbackDays?: number): string {
  const params: string[] = [];
  if (range?.start_date && range?.end_date) {
    params.push(`start_date=${range.start_date}`);
    params.push(`end_date=${range.end_date}`);
  } else if (fallbackDays != null) {
    params.push(`days=${fallbackDays}`);
  }
  return params.length ? `?${params.join("&")}` : "";
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

  loginStudent: (identity_document: string, access_code: string) =>
    apiFetch<{
      access_token: string;
      token_type: string;
      rol: string;
      user_id: string;
    }>("/api/auth/login/student", {
      method: "POST",
      body: { identity_document, access_code },
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
      identity_document?: string;
      avatar_url?: string;
      profile?: {
        volume_level?:    number;
        visual_contrast?: string;
        feedback_type?:   string;
        font_size?:       string;
        animation_speed?: string;
        max_session_min?: number;
        needs_breaks?:    boolean;
        break_interval?:  number;
      };
    }
  ) =>
    apiFetch<StudentResponse>("/api/students", {
      method: "POST",
      body: data,
      token,
    }),

  // ── Diagnoses ─────────────────────────────────────────────────────────────
  getDiagnosisTypes: () =>
    apiFetch<{ id_type_diagnosis: string; name: string }[]>("/api/activities/diagnosis-types"),

  listStudentDiagnoses: (token: string, studentId: string) =>
    apiFetch<DiagnosisResponse[]>(`/api/students/${studentId}/diagnosis`, { token }),

  uploadStudentDiagnosis: async (
    token: string,
    studentId: string,
    data: { id_type_diagnosis: string; description?: string; file: File }
  ): Promise<DiagnosisResponse> => {
    const fd = new FormData();
    fd.append("id_type_diagnosis", data.id_type_diagnosis);
    if (data.description) fd.append("description", data.description);
    fd.append("file", data.file);

    const res = await fetch(`${API_URL}/api/students/${studentId}/diagnosis/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Error al subir el diagnóstico" }));
      throw new Error(err.detail || `Error ${res.status}`);
    }
    return res.json();
  },

  deleteStudentDiagnosis: (token: string, studentId: string, diagnosisId: string) =>
    apiFetch<void>(`/api/students/${studentId}/diagnosis/${diagnosisId}`, {
      method: "DELETE",
      token,
    }),

  /** Convierte un document_url relativo (/uploads/...) en URL absoluta para descargar. */
  absoluteUploadUrl: (path: string | null | undefined): string =>
    !path ? "" : (path.startsWith("http") ? path : `${API_URL}${path}`),

  getStudentProfile: (token: string, id: string) =>
    apiFetch<ProfileResponse>(`/api/students/${id}/profile`, { token }),

  updateStudentProfile: (token: string, id: string, data: Partial<ProfileResponse>) =>
    apiFetch<ProfileResponse>(`/api/students/${id}/profile`, {
      method: "PUT",
      body: data,
      token,
    }),

  deleteStudent: (token: string, id: string) =>
    apiFetch<void>(`/api/students/${id}`, {
      method: "DELETE",
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

  // ── Tutors ────────────────────────────────────────────────────────────────
  getTutors: (token: string) =>
    apiFetch<TutorResponse[]>("/api/tutors/", { token }),

  getTutor: (token: string, id: string) =>
    apiFetch<TutorResponse>(`/api/tutors/${id}`, { token }),

  updateTutor: (
    token: string,
    id: string,
    data: { full_name?: string; phone?: string; relationship_type?: string }
  ) =>
    apiFetch<TutorResponse>(`/api/tutors/${id}`, {
      method: "PUT",
      body: data,
      token,
    }),

  deleteTutor: (token: string, id: string) =>
    apiFetch<void>(`/api/tutors/${id}`, { method: "DELETE", token }),

  getTutorStudents: (token: string, tutorId: string) =>
    apiFetch<StudentResponse[]>(`/api/tutors/${tutorId}/students`, { token }),

  assignStudentToTutor: (token: string, tutorId: string, studentId: string) =>
    apiFetch<{ id_responsible: string }>(
      `/api/tutors/${tutorId}/assign/${studentId}`,
      { method: "POST", token }
    ),

  // ── Professionals ─────────────────────────────────────────────────────────
  getProfessionals: (token: string) =>
    apiFetch<ProfessionalResponse[]>("/api/professionals/", { token }),

  getProfessional: (token: string, id: string) =>
    apiFetch<ProfessionalResponse>(`/api/professionals/${id}`, { token }),

  updateProfessional: (
    token: string,
    id: string,
    data: {
      full_name?: string;
      license_number?: string;
      speciality?: string;
      phone?: string;
      verification_status?: string;
    }
  ) =>
    apiFetch<ProfessionalResponse>(`/api/professionals/${id}`, {
      method: "PUT",
      body: data,
      token,
    }),

  deleteProfessional: (token: string, id: string) =>
    apiFetch<void>(`/api/professionals/${id}`, { method: "DELETE", token }),

  // ── Admin-only user creation ──────────────────────────────────────────────
  adminCreateTutor: (
    token: string,
    data: {
      full_name: string;
      email: string;
      password: string;
      phone?: string;
      relationship_type?: string;
    }
  ) =>
    apiFetch<TutorResponse>("/api/auth/admin/create-tutor", {
      method: "POST",
      body: data,
      token,
    }),

  adminCreateProfessional: (
    token: string,
    data: {
      full_name: string;
      email: string;
      password: string;
      speciality?: string;
      license_number?: string;
      phone?: string;
    }
  ) =>
    apiFetch<ProfessionalResponse>("/api/auth/admin/create-professional", {
      method: "POST",
      body: data,
      token,
    }),

  adminCreateStudent: (
    token: string,
    tutorId: string,
    data: {
      full_name: string;
      birth_date: string;
      id_degree: string;
      identity_document: string;
    }
  ) =>
    apiFetch<StudentResponse>(
      `/api/students/admin-create?tutor_id=${tutorId}`,
      { method: "POST", body: data, token }
    ),

  updateStudent: (
    token: string,
    id: string,
    data: {
      full_name?: string;
      birth_date?: string;
      id_degree?: string;
      account_status?: string;
      identity_document?: string;
    }
  ) =>
    apiFetch<StudentResponse>(`/api/students/${id}`, {
      method: "PUT",
      body: data,
      token,
    }),

  // ── Reports (admin only) ──────────────────────────────────────────────────
  getReportOverview: (token: string, range?: ReportDateRange) =>
    apiFetch<ReportOverview>(
      `/api/reports/overview${buildRangeQuery(range)}`,
      { token }
    ),

  getReportSessionsOverTime: (token: string, range?: ReportDateRange) =>
    apiFetch<{ date: string; count: number }[]>(
      `/api/reports/sessions-over-time${buildRangeQuery(range, 14)}`,
      { token }
    ),

  getReportEmotionsDistribution: (token: string, range?: ReportDateRange) =>
    apiFetch<{ emotion: string; count: number }[]>(
      `/api/reports/emotions-distribution${buildRangeQuery(range, 30)}`,
      { token }
    ),

  getReportAttentionTrend: (token: string, range?: ReportDateRange) =>
    apiFetch<{ date: string; avg: number }[]>(
      `/api/reports/attention-trend${buildRangeQuery(range, 14)}`,
      { token }
    ),

  getReportCrisisSummary: (token: string, range?: ReportDateRange) =>
    apiFetch<CrisisSummaryReport>(
      `/api/reports/crisis-summary${buildRangeQuery(range, 90)}`,
      { token }
    ),

  getReportTopActivities: (token: string, limit = 10, range?: ReportDateRange) => {
    const q = buildRangeQuery(range);
    const sep = q.includes("?") ? "&" : "?";
    return apiFetch<TopActivity[]>(
      `/api/reports/top-activities${q}${sep}limit=${limit}`,
      { token }
    );
  },

  getReportStudentsByGrade: (token: string) =>
    apiFetch<{ grade_name: string; level: number; count: number }[]>(
      "/api/reports/students-by-grade",
      { token }
    ),

  getReportUsageBySubject: (token: string, range?: ReportDateRange) =>
    apiFetch<UsageBySubject[]>(
      `/api/reports/usage-by-subject${buildRangeQuery(range, 30)}`,
      { token }
    ),

  getReportStimmingRate: (token: string, range?: ReportDateRange) =>
    apiFetch<{ with_stimming: number; total_samples: number; rate: number }>(
      `/api/reports/stimming-rate${buildRangeQuery(range, 30)}`,
      { token }
    ),

  // ── Assisted Sessions ────────────────────────────────────────────────────
  requestAssistedSession: (
    token: string,
    data: { id_tutor: string; id_professional: string; id_student: string; notes?: string }
  ) =>
    apiFetch<AssistedSessionResponse>("/api/assisted-sessions", {
      method: "POST",
      body: data,
      token,
    }),

  getAssistedSessions: (token: string) =>
    apiFetch<AssistedSessionResponse[]>("/api/assisted-sessions", { token }),

  getStudentAssistedSessions: (token: string, studentId: string) =>
    apiFetch<AssistedSessionResponse[]>(`/api/assisted-sessions/by-student/${studentId}`, { token }),

  acceptAssistedSession: (
    token: string,
    sessionId: string,
    data?: { scheduled_at?: string; professional_notes?: string }
  ) =>
    apiFetch<AssistedSessionResponse>(`/api/assisted-sessions/${sessionId}/accept`, {
      method: "PUT",
      body: data ?? {},
      token,
    }),

  sendSessionLink: (token: string, sessionId: string, meeting_link: string) =>
    apiFetch<AssistedSessionResponse>(`/api/assisted-sessions/${sessionId}/send-link`, {
      method: "PUT",
      body: { meeting_link },
      token,
    }),

  closeAssistedSession: (token: string, sessionId: string) =>
    apiFetch<AssistedSessionResponse>(`/api/assisted-sessions/${sessionId}/close`, {
      method: "PUT",
      token,
    }),

  rejectAssistedSession: (token: string, sessionId: string) =>
    apiFetch<AssistedSessionResponse>(`/api/assisted-sessions/${sessionId}/reject`, {
      method: "PUT",
      token,
    }),

  getAvailableProfessionals: (token: string) =>
    apiFetch<ProfessionalResponse[]>("/api/professionals/available", { token }),

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
  birth_date: string;              // "YYYY-MM-DD"
  id_degree: string;
  account_status: string;          // 'activo' | 'inactivo' | 'suspendido'
  avatar_url: string | null;
  identity_document: string | null;
  access_code: string | null;      // solo visible al crear (tutor)
  created_at: string;
}

export interface ProfileResponse {
  id_profile: string;
  id_student: string;
  volume_level: number | null;         // 0-10
  visual_contrast: string | null;      // 'bajo' | 'normal' | 'alto'
  feedback_type: string | null;        // 'visual' | 'auditivo' | 'mixto'
  font_size: string | null;            // 'pequeno' | 'normal' | 'grande'
  animation_speed: string | null;      // 'lenta' | 'normal' | 'rapida'
  max_session_min: number | null;      // minutos
  needs_breaks: boolean;
  break_interval: number | null;       // minutos entre pausas
  is_active: boolean;
  start_date: string | null;
  created_at: string;
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
  activity_type?: string;             // type name from joined query (optional)
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

export interface DiagnosisResponse {
  id_diagnosis: string;
  id_student: string;
  id_type_diagnosis: string;
  description: string | null;
  document_url: string | null;
  registration_date: string | null;
  created_at: string | null;
}

export interface ReportOverview {
  users: {
    students: number;
    tutors: number;
    professionals: number;
    admins: number;
    total: number;
  };
  content: {
    activities: number;
    monitoring_records: number;
  };
  sessions: {
    total: number;
    completed: number;
    last_7_days: number;
    active_students_7d: number;
    avg_minutes: number;
  };
  crisis: {
    total: number;
    unresolved: number;
  };
  wellbeing: {
    avg_attention_30d: number;
  };
}

export interface CrisisSummaryReport {
  by_severity: Record<string, number>;
  by_status: { resolved: number; unresolved: number };
  avg_resolution_minutes: number;
  period_days: number;
}

export interface TopActivity {
  id_activity: string;
  title: string;
  subject: string;
  total_runs: number;
  avg_score: number | null;
  completion_rate: number;
}

export interface UsageBySubject {
  subject: string;
  runs: number;
  completed: number;
  avg_score: number | null;
}

export interface TutorResponse {
  id_tutor: string;
  full_name: string;
  email: string;
  relationship_type: string;
  phone: string | null;
  is_professional: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ProfessionalResponse {
  id_professional: string;
  full_name: string;
  email: string;
  license_number: string;
  speciality: string;
  phone: string | null;
  verification_status: string;       // 'pendiente' | 'aprobado' | 'rechazado'
  is_active: boolean;
  created_at: string;
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

export interface AssistedSessionResponse {
  id_sesion_asistida:      string;
  id_tutor:                string;
  id_professional:         string;
  id_student:              string;
  /** pendiente | aceptada | en_curso | finalizada | rechazada */
  status:                  string;
  notes:                   string | null;
  meeting_link:            string | null;
  requested_at:            string | null;
  accepted_at:             string | null;
  closed_at:               string | null;
  created_at:              string | null;
  scheduled_at:            string | null;
  professional_notes:      string | null;
  tutor_name:              string | null;
  professional_name:       string | null;
  student_name:            string | null;
  professional_speciality: string | null;
}
