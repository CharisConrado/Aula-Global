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
  // --- Auth ---
  login: (email: string, password: string) =>
    apiFetch<{
      access_token: string;
      token_type: string;
      rol: string;
      user_id: number;
    }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    }),

  register: (data: {
    email: string;
    password: string;
    nombre: string;
    apellido: string;
    rol: string;
  }) =>
    apiFetch<{
      access_token: string;
      token_type: string;
      rol: string;
      user_id: number;
    }>("/api/auth/register", { method: "POST", body: data }),

  getMe: (token: string) =>
    apiFetch<{ user_id: number; email: string; rol: string }>("/api/auth/me", {
      token,
    }),

  // --- Students ---
  getStudents: (token: string, params?: Record<string, string>) => {
    const query = params
      ? "?" + new URLSearchParams(params).toString()
      : "";
    return apiFetch<StudentResponse[]>(`/api/students${query}`, { token });
  },

  getStudent: (token: string, id: number) =>
    apiFetch<StudentResponse>(`/api/students/${id}`, { token }),

  createStudent: (token: string, data: unknown) =>
    apiFetch<StudentResponse>("/api/students", {
      method: "POST",
      body: data,
      token,
    }),

  getStudentProfile: (token: string, id: number) =>
    apiFetch<ProfileResponse>(`/api/students/${id}/profile`, { token }),

  // --- Sessions ---
  createSession: (token: string, studentId: number) =>
    apiFetch<SessionResponse>("/api/sessions", {
      method: "POST",
      body: { student_id: studentId },
      token,
    }),

  getSessions: (token: string, params?: Record<string, string>) => {
    const query = params
      ? "?" + new URLSearchParams(params).toString()
      : "";
    return apiFetch<SessionResponse[]>(`/api/sessions${query}`, { token });
  },

  closeSession: (token: string, sessionId: number, data?: unknown) =>
    apiFetch<SessionResponse>(`/api/sessions/${sessionId}/close`, {
      method: "PUT",
      body: data || {},
      token,
    }),

  // --- Activities ---
  getActivities: (token: string, params?: Record<string, string>) => {
    const query = params
      ? "?" + new URLSearchParams(params).toString()
      : "";
    return apiFetch<ActivityResponse[]>(`/api/activities${query}`, { token });
  },

  getActivity: (token: string, id: number) =>
    apiFetch<ActivityResponse>(`/api/activities/${id}`, { token }),

  getDegrees: () => apiFetch<DegreeResponse[]>("/api/activities/degrees"),

  getSubjects: (params?: Record<string, string>) => {
    const query = params
      ? "?" + new URLSearchParams(params).toString()
      : "";
    return apiFetch<SubjectResponse[]>(`/api/activities/subjects${query}`);
  },

  // --- Session activities ---
  startActivity: (
    token: string,
    sessionId: number,
    data: { session_id: number; activity_id: number; student_id: number }
  ) =>
    apiFetch<StudentActivityResponse>(
      `/api/sessions/${sessionId}/activities`,
      { method: "POST", body: data, token }
    ),

  updateActivity: (
    token: string,
    sessionId: number,
    recordId: number,
    data: unknown
  ) =>
    apiFetch<StudentActivityResponse>(
      `/api/sessions/${sessionId}/activities/${recordId}`,
      { method: "PUT", body: data, token }
    ),

  // --- Crisis ---
  getActiveCrisis: (token: string) =>
    apiFetch<CrisisResponse[]>("/api/crisis/active", { token }),

  resolveCrisis: (token: string, crisisId: number, data: unknown) =>
    apiFetch<CrisisResponse>(`/api/crisis/${crisisId}/resolve`, {
      method: "PUT",
      body: data,
      token,
    }),

  // --- Monitoring ---
  getMonitoringStatus: (token: string, studentId: number) =>
    apiFetch<MonitoringStatus>(`/api/monitoring/status/${studentId}`, {
      token,
    }),

  // --- Interventions ---
  createIntervention: (token: string, data: unknown) =>
    apiFetch<InterventionResponse>("/api/interventions", {
      method: "POST",
      body: data,
      token,
    }),

  requestExternalConsult: (
    token: string,
    studentId: number,
    descripcion: string
  ) =>
    apiFetch<InterventionResponse>(
      `/api/interventions/request-external?student_id=${studentId}&descripcion=${encodeURIComponent(descripcion)}`,
      { method: "POST", token }
    ),
};

// --- Tipos ---
export interface StudentResponse {
  id: number;
  nombre: string;
  apellido: string;
  fecha_nacimiento: string;
  grado_id: number;
  tutor_id: number;
  username: string;
  is_active: boolean;
  created_at: string;
}

export interface ProfileResponse {
  id: number;
  student_id: number;
  sensibilidad_visual: string | null;
  sensibilidad_auditiva: string | null;
  nivel_atencion_base: number | null;
  prefiere_formato: string | null;
  tiempo_max_actividad: number | null;
  necesita_pausas: boolean;
  frecuencia_pausas: number | null;
  alto_contraste: boolean;
  tamano_fuente: string | null;
  notas_adicionales: string | null;
}

export interface SessionResponse {
  id: number;
  student_id: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  duracion_total: number | null;
  actividades_completadas: number;
  nota_cuantitativa: number | null;
  nota_cualitativa: string | null;
  crisis_ocurridas: number;
  intervenciones_realizadas: number;
  is_active: boolean;
}

export interface ActivityResponse {
  id: number;
  titulo: string;
  descripcion: string | null;
  subject_id: number;
  type_activity_id: number;
  dificultad: string;
  contenido_json: Record<string, unknown> | null;
  duracion_estimada: number | null;
  puntos: number;
  orden: number;
  is_active: boolean;
}

export interface StudentActivityResponse {
  id: number;
  session_id: number;
  activity_id: number;
  student_id: number;
  nota: number | null;
  completada: boolean;
  tiempo_dedicado: number | null;
  intentos: number;
  formato_usado: string | null;
  stimming_detectado: boolean;
  presion_tactil: string | null;
  nivel_atencion_promedio: number | null;
  respuestas_json: Record<string, unknown> | null;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface DegreeResponse {
  id: number;
  name: string;
  grade_number: number;
}

export interface SubjectResponse {
  id: number;
  name: string;
  degree_id: number;
  description: string | null;
}

export interface CrisisResponse {
  id: number;
  session_id: number;
  student_id: number;
  nivel: string;
  emocion_detectada: string | null;
  descripcion: string | null;
  resuelta: boolean;
  resolucion: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface InterventionResponse {
  id: number;
  crisis_id: number | null;
  student_id: number;
  professional_id: number | null;
  tipo: string;
  descripcion: string | null;
  completada: boolean;
  notas: string | null;
  resultado: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
}

export interface MonitoringStatus {
  status: string;
  student_id?: number;
  session_id?: number;
  emocion_actual?: string;
  nivel_atencion?: number;
  stimming?: boolean;
  presion_tactil?: number;
  ultima_crisis?: string | null;
  mensaje?: string;
}
