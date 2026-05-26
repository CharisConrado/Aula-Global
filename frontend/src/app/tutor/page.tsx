"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import {
  api,
  type StudentResponse,
  type CrisisResponse,
  type SessionResponse,
  type StudentActivityResponse,
} from "@/lib/api";
import {
  TutorMonitoringWebSocket,
  type TutorMonitoringUpdate,
} from "@/lib/websocket";
import TutorMonitoringPanel, { type EmotionEntry } from "@/components/monitoring/TutorMonitoringPanel";
import {
  Users,
  Activity,
  AlertTriangle,
  LogOut,
  Eye,
  Plus,
  Trash2,
  ChevronRight,
  Menu,
} from "lucide-react";

/* ── ID compuesto del estudiante ────────────────────────────── */
function buildDisplayId(
  name: string,
  doc: string | null | undefined,
  createdAt: string | null | undefined
): string {
  const namePart = name.replace(/\s+/g, "").substring(0, 4).toUpperCase();
  const docPart  = doc ? doc : "----";
  const yearPart = createdAt
    ? new Date(createdAt).getFullYear().toString().slice(-2)
    : new Date().getFullYear().toString().slice(-2);
  return `${namePart}-${docPart}-${yearPart}`;
}

/* ── Logo de Aula Global ─────────────────────────────────────── */
function SidebarLogo() {
  return (
    <Image
      src="/logo.png"
      alt="Aula Global"
      width={44}
      height={44}
      style={{ objectFit: "contain" }}
      priority
    />
  );
}

/* ── Constantes ─────────────────────────────────────────────────── */

const CRISIS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  leve:     { bg: "#fefce8", border: "#fde047", text: "#854d0e" },
  moderada: { bg: "#fff7ed", border: "#fb923c", text: "#9a3412" },
  grave:    { bg: "#fef2f2", border: "#f87171", text: "#991b1b" },
};

interface StudentMonitorState {
  emocion: string;
  nivel_atencion: number;
  stimming: boolean;
  alerta_crisis: string | null;
  online: boolean;
  emotionHistory: EmotionEntry[];
  videoFrame?: string | null;
}

interface LiveSession {
  id_session: string;
  currentActivity: string | null;
  startTime: string | null;
  activityCount: number;
}

type NavTab = "estudiantes" | "crisis" | "historial";

/* ════════════════════════════════════════════════════════════════ */
export default function TutorPage() {
  const router = useRouter();
  const { token, user, logout } = useSessionStore();

  const [students, setStudents]           = useState<StudentResponse[]>([]);
  const [activeCrisis, setActiveCrisis]   = useState<CrisisResponse[]>([]);
  const [monitorStates, setMonitorStates] = useState<Record<string, StudentMonitorState>>({});
  const [wsConnections, setWsConnections] = useState<Record<string, TutorMonitoringWebSocket>>({});
  const [loading, setLoading]             = useState(true);
  const [tab, setTab]                     = useState<NavTab>("estudiantes");
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const onlineTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [liveSessions, setLiveSessions]   = useState<Record<string, LiveSession>>({});
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [studentSessions, setStudentSessions] = useState<Record<string, SessionResponse[]>>({});
  const [loadingSessions, setLoadingSessions] = useState<string | null>(null);
  const [sessionActivities, setSessionActivities] = useState<Record<string, StudentActivityResponse[]>>({});
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  /* ── Carga inicial ── */
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

  /* ── fetchLiveSession ── */
  const fetchLiveSession = useCallback(async (studentId: string) => {
    if (!token) return;
    try {
      const sessions = await api.getSessions(token, { student_id: studentId, status: "activa" });
      if (sessions && sessions.length > 0) {
        const sess = sessions[0];
        let currentActivity: string | null = null;
        let activityCount = 0;
        try {
          const acts = await api.getSessionActivities(token, sess.id_session);
          activityCount = acts.length;
          const last = acts[acts.length - 1];
          if (last && !last.is_completed) {
            const actDetail = await api.getActivity(token, last.id_activity);
            currentActivity = actDetail.title;
          }
        } catch {}
        setLiveSessions(prev => ({
          ...prev,
          [studentId]: {
            id_session: sess.id_session,
            currentActivity,
            startTime: sess.start_time || null,
            activityCount,
          },
        }));
      } else {
        setLiveSessions(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      }
    } catch {}
  }, [token]);

  /* ── loadStudentSessions ── */
  const loadStudentSessions = useCallback(async (studentId: string) => {
    if (!token || studentSessions[studentId]) { setExpandedStudent(studentId); return; }
    setLoadingSessions(studentId);
    try {
      const sessions = await api.getSessions(token, { student_id: studentId });
      setStudentSessions(prev => ({ ...prev, [studentId]: sessions || [] }));
      setExpandedStudent(studentId);
    } catch {} finally {
      setLoadingSessions(null);
    }
  }, [token, studentSessions]);

  /* ── loadSessionActivities ── */
  const loadSessionActivities = useCallback(async (sessionId: string) => {
    if (!token || sessionActivities[sessionId]) { setExpandedSession(prev => prev === sessionId ? null : sessionId); return; }
    try {
      const acts = await api.getSessionActivities(token, sessionId);
      setSessionActivities(prev => ({ ...prev, [sessionId]: acts || [] }));
      setExpandedSession(prev => prev === sessionId ? null : sessionId);
    } catch {}
  }, [token, sessionActivities]);

  /* ── formatDuration ── */
  const formatDuration = (startTime: string | null): string => {
    if (!startTime) return "";
    const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  /* ── WebSockets de monitoreo ── */
  useEffect(() => {
    if (!token || students.length === 0) return;
    const newWs: Record<string, TutorMonitoringWebSocket> = {};

    students.forEach((student) => {
      const sid = student.id_student;
      const ws = new TutorMonitoringWebSocket(
        sid, token,
        (data: TutorMonitoringUpdate) => {
          const empty = { emocion: "neutro", nivel_atencion: 0.5, stimming: false, alerta_crisis: null, emotionHistory: [] as EmotionEntry[] };

          // Cualquier mensaje (frame o monitoring) reinicia el timeout de offline
          clearTimeout(onlineTimeoutsRef.current[sid]);
          onlineTimeoutsRef.current[sid] = setTimeout(() => {
            setMonitorStates((prev) => ({
              ...prev,
              [sid]: { ...(prev[sid] || empty), online: false, videoFrame: null },
            }));
          }, 4000);

          // ── Frame de video puro (alta frecuencia): solo refresca la imagen ──
          if (data.type === "frame_update") {
            setMonitorStates((prev) => {
              const cur = prev[sid] || empty;
              return {
                ...prev,
                [sid]: { ...cur, online: true, videoFrame: data.video_frame ?? cur.videoFrame },
              };
            });
            return;
          }

          // ── Monitoring completo (cada 2s): emoción + atención + historial ──
          const emocion       = data.emocion        ?? "neutro";
          const nivelAtencion = data.nivel_atencion ?? 0.5;
          setMonitorStates((prev) => {
            const prevState = prev[sid];
            const newEntry: EmotionEntry = { emotion: emocion, attention: nivelAtencion, time: Date.now() };
            const prevHistory = prevState?.emotionHistory || [];
            const emotionHistory = [...prevHistory, newEntry].slice(-20);
            return {
              ...prev,
              [sid]: {
                emocion, nivel_atencion: nivelAtencion,
                stimming:      data.stimming      ?? false,
                alerta_crisis: data.alerta_crisis ?? null,
                online: true, emotionHistory,
                videoFrame: prevState?.videoFrame ?? null,
              },
            };
          });
          if (data.alerta_crisis) api.getActiveCrisis(token).then(setActiveCrisis).catch(() => {});
        },
        (connected) => {
          if (!connected) {
            // Tutor WS se desconectó del backend → estudiante offline
            clearTimeout(onlineTimeoutsRef.current[sid]);
            setMonitorStates((prev) => ({
              ...prev,
              [sid]: {
                ...(prev[sid] || { emocion: "neutro", nivel_atencion: 0.5, stimming: false, alerta_crisis: null, emotionHistory: [] }),
                online: false, videoFrame: null,
              },
            }));
          } else {
            fetchLiveSession(sid);
          }
        }
      );
      ws.connect();
      newWs[sid] = ws;
    });

    setWsConnections(newWs);
    return () => {
      Object.values(newWs).forEach((ws) => ws.disconnect());
      Object.values(onlineTimeoutsRef.current).forEach(clearTimeout);
    };
  }, [token, students, fetchLiveSession]);

  /* ── Acciones ── */
  const handleLogout = () => {
    Object.values(wsConnections).forEach((ws) => ws.disconnect());
    logout();
    router.replace("/login");
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!token) return;
    try {
      await api.deleteStudent(token, studentId);
      setStudents((prev) => prev.filter((s) => s.id_student !== studentId));
    } catch (err) {
      console.error("Error al eliminar estudiante:", err);
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleResolveCrisis = async (crisisId: string) => {
    if (!token) return;
    try {
      await api.resolveCrisis(token, crisisId, {
        was_effective: true,
        notes: "Resuelto por tutor desde el dashboard",
      });
      setActiveCrisis((prev) => prev.filter((c) => c.id_crisis !== crisisId));
    } catch (err) {
      console.error("Error al resolver crisis:", err);
    }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FDF8F2" }}>
        <motion.div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-14 h-14 rounded-full border-4 mx-auto"
            style={{ borderColor: "#D5DBDB", borderTopColor: "#7FB3D5" }}
          />
          <p className="font-bold text-base" style={{ color: "#7FB3D5" }}>Cargando dashboard…</p>
        </motion.div>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────── */
  /* NAV ITEMS                                                        */
  /* ────────────────────────────────────────────────────────────── */
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "estudiantes", label: "Mis Estudiantes", icon: <Users className="w-5 h-5" />, badge: students.length },
    { id: "crisis",      label: "Crisis",          icon: <AlertTriangle className="w-5 h-5" />, badge: activeCrisis.length },
    { id: "historial",   label: "Historial",       icon: <Activity className="w-5 h-5" /> },
  ];

  /* ────────────────────────────────────────────────────────────── */
  /* RENDER                                                           */
  /* ────────────────────────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#FDF8F2" }}>

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside
        className={`fixed top-0 left-0 h-full flex flex-col z-30 transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{
          width: 256,
          background: "white",
          borderRight: "1.5px solid #D5DBDB",
          boxShadow: "4px 0 24px rgba(127,179,213,0.10)",
        }}
      >
        {/* Logo + brand */}
        <div className="flex items-center gap-3 px-5 py-6" style={{ borderBottom: "1.5px solid #D5DBDB" }}>
          <SidebarLogo />
          <div>
            <p className="text-base font-extrabold leading-tight" style={{ color: "#4587a9" }}>Aula Global</p>
            <p className="text-xs font-medium" style={{ color: "#a0aec0" }}>Plataforma Educativa</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = tab === item.id;
            const isCrisis = item.id === "crisis" && (item.badge ?? 0) > 0;
            return (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setSidebarOpen(false); }}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 group"
                style={
                  active
                    ? { background: "#E1EFFF", color: "#4587a9" }
                    : { color: "#7f8c8d" }
                }
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f8f9fa"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <div className="flex items-center gap-3">
                  <span style={{ color: active ? "#7FB3D5" : isCrisis ? "#ef4444" : "#a0aec0" }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={
                      isCrisis
                        ? { background: "#fee2e2", color: "#dc2626" }
                        : { background: "#E1EFFF", color: "#7FB3D5" }
                    }
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Separator */}
          <div className="pt-3 pb-1">
            <div style={{ height: 1, background: "#D5DBDB" }} />
          </div>

          {/* Agregar estudiante shortcut */}
          <button
            onClick={() => router.push("/tutor/nuevo-estudiante")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200"
            style={{ color: "#FFB37B" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fff7ed"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <Plus className="w-5 h-5" />
            <span>Nuevo estudiante</span>
          </button>
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4" style={{ borderTop: "1.5px solid #D5DBDB" }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #7FB3D5, #5a9ec2)" }}
            >
              {user?.email?.charAt(0).toUpperCase() ?? "T"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: "#34495E" }}>Tutor</p>
              <p className="text-xs truncate" style={{ color: "#a0aec0" }}>{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{ color: "#a0aec0" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.color = "#ef4444"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#a0aec0"; }}
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ══════════════════ MAIN CONTENT ══════════════════ */}
      <div className="flex-1 flex flex-col lg:ml-[256px]">

        {/* Top bar */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-4 md:px-8 py-4"
          style={{
            background: "rgba(253,248,242,0.92)",
            backdropFilter: "blur(8px)",
            borderBottom: "1.5px solid #D5DBDB",
          }}
        >
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-2 rounded-xl" style={{ color: "#7f8c8d" }} onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <div>
            <h1 className="text-lg md:text-xl font-extrabold" style={{ color: "#34495E" }}>
              {tab === "estudiantes" && "Mis Estudiantes"}
              {tab === "crisis"      && "Crisis Activas"}
              {tab === "historial"   && "Historial de Sesiones"}
            </h1>
            <p className="text-xs mt-0.5 hidden sm:block" style={{ color: "#a0aec0" }}>
              {tab === "estudiantes" && `${students.length} estudiante${students.length !== 1 ? "s" : ""} registrado${students.length !== 1 ? "s" : ""}`}
              {tab === "crisis"      && `${activeCrisis.length} alerta${activeCrisis.length !== 1 ? "s" : ""} activa${activeCrisis.length !== 1 ? "s" : ""}`}
              {tab === "historial"   && "Accede al perfil para ver detalles"}
            </p>
            </div>
          </div>

          {/* Crisis badge flotante */}
          {activeCrisis.length > 0 && tab !== "crisis" && (
            <motion.button
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              onClick={() => setTab("crisis")}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
              style={{
                background: "#fee2e2",
                border: "1.5px solid #fca5a5",
                color: "#dc2626",
              }}
            >
              <AlertTriangle className="w-4 h-4" />
              {activeCrisis.length} crisis activa{activeCrisis.length > 1 ? "s" : ""}
            </motion.button>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 px-4 md:px-8 py-4 md:py-8">
          <AnimatePresence mode="wait">

            {/* ── Tab: Estudiantes ── */}
            {tab === "estudiantes" && (
              <motion.div
                key="estudiantes"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div />
                  <button
                    onClick={() => router.push("/tutor/nuevo-estudiante")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                    style={{
                      background: "linear-gradient(135deg,#FFB37B,#ff9450)",
                      boxShadow: "0 3px 14px rgba(255,148,80,0.38)",
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Agregar estudiante
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {students.map((student, index) => {
                    const state = monitorStates[student.id_student];

                    return (
                      <motion.div
                        key={student.id_student}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.06 }}
                        className="rounded-[1.25rem] p-5 flex flex-col"
                        style={{
                          background: "white",
                          border: "1.5px solid #D5DBDB",
                          boxShadow: "0 2px 12px rgba(127,179,213,0.09)",
                        }}
                      >
                        {/* Header de la tarjeta */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            {/* Avatar inicial */}
                            <div
                              className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-black text-white flex-shrink-0"
                              style={{ background: "linear-gradient(135deg,#7FB3D5,#5a9ec2)" }}
                            >
                              {student.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h3 className="text-sm font-extrabold leading-tight" style={{ color: "#34495E" }}>
                                {student.full_name}
                              </h3>
                              <p className="text-[10px] font-mono mt-0.5" style={{ color: "#a0aec0" }}>
                                {buildDisplayId(student.full_name, student.identity_document, student.created_at)}
                              </p>
                              <span
                                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                style={
                                  student.account_status === "activo"
                                    ? { background: "#dcfce7", color: "#16a34a" }
                                    : { background: "#fee2e2", color: "#dc2626" }
                                }
                              >
                                {student.account_status}
                              </span>
                            </div>
                          </div>

                          {/* Indicador online */}
                          <div
                            className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
                            style={{ background: state?.online ? "#4ade80" : "#D5DBDB" }}
                            title={state?.online ? "En línea" : "Desconectado"}
                          />
                        </div>

                        {/* Actividad en vivo */}
                        {state?.online && liveSessions[student.id_student] && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold mb-2"
                            style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", border: "1px solid rgba(162,217,161,0.4)" }}>
                            <span>📚</span>
                            <span className="flex-1 truncate" style={{ color: "#15803d" }}>
                              {liveSessions[student.id_student].currentActivity || "En sesión activa"}
                            </span>
                            <span style={{ color: "#86efac", flexShrink: 0 }}>
                              {formatDuration(liveSessions[student.id_student].startTime)}
                            </span>
                          </div>
                        )}

                        {/* Panel de monitoreo emocional en tiempo real */}
                        {state?.online ? (
                          <TutorMonitoringPanel
                            emotion={state.emocion}
                            attentionLevel={state.nivel_atencion}
                            stimming={state.stimming}
                            alerta_crisis={state.alerta_crisis}
                            history={state.emotionHistory}
                            videoFrame={state.videoFrame}
                          />
                        ) : (
                          <p className="text-sm mb-2" style={{ color: "#a0aec0" }}>Sin sesión activa</p>
                        )}

                        {/* Acciones */}
                        <div className="flex gap-2 mt-auto pt-2">
                          <button
                            onClick={() => router.push(`/tutor/estudiante/${student.id_student}`)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors"
                            style={{
                              background: "#E1EFFF",
                              color: "#4587a9",
                              border: "1.5px solid rgba(127,179,213,0.35)",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#d0e8f7"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#E1EFFF"; }}
                          >
                            <Eye className="w-4 h-4" />
                            Ver perfil
                          </button>

                          <button
                            onClick={() => setConfirmDelete(student.id_student)}
                            className="flex items-center justify-center px-3 py-2.5 rounded-xl transition-colors"
                            style={{
                              background: "#fff5f5",
                              border: "1.5px solid rgba(248,113,113,0.3)",
                              color: "#ef4444",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#fee2e2"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#fff5f5"; }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Empty state */}
                  {students.length === 0 && (
                    <div className="col-span-full text-center py-20">
                      <div
                        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
                        style={{ background: "#E1EFFF" }}
                      >
                        <Users className="w-10 h-10" style={{ color: "#7FB3D5" }} />
                      </div>
                      <p className="text-base font-bold mb-1" style={{ color: "#7f8c8d" }}>
                        Aún no tienes estudiantes
                      </p>
                      <p className="text-sm mb-5" style={{ color: "#a0aec0" }}>
                        Registra a tu primer estudiante para comenzar
                      </p>
                      <button
                        onClick={() => router.push("/tutor/nuevo-estudiante")}
                        className="px-6 py-3 rounded-xl font-bold text-white text-sm"
                        style={{
                          background: "linear-gradient(135deg,#FFB37B,#ff9450)",
                          boxShadow: "0 3px 14px rgba(255,148,80,0.35)",
                        }}
                      >
                        Registrar estudiante →
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Tab: Crisis ── */}
            {tab === "crisis" && (
              <motion.div
                key="crisis"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                {activeCrisis.length === 0 ? (
                  <div className="text-center py-24">
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
                      style={{ background: "#dcfce7" }}
                    >
                      <span className="text-3xl">✅</span>
                    </div>
                    <p className="text-base font-bold" style={{ color: "#7f8c8d" }}>No hay crisis activas</p>
                    <p className="text-sm mt-1" style={{ color: "#a0aec0" }}>Todo está tranquilo por ahora</p>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-2xl">
                    {activeCrisis.map((crisis) => {
                      const nivelLabel = crisis.notes?.includes("grave")
                        ? "grave"
                        : crisis.notes?.includes("moderada")
                        ? "moderada"
                        : "leve";
                      const style = CRISIS_STYLES[nivelLabel];

                      return (
                        <motion.div
                          key={crisis.id_crisis}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-5 rounded-2xl"
                          style={{
                            background: style.bg,
                            border: `2px solid ${style.border}`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="text-base font-bold capitalize mb-1" style={{ color: style.text }}>
                                🚨 Crisis {nivelLabel}
                              </p>
                              {crisis.notes && (
                                <p className="text-sm mb-1" style={{ color: style.text, opacity: 0.8 }}>
                                  {crisis.notes}
                                </p>
                              )}
                              <p className="text-xs" style={{ color: style.text, opacity: 0.6 }}>
                                {crisis.detection_timestamp
                                  ? new Date(crisis.detection_timestamp).toLocaleString("es-CO")
                                  : "—"}
                              </p>
                              {crisis.required_human && (
                                <p className="text-xs font-bold mt-1" style={{ color: style.text }}>
                                  ⚠ Requiere intervención humana
                                </p>
                              )}
                            </div>

                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => router.push(`/tutor/estudiante/${crisis.id_student}`)}
                                className="px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                                style={{ background: "rgba(255,255,255,0.7)", color: style.text, border: `1px solid ${style.border}` }}
                              >
                                Ver estudiante
                              </button>
                              <button
                                onClick={() => handleResolveCrisis(crisis.id_crisis)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors"
                                style={{ background: style.text }}
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
              </motion.div>
            )}

            {/* ── Tab: Historial ── */}
            {tab === "historial" && (
              <motion.div key="historial" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="space-y-3 max-w-3xl">

                {students.length === 0 && (
                  <div className="text-center py-20" style={{ color: "#a0aec0" }}>No hay estudiantes registrados aún</div>
                )}

                {students.map((student, index) => {
                  const isExpanded = expandedStudent === student.id_student;
                  const sessions = studentSessions[student.id_student] || [];

                  return (
                    <motion.div key={student.id_student} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }} className="rounded-2xl overflow-hidden"
                      style={{ background: "white", border: "1.5px solid #D5DBDB", boxShadow: "0 2px 8px rgba(127,179,213,0.07)" }}>

                      {/* Fila del estudiante */}
                      <button
                        className="w-full flex items-center justify-between p-5 text-left transition-all"
                        style={{ borderBottom: isExpanded ? "1.5px solid #D5DBDB" : "none" }}
                        onClick={() => {
                          if (isExpanded) setExpandedStudent(null);
                          else loadStudentSessions(student.id_student);
                        }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-black text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#7FB3D5,#5a9ec2)" }}>
                            {student.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold" style={{ color: "#34495E" }}>{student.full_name}</p>
                            <p className="text-xs mt-0.5" style={{ color: "#a0aec0" }}>
                              {isExpanded ? `${sessions.length} sesiones` : "Ver historial de sesiones"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {loadingSessions === student.id_student && (
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="w-4 h-4 rounded-full border-2" style={{ borderColor: "#D5DBDB", borderTopColor: "#7FB3D5" }} />
                          )}
                          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronRight className="w-5 h-5" style={{ color: "#a0aec0" }} />
                          </motion.div>
                        </div>
                      </button>

                      {/* Sesiones expandidas */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                            <div className="p-4 space-y-2">
                              {sessions.length === 0 && (
                                <p className="text-sm text-center py-4" style={{ color: "#a0aec0" }}>No hay sesiones registradas aún</p>
                              )}
                              {sessions.map((sess) => {
                                const isSessionExpanded = expandedSession === sess.id_session;
                                const acts = sessionActivities[sess.id_session] || [];
                                const STATUS_STYLES: Record<string, {bg: string; color: string}> = {
                                  activa:       { bg: "#dcfce7", color: "#16a34a" },
                                  completada:   { bg: "#E1EFFF", color: "#4587a9" },
                                  interrumpida: { bg: "#fef9c3", color: "#ca8a04" },
                                  crisis:       { bg: "#fee2e2", color: "#dc2626" },
                                };
                                const statusStyle = STATUS_STYLES[sess.status] || STATUS_STYLES.completada;
                                const durMin = sess.duration_sec ? Math.round(sess.duration_sec / 60) : null;

                                return (
                                  <div key={sess.id_session} className="rounded-xl overflow-hidden"
                                    style={{ border: "1.5px solid #f3f4f6" }}>
                                    <button
                                      className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
                                      onClick={() => loadSessionActivities(sess.id_session)}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="text-xl flex-shrink-0">
                                          {sess.status === "crisis" ? "🚨" : sess.status === "completada" ? "✅" : sess.status === "activa" ? "🟢" : "⏸️"}
                                        </div>
                                        <div>
                                          <p className="text-xs font-bold" style={{ color: "#34495E" }}>
                                            {sess.start_time ? new Date(sess.start_time).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—"}
                                          </p>
                                          <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                              style={{ background: statusStyle.bg, color: statusStyle.color }}>
                                              {sess.status}
                                            </span>
                                            {durMin !== null && (
                                              <span className="text-[10px]" style={{ color: "#a0aec0" }}>⏱ {durMin} min</span>
                                            )}
                                            <span className="text-[10px] capitalize" style={{ color: "#a0aec0" }}>{sess.session_type}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <motion.div animate={{ rotate: isSessionExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                                        <ChevronRight className="w-4 h-4" style={{ color: "#D5DBDB" }} />
                                      </motion.div>
                                    </button>

                                    {/* Actividades de la sesión */}
                                    <AnimatePresence>
                                      {isSessionExpanded && (
                                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                                          transition={{ duration: 0.25 }} className="overflow-hidden"
                                          style={{ borderTop: "1px solid #f3f4f6", background: "#fafbfc" }}>
                                          <div className="px-4 py-3 space-y-2">
                                            {acts.length === 0 && (
                                              <p className="text-xs" style={{ color: "#a0aec0" }}>Sin actividades registradas</p>
                                            )}
                                            {acts.map((act) => (
                                              <div key={act.id_student_activity}
                                                className="flex items-center justify-between py-2 px-3 rounded-lg"
                                                style={{ background: "white", border: "1px solid #f3f4f6" }}>
                                                <div className="flex items-center gap-2">
                                                  <span className="text-sm">
                                                    {act.is_completed ? "✅" : "🔄"}
                                                  </span>
                                                  <div>
                                                    <p className="text-xs font-semibold" style={{ color: "#34495E" }}>
                                                      {act.id_activity.substring(0, 8)}…
                                                    </p>
                                                    {act.time_spent_sec && (
                                                      <p className="text-[10px]" style={{ color: "#a0aec0" }}>
                                                        ⏱ {Math.round(act.time_spent_sec / 60)} min
                                                      </p>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="text-right">
                                                  {act.score !== undefined && act.score !== null && (
                                                    <p className="text-xs font-bold" style={{ color: "#FFB37B" }}>
                                                      ★ {act.score}/5
                                                    </p>
                                                  )}
                                                  <p className="text-[10px] capitalize" style={{ color: "#a0aec0" }}>
                                                    {act.achievement_level}
                                                  </p>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* ══════════════════ MODAL CONFIRMAR ELIMINAR ══════════════════ */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4"
            style={{ background: "rgba(52,73,94,0.45)", backdropFilter: "blur(4px)" }}
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 16 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="rounded-2xl p-7 max-w-sm w-full text-center"
              style={{ background: "white", boxShadow: "0 8px 40px rgba(52,73,94,0.18)" }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl"
                style={{ background: "#fee2e2" }}
              >
                🗑️
              </div>
              <h3 className="text-lg font-extrabold mb-2" style={{ color: "#34495E" }}>
                ¿Eliminar estudiante?
              </h3>
              <p className="text-sm mb-6" style={{ color: "#7f8c8d" }}>
                Esta acción desactivará la cuenta. El historial se conserva y podrás reactivarlo desde administración.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-colors"
                  style={{ background: "#f3f4f6", color: "#7f8c8d", border: "1.5px solid #D5DBDB" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeleteStudent(confirmDelete)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-colors"
                  style={{ background: "linear-gradient(135deg,#f87171,#ef4444)" }}
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
