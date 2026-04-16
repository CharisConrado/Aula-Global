/**
 * Aula Global — Store global con Zustand
 * Maneja autenticación, sesión activa, estado emocional y alertas.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  user_id: number;
  email: string;
  rol: "estudiante" | "tutor" | "profesional" | "admin";
}

interface ActiveSession {
  id: number;
  student_id: number;
  fecha_inicio: string;
}

interface EmotionState {
  emocion: string;
  nivel_atencion: number;
  stimming: boolean;
  presion_tactil: number;
}

interface CrisisAlert {
  id: string;
  student_id: number;
  nivel: string;
  mensaje: string;
  timestamp: number;
}

interface SessionStore {
  // Autenticación
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;

  // Sesión activa del estudiante
  activeSession: ActiveSession | null;
  setActiveSession: (session: ActiveSession | null) => void;

  // Estado emocional en tiempo real
  emotionState: EmotionState;
  setEmotionState: (state: Partial<EmotionState>) => void;

  // Alertas de crisis
  crisisAlerts: CrisisAlert[];
  addCrisisAlert: (alert: CrisisAlert) => void;
  dismissCrisisAlert: (id: string) => void;
  clearCrisisAlerts: () => void;

  // Acciones de adaptación pendientes
  pendingActions: string[];
  setPendingActions: (actions: string[]) => void;
  clearPendingActions: () => void;

  // UI: pantalla calmante
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
          activeSession: null,
          crisisAlerts: [],
          pendingActions: [],
        }),

      // --- Sesión ---
      activeSession: null,
      setActiveSession: (session) => set({ activeSession: session }),

      // --- Estado emocional ---
      emotionState: {
        emocion: "neutro",
        nivel_atencion: 0.5,
        stimming: false,
        presion_tactil: 0,
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
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
    }
  )
);
