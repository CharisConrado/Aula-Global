"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import {
  api,
  type StudentResponse,
  type SessionResponse,
  type CrisisResponse,
} from "@/lib/api";
import {
  TutorMonitoringWebSocket,
  type TutorMonitoringUpdate,
} from "@/lib/websocket";
import { Users, Activity, AlertTriangle, LogOut, Eye, Plus } from "lucide-react";

const EMOTION_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  neutro:    { label: "Tranquilo",   color: "bg-gray-100 text-gray-600",    emoji: "😐" },
  feliz:     { label: "Feliz",       color: "bg-green-100 text-green-700",  emoji: "😄" },
  frustrado: { label: "Frustrado",   color: "bg-orange-100 text-orange-700",emoji: "😤" },
  ansioso:   { label: "Ansioso",     color: "bg-yellow-100 text-yellow-700",emoji: "😰" },
  distraido: { label: "Distraído",   color: "bg-blue-100 text-blue-700",    emoji: "😶‍🌫️" },
  estresado: { label: "Estresado",   color: "bg-red-100 text-red-700",      emoji: "😟" },
  calmado:   { label: "Calmado",     color: "bg-teal-100 text-teal-700",    emoji: "😌" },
};

const CRISIS_COLORS: Record<string, string> = {
  leve:     "bg-yellow-100 border-yellow-300 text-yellow-800",
  moderada: "bg-orange-100 border-orange-300 text-orange-800",
  grave:    "bg-red-100 border-red-400 text-red-800",
};

interface StudentMonitorState {
  emocion: string;
  nivel_atencion: number;
  stimming: boolean;
  alerta_crisis: string | null;
  online: boolean;
}

export default function TutorPage() {
  const router = useRouter();
  const { token, user, logout } = useSessionStore();

  const [students, setStudents]     = useState<StudentResponse[]>([]);
  const [sessions, setSessions]     = useState<Record<number, SessionResponse[]>>({});
  const [activeCrisis, setActiveCrisis] = useState<CrisisResponse[]>([]);
  const [monitorStates, setMonitorStates] = useState<Record<number, StudentMonitorState>>({});
  const [wsConnections, setWsConnections] = useState<Record<number, TutorMonitoringWebSocket>>({});
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState<"estudiantes" | "crisis" | "historial">("estudiantes");

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [studs, crisis] = await Promise.all([
        api.getStudents(token),
        api.getActiveCrisis(token),
      ]);
      setStudents(studs);
      setActiveCrisis(crisis);

      // Cargar sesiones recientes de cada estudiante
      const sessionMap: Record<number, SessionResponse[]> = {};
      await Promise.all(
        studs.map(async (s) => {
          const sess = await api.getSessions(token, {
            student_id: String(s.id),
            limit: "5",
          });
          sessionMap[s.id] = sess;
        })
      );
      setSessions(sessionMap);
    } catch (err) {
      console.error("Error cargando datos del tutor:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user || user.rol !== "tutor") {
      router.replace("/login");
      return;
    }
    loadData();
  }, [token, user, router, loadData]);

  // Conectar WebSocket de monitoreo para cada estudiante
  useEffect(() => {
    if (!token || students.length === 0) return;

    const newWs: Record<number, TutorMonitoringWebSocket> = {};

    students.forEach((student) => {
      const ws = new TutorMonitoringWebSocket(
        student.id,
        token,
        (data: TutorMonitoringUpdate) => {
          setMonitorStates((prev) => ({
            ...prev,
            [student.id]: {
              emocion: data.emocion,
              nivel_atencion: data.nivel_atencion,
              stimming: data.stimming,
              alerta_crisis: data.alerta_crisis,
              online: true,
            },
          }));

          // Refrescar crisis si hay alerta
          if (data.alerta_crisis) {
            api.getActiveCrisis(token).then(setActiveCrisis).catch(() => {});
          }
        },
        (connected) => {
          if (connected) {
            setMonitorStates((prev) => ({
              ...prev,
              [student.id]: {
                ...(prev[student.id] || { emocion: "neutro", nivel_atencion: 0.5, stimming: false, alerta_crisis: null }),
                online: true,
              },
            }));
          }
        }
      );
      ws.connect();
      newWs[student.id] = ws;
    });

    setWsConnections(newWs);

    return () => {
      Object.values(newWs).forEach((ws) => ws.disconnect());
    };
  }, [token, students]);

  const handleLogout = () => {
    Object.values(wsConnections).forEach((ws) => ws.disconnect());
    logout();
    router.replace("/login");
  };

  const handleResolveCrisis = async (crisisId: number) => {
    if (!token) return;
    try {
      await api.resolveCrisis(token, crisisId, {
        resolucion: "Resuelto por tutor desde el dashboard",
      });
      setActiveCrisis((prev) => prev.filter((c) => c.id !== crisisId));
    } catch (err) {
      console.error("Error al resolver crisis:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-lg animate-pulse">Cargando dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Aula Global</h1>
            <p className="text-sm text-gray-400">Panel del Tutor</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Alerta de crisis */}
            {activeCrisis.length > 0 && (
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg cursor-pointer"
                onClick={() => setTab("crisis")}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="font-semibold text-sm">
                  {activeCrisis.length} crisis activa{activeCrisis.length > 1 ? "s" : ""}
                </span>
              </motion.div>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {(["estudiantes", "crisis", "historial"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-semibold capitalize transition-colors border-b-2 ${
                tab === t
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {t === "estudiantes" ? "Mis Estudiantes" : t === "crisis" ? `Crisis (${activeCrisis.length})` : "Historial"}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Tab: Estudiantes */}
        {tab === "estudiantes" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-700">
                <Users className="w-5 h-5 inline mr-2" />
                Estudiantes ({students.length})
              </h2>
              <button
                onClick={() => router.push("/tutor/nuevo-estudiante")}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar estudiante
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {students.map((student) => {
                const state = monitorStates[student.id];
                const emotionInfo = EMOTION_LABELS[state?.emocion || "neutro"] || EMOTION_LABELS.neutro;
                const lastSession = sessions[student.id]?.[0];

                return (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  >
                    {/* Nombre y estado online */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">
                          {student.nombre} {student.apellido}
                        </h3>
                        <p className="text-sm text-gray-400">@{student.username}</p>
                      </div>
                      <span
                        className={`w-3 h-3 rounded-full mt-1 ${
                          state?.online ? "bg-green-400" : "bg-gray-300"
                        }`}
                        title={state?.online ? "En línea" : "Desconectado"}
                      />
                    </div>

                    {/* Estado emocional actual */}
                    {state?.online ? (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                            Estado actual
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${emotionInfo.color}`}>
                            {emotionInfo.emoji} {emotionInfo.label}
                          </span>
                        </div>

                        {/* Barra de atención */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-16">Atención</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${
                                (state?.nivel_atencion || 0) > 0.6
                                  ? "bg-green-400"
                                  : (state?.nivel_atencion || 0) > 0.3
                                  ? "bg-yellow-400"
                                  : "bg-red-400"
                              }`}
                              animate={{ width: `${(state?.nivel_atencion || 0) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-8">
                            {Math.round((state?.nivel_atencion || 0) * 100)}%
                          </span>
                        </div>

                        {state?.stimming && (
                          <p className="text-xs text-orange-500 mt-1">
                            ⚠ Stimming detectado
                          </p>
                        )}

                        {state?.alerta_crisis && (
                          <div
                            className={`mt-2 px-2 py-1 rounded border text-xs font-bold ${
                              CRISIS_COLORS[state.alerta_crisis] || CRISIS_COLORS.leve
                            }`}
                          >
                            🚨 Crisis {state.alerta_crisis}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 mb-4">Sin sesión activa</p>
                    )}

                    {/* Última sesión */}
                    {lastSession && (
                      <div className="border-t border-gray-100 pt-3 mb-4">
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                          Última sesión
                        </p>
                        <div className="flex gap-3 text-xs text-gray-500">
                          {lastSession.nota_cuantitativa !== null && (
                            <span>⭐ {lastSession.nota_cuantitativa}/5</span>
                          )}
                          <span>📚 {lastSession.actividades_completadas} actividades</span>
                          {lastSession.crisis_ocurridas > 0 && (
                            <span className="text-orange-500">
                              ⚠ {lastSession.crisis_ocurridas} crisis
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Acciones */}
                    <button
                      onClick={() => router.push(`/tutor/estudiante/${student.id}`)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Ver perfil completo
                    </button>
                  </motion.div>
                );
              })}

              {students.length === 0 && (
                <div className="col-span-full text-center py-16">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg">
                    Aún no tienes estudiantes registrados
                  </p>
                  <button
                    onClick={() => router.push("/tutor/nuevo-estudiante")}
                    className="mt-4 px-6 py-3 bg-primary-500 text-white rounded-lg font-semibold hover:bg-primary-600 transition-colors"
                  >
                    Registrar primer estudiante
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Crisis */}
        {tab === "crisis" && (
          <div>
            <h2 className="text-xl font-bold text-gray-700 mb-6">
              <AlertTriangle className="w-5 h-5 inline mr-2 text-red-500" />
              Crisis Activas
            </h2>

            {activeCrisis.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">✅</div>
                <p className="text-gray-400 text-lg">No hay crisis activas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeCrisis.map((crisis) => (
                  <motion.div
                    key={crisis.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-5 rounded-xl border-2 ${CRISIS_COLORS[crisis.nivel]}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-lg capitalize">
                            Crisis {crisis.nivel}
                          </span>
                          {crisis.emocion_detectada && (
                            <span className="text-sm opacity-75">
                              — {EMOTION_LABELS[crisis.emocion_detectada]?.emoji || ""}
                              {crisis.emocion_detectada}
                            </span>
                          )}
                        </div>
                        <p className="text-sm opacity-75">{crisis.descripcion}</p>
                        <p className="text-xs opacity-60 mt-1">
                          {new Date(crisis.fecha_inicio).toLocaleString("es-CO")}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/tutor/estudiante/${crisis.student_id}`)}
                          className="px-3 py-2 bg-white/60 rounded-lg text-sm font-semibold hover:bg-white/80 transition-colors"
                        >
                          Ver estudiante
                        </button>
                        <button
                          onClick={() => handleResolveCrisis(crisis.id)}
                          className="px-3 py-2 bg-white rounded-lg text-sm font-semibold shadow hover:shadow-md transition-shadow"
                        >
                          Resolver
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Historial */}
        {tab === "historial" && (
          <div>
            <h2 className="text-xl font-bold text-gray-700 mb-6">
              <Activity className="w-5 h-5 inline mr-2" />
              Historial de Sesiones
            </h2>

            <div className="space-y-6">
              {students.map((student) => {
                const studentSessions = sessions[student.id] || [];
                if (studentSessions.length === 0) return null;

                return (
                  <div key={student.id}>
                    <h3 className="font-bold text-gray-600 mb-3">
                      {student.nombre} {student.apellido}
                    </h3>
                    <div className="space-y-2">
                      {studentSessions.map((session) => (
                        <div
                          key={session.id}
                          className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold text-gray-700">
                              {new Date(session.fecha_inicio).toLocaleDateString("es-CO", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                              })}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {session.duracion_total
                                ? `${Math.round(session.duracion_total / 60)} min`
                                : "En progreso"}
                            </p>
                          </div>

                          <div className="flex gap-4 text-sm">
                            {session.nota_cuantitativa !== null && (
                              <div className="text-center">
                                <p className="font-bold text-lg text-primary-600">
                                  {session.nota_cuantitativa}
                                </p>
                                <p className="text-xs text-gray-400">nota</p>
                              </div>
                            )}
                            <div className="text-center">
                              <p className="font-bold text-lg text-gray-700">
                                {session.actividades_completadas}
                              </p>
                              <p className="text-xs text-gray-400">actividades</p>
                            </div>
                            {session.crisis_ocurridas > 0 && (
                              <div className="text-center">
                                <p className="font-bold text-lg text-orange-500">
                                  {session.crisis_ocurridas}
                                </p>
                                <p className="text-xs text-gray-400">crisis</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
