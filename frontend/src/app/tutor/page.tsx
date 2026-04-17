"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import {
  api,
  type StudentResponse,
  type CrisisResponse,
} from "@/lib/api";
import {
  TutorMonitoringWebSocket,
  type TutorMonitoringUpdate,
} from "@/lib/websocket";
import {
  Users,
  Activity,
  AlertTriangle,
  LogOut,
  Eye,
  Plus,
  Play,
} from "lucide-react";

const EMOTION_LABELS: Record<
  string,
  { label: string; color: string; emoji: string }
> = {
  neutro:    { label: "Tranquilo",  color: "bg-gray-100 text-gray-600",     emoji: "😐" },
  feliz:     { label: "Feliz",      color: "bg-green-100 text-green-700",   emoji: "😄" },
  frustrado: { label: "Frustrado",  color: "bg-orange-100 text-orange-700", emoji: "😤" },
  ansioso:   { label: "Ansioso",    color: "bg-yellow-100 text-yellow-700", emoji: "😰" },
  distraido: { label: "Distraído",  color: "bg-blue-100 text-blue-700",     emoji: "😶‍🌫️" },
  estresado: { label: "Estresado",  color: "bg-red-100 text-red-700",       emoji: "😟" },
  calmado:   { label: "Calmado",    color: "bg-teal-100 text-teal-700",     emoji: "😌" },
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
  const { token, user, logout, setActiveStudentId } = useSessionStore();

  const [students, setStudents]         = useState<StudentResponse[]>([]);
  const [activeCrisis, setActiveCrisis] = useState<CrisisResponse[]>([]);
  const [monitorStates, setMonitorStates] = useState<
    Record<string, StudentMonitorState>
  >({});
  const [wsConnections, setWsConnections] = useState<
    Record<string, TutorMonitoringWebSocket>
  >({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"estudiantes" | "crisis" | "historial">(
    "estudiantes"
  );

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [studs, crisis] = await Promise.all([
        api.getStudents(token),
        api.getActiveCrisis(token),
      ]);
      setStudents(studs);
      setActiveCrisis(crisis);
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

    const newWs: Record<string, TutorMonitoringWebSocket> = {};

    students.forEach((student) => {
      const ws = new TutorMonitoringWebSocket(
        student.id_student,
        token,
        (data: TutorMonitoringUpdate) => {
          setMonitorStates((prev) => ({
            ...prev,
            [student.id_student]: {
              emocion: data.emocion,
              nivel_atencion: data.nivel_atencion,
              stimming: data.stimming,
              alerta_crisis: data.alerta_crisis,
              online: true,
            },
          }));

          if (data.alerta_crisis) {
            api
              .getActiveCrisis(token)
              .then(setActiveCrisis)
              .catch(() => {});
          }
        },
        (connected) => {
          if (connected) {
            setMonitorStates((prev) => ({
              ...prev,
              [student.id_student]: {
                ...(prev[student.id_student] || {
                  emocion: "neutro",
                  nivel_atencion: 0.5,
                  stimming: false,
                  alerta_crisis: null,
                }),
                online: true,
              },
            }));
          } else {
            setMonitorStates((prev) => ({
              ...prev,
              [student.id_student]: {
                ...(prev[student.id_student] || {
                  emocion: "neutro",
                  nivel_atencion: 0,
                  stimming: false,
                  alerta_crisis: null,
                }),
                online: false,
              },
            }));
          }
        }
      );
      ws.connect();
      newWs[student.id_student] = ws;
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

  /** Selecciona el estudiante activo y navega a la vista del estudiante */
  const handleIniciarSesion = (studentId: string) => {
    setActiveStudentId(studentId);
    router.push("/estudiante");
  };

  const handleResolveCrisis = async (crisisId: string) => {
    if (!token) return;
    try {
      await api.resolveCrisis(token, crisisId, {
        was_effective: true,
        notes: "Resuelto por tutor desde el dashboard",
      });
      setActiveCrisis((prev) =>
        prev.filter((c) => c.id_crisis !== crisisId)
      );
    } catch (err) {
      console.error("Error al resolver crisis:", err);
    }
  };

  /** Formatea duración en segundos a texto legible */
  const formatDuration = (secs: number | null) => {
    if (!secs) return null;
    const m = Math.floor(secs / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-lg animate-pulse">
          Cargando dashboard...
        </p>
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
            <p className="text-sm text-gray-400">
              Panel del Tutor — {user?.email}
            </p>
          </div>

          <div className="flex items-center gap-4">
            {activeCrisis.length > 0 && (
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg cursor-pointer"
                onClick={() => setTab("crisis")}
              >
                <AlertTriangle className="w-4 h-4" />
                <span className="font-semibold text-sm">
                  {activeCrisis.length} crisis activa
                  {activeCrisis.length > 1 ? "s" : ""}
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
              {t === "estudiantes"
                ? "Mis Estudiantes"
                : t === "crisis"
                ? `Crisis (${activeCrisis.length})`
                : "Historial"}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ── Tab: Estudiantes ── */}
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
                const state = monitorStates[student.id_student];
                const emotionInfo =
                  EMOTION_LABELS[state?.emocion || "neutro"] ||
                  EMOTION_LABELS.neutro;

                return (
                  <motion.div
                    key={student.id_student}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  >
                    {/* Nombre y estado online */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">
                          {student.full_name}
                        </h3>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Estado:{" "}
                          <span
                            className={
                              student.account_status === "activo"
                                ? "text-green-600"
                                : "text-red-500"
                            }
                          >
                            {student.account_status}
                          </span>
                        </p>
                      </div>
                      <span
                        className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                          state?.online ? "bg-green-400" : "bg-gray-300"
                        }`}
                        title={state?.online ? "En línea" : "Desconectado"}
                      />
                    </div>

                    {/* Estado emocional en tiempo real */}
                    {state?.online ? (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                            Estado actual
                          </span>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-bold ${emotionInfo.color}`}
                          >
                            {emotionInfo.emoji} {emotionInfo.label}
                          </span>
                        </div>

                        {/* Barra de atención */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-16">
                            Atención
                          </span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${
                                (state?.nivel_atencion || 0) > 0.6
                                  ? "bg-green-400"
                                  : (state?.nivel_atencion || 0) > 0.3
                                  ? "bg-yellow-400"
                                  : "bg-red-400"
                              }`}
                              animate={{
                                width: `${(state?.nivel_atencion || 0) * 100}%`,
                              }}
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
                              CRISIS_COLORS[state.alerta_crisis] ||
                              CRISIS_COLORS.leve
                            }`}
                          >
                            🚨 Crisis {state.alerta_crisis}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 mb-4">
                        Sin sesión activa
                      </p>
                    )}

                    {/* Acciones */}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() =>
                          router.push(`/tutor/estudiante/${student.id_student}`)
                        }
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Perfil
                      </button>

                      <button
                        onClick={() =>
                          handleIniciarSesion(student.id_student)
                        }
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        Iniciar sesión
                      </button>
                    </div>
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

        {/* ── Tab: Crisis ── */}
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
                {activeCrisis.map((crisis) => {
                  // Determinar nivel de gravedad a partir del notes o un mapeo por tipo
                  const nivelLabel =
                    crisis.notes?.includes("grave")
                      ? "grave"
                      : crisis.notes?.includes("moderada")
                      ? "moderada"
                      : "leve";

                  return (
                    <motion.div
                      key={crisis.id_crisis}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-5 rounded-xl border-2 ${
                        CRISIS_COLORS[nivelLabel]
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg capitalize">
                              Crisis {nivelLabel}
                            </span>
                          </div>
                          {crisis.notes && (
                            <p className="text-sm opacity-75">{crisis.notes}</p>
                          )}
                          <p className="text-xs opacity-60 mt-1">
                            {crisis.detection_timestamp
                              ? new Date(
                                  crisis.detection_timestamp
                                ).toLocaleString("es-CO")
                              : "—"}
                          </p>
                          <p className="text-xs opacity-60">
                            Requiere humano:{" "}
                            <strong>
                              {crisis.required_human ? "Sí" : "No"}
                            </strong>
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              router.push(
                                `/tutor/estudiante/${crisis.id_student}`
                              )
                            }
                            className="px-3 py-2 bg-white/60 rounded-lg text-sm font-semibold hover:bg-white/80 transition-colors"
                          >
                            Ver estudiante
                          </button>
                          <button
                            onClick={() =>
                              handleResolveCrisis(crisis.id_crisis)
                            }
                            className="px-3 py-2 bg-white rounded-lg text-sm font-semibold shadow hover:shadow-md transition-shadow"
                          >
                            Resolver
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Historial ── */}
        {tab === "historial" && (
          <div>
            <h2 className="text-xl font-bold text-gray-700 mb-6">
              <Activity className="w-5 h-5 inline mr-2" />
              Historial de Sesiones
            </h2>

            <div className="space-y-4">
              {students.map((student) => (
                <div
                  key={student.id_student}
                  className="bg-white rounded-xl border border-gray-200 p-5"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-800">
                      {student.full_name}
                    </h3>
                    <button
                      onClick={() =>
                        router.push(`/tutor/estudiante/${student.id_student}`)
                      }
                      className="text-sm text-primary-500 hover:text-primary-600 font-semibold"
                    >
                      Ver historial completo →
                    </button>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">
                    Accede al perfil del estudiante para ver el historial
                    detallado de sesiones y actividades.
                  </p>
                </div>
              ))}

              {students.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  No hay estudiantes registrados
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
