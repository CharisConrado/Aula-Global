/**
 * Aula Global — Store global con Zustand
 * Maneja autenticación, sesión activa y estado emocional en tiempo real.
 *
 * NOTA: Los estudiantes NO se autentican. El tutor gestiona al estudiante activo
 * mediante `active_student_id`, que se persiste junto con el token.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  user_id: string;   // UUID del tutor / profesional / admin
  email: string;
  rol: "tutor" | "profesional" | "admin";
}

export interface ActiveSession {
  id_session: string;
  id_student: string;
  start_time: string;
}

export interface EmotionState {
  emocion: string;
  nivel_atencion: number;
  stimming: boolean;
  tactile_pressure: boolean;
}

export interface CrisisAlert {
  id: string;
  student_id: string;  // UUID
  nivel: string;       // 'leve' | 'moderada' | 'grave'
  mensaje: string;
  timestamp: number;
}

interface SessionStore {
  // ── Autenticación ──────────────────────────────────────────
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;

  // ── Estudiante activo (gestionado por el tutor) ────────────
  active_student_id: string | null;
  setActiveStudentId: (id: string | null) => void;

  // ── Sesión activa del estudiante ───────────────────────────
  activeSession: ActiveSession | null;
  setActiveSession: (session: ActiveSession | null) => void;

  // ── Estado emocional en tiempo real ───────────────────────
  emotionState: EmotionState;
  setEmotionState: (state: Partial<EmotionState>) => void;

  // ── Alertas de crisis ──────────────────────────────────────
  crisisAlerts: CrisisAlert[];
  addCrisisAlert: (alert: CrisisAlert) => void;
  dismissCrisisAlert: (id: string) => void;
  clearCrisisAlerts: () => void;

  // ── Acciones de adaptación pendientes ─────────────────────
  pendingActions: string[];
  setPendingActions: (actions: string[]) => void;
  clearPendingActions: () => void;

  // ── UI: pantalla calmante ──────────────────────────────────
  showCalmingScreen: boolean;
  setShowCalmingScreen: (show: boolean) => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      // --- Autenticación ---
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () =>
        set({
          token: null,
          user: null,
          active_student_id: null,
          activeSession: null,
          crisisAlerts: [],
          pendingActions: [],
        }),

      // --- Estudiante activo ---
      active_student_id: null,
      setActiveStudentId: (id) =>
        set({ active_student_id: id, activeSession: null }),

      // --- Sesión ---
      activeSession: null,
      setActiveSession: (session) => set({ activeSession: session }),

      // --- Estado emocional ---
      emotionState: {
        emocion: "neutro",
        nivel_atencion: 0.5,
        stimming: false,
        tactile_pressure: false,
      },
      setEmotionState: (state) =>
        set((prev) => ({
          emotionState: { ...prev.emotionState, ...state },
        })),

      // --- Alertas de crisis ---
      crisisAlerts: [],
      addCrisisAlert: (alert) =>
        set((prev) => ({
          crisisAlerts: [alert, ...prev.crisisAlerts].slice(0, 20),
        })),
      dismissCrisisAlert: (id) =>
        set((prev) => ({
          crisisAlerts: prev.crisisAlerts.filter((a) => a.id !== id),
        })),
      clearCrisisAlerts: () => set({ crisisAlerts: [] }),

      // --- Acciones de adaptación ---
      pendingActions: [],
      setPendingActions: (actions) => set({ pendingActions: actions }),
      clearPendingActions: () => set({ pendingActions: [] }),

      // --- Pantalla calmante ---
      showCalmingScreen: false,
      setShowCalmingScreen: (show) => set({ showCalmingScreen: show }),
    }),
    {
      name: "aula-global-session",
      // Solo se persiste en localStorage lo necesario para restaurar la sesión
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        active_student_id: state.active_student_id,
      }),
    }
  )
);
