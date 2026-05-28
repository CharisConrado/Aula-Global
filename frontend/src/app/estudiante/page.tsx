"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { useSensoryProfile } from "@/hooks/useSensoryProfile";
import {
  api,
  type ActivityResponse,
  type SubjectResponse,
  type StudentResponse,
  type AssistedSessionResponse,
} from "@/lib/api";
import CalmingScreen from "@/components/ui/CalmingScreen";
import { BookOpen, Star, LogOut, Play, CheckCircle2, Circle, ChevronRight, Trophy, Target, Clock, Menu, Stethoscope, ExternalLink } from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   TIPOS
══════════════════════════════════════════════════════════════ */
interface SubjectProgress {
  subject:    SubjectResponse;
  activities: ActivityResponse[];
  completed:  Set<string>;   // ids de actividades completadas en esta sesión
}

/* ══════════════════════════════════════════════════════════════
   PALETAS POR MODO DE CONTRASTE
══════════════════════════════════════════════════════════════ */

// Normal — gradientes pastel amigables
const SUBJECT_PALETTE = [
  { bg: "linear-gradient(145deg,#daedf7,#E1EFFF)", border: "rgba(127,179,213,0.45)", accent: "#7FB3D5",  textTitle: "#34495E", textSub: "#7f8c8d", shadow: "rgba(52,73,94,0.07)" },
  { bg: "linear-gradient(145deg,#e2f6e1,#c5edc3)", border: "rgba(162,217,161,0.50)", accent: "#A2D9A1",  textTitle: "#34495E", textSub: "#7f8c8d", shadow: "rgba(52,73,94,0.07)" },
  { bg: "linear-gradient(145deg,#ffe8d4,#ffd1a9)", border: "rgba(255,179,123,0.45)", accent: "#FFB37B",  textTitle: "#34495E", textSub: "#7f8c8d", shadow: "rgba(52,73,94,0.07)" },
  { bg: "linear-gradient(145deg,#fef9db,#fef0b3)", border: "rgba(249,231,159,0.60)", accent: "#c8a800",  textTitle: "#34495E", textSub: "#7f8c8d", shadow: "rgba(52,73,94,0.07)" },
  { bg: "linear-gradient(145deg,#ede9fe,#ddd6fe)", border: "rgba(167,139,250,0.40)", accent: "#8b5cf6",  textTitle: "#34495E", textSub: "#7f8c8d", shadow: "rgba(52,73,94,0.07)" },
  { bg: "linear-gradient(145deg,#fce7f3,#fbcfe8)", border: "rgba(244,114,182,0.35)", accent: "#ec4899",  textTitle: "#34495E", textSub: "#7f8c8d", shadow: "rgba(52,73,94,0.07)" },
];

// Alto contraste — fondos oscuros profundos + acentos vivos (amigable para niños)
const HC_SUBJECT_PALETTE = [
  { bg: "linear-gradient(145deg,#0D1E3D,#0F3460)", border: "rgba(94,190,255,0.60)",  accent: "#5EBEFF",  textTitle: "#FFFFFF", textSub: "#93C5FD", shadow: "rgba(94,190,255,0.18)" },
  { bg: "linear-gradient(145deg,#0A2818,#0F3D22)", border: "rgba(110,231,183,0.60)", accent: "#6EE7B7",  textTitle: "#FFFFFF", textSub: "#A7F3D0", shadow: "rgba(110,231,183,0.18)" },
  { bg: "linear-gradient(145deg,#2B1400,#3D2000)", border: "rgba(251,191,36,0.60)",  accent: "#FBBF24",  textTitle: "#FFFFFF", textSub: "#FDE68A", shadow: "rgba(251,191,36,0.18)" },
  { bg: "linear-gradient(145deg,#160D36,#2A1A6E)", border: "rgba(167,139,250,0.60)", accent: "#A78BFA",  textTitle: "#FFFFFF", textSub: "#DDD6FE", shadow: "rgba(167,139,250,0.18)" },
  { bg: "linear-gradient(145deg,#26102A,#3D1645)", border: "rgba(240,171,252,0.60)", accent: "#F0ABFC",  textTitle: "#FFFFFF", textSub: "#F5D0FE", shadow: "rgba(240,171,252,0.18)" },
  { bg: "linear-gradient(145deg,#09282D,#0F3A42)", border: "rgba(45,212,191,0.60)",  accent: "#2DD4BF",  textTitle: "#FFFFFF", textSub: "#99F6E4", shadow: "rgba(45,212,191,0.18)" },
];

// Bajo contraste — tonos crema ultra-suaves, sin estímulo
const LC_SUBJECT_PALETTE = [
  { bg: "linear-gradient(145deg,#EFF7FC,#E6F2FB)", border: "rgba(180,210,230,0.40)", accent: "#9ABDD0",  textTitle: "#6B7280", textSub: "#9CA3AF", shadow: "rgba(180,160,130,0.06)" },
  { bg: "linear-gradient(145deg,#EEF6ED,#E4F2E3)", border: "rgba(160,200,158,0.40)", accent: "#8BB08A",  textTitle: "#6B7280", textSub: "#9CA3AF", shadow: "rgba(180,160,130,0.06)" },
  { bg: "linear-gradient(145deg,#FBF3EC,#F7EAE0)", border: "rgba(210,180,150,0.40)", accent: "#C09878",  textTitle: "#6B7280", textSub: "#9CA3AF", shadow: "rgba(180,160,130,0.06)" },
  { bg: "linear-gradient(145deg,#F4F2FA,#EDE9F7)", border: "rgba(185,175,220,0.40)", accent: "#A898C8",  textTitle: "#6B7280", textSub: "#9CA3AF", shadow: "rgba(180,160,130,0.06)" },
  { bg: "linear-gradient(145deg,#FAF0F6,#F5E6F2)", border: "rgba(205,165,190,0.40)", accent: "#C098B5",  textTitle: "#6B7280", textSub: "#9CA3AF", shadow: "rgba(180,160,130,0.06)" },
  { bg: "linear-gradient(145deg,#EDF6F6,#E2EEEE)", border: "rgba(145,190,190,0.40)", accent: "#82AAAA",  textTitle: "#6B7280", textSub: "#9CA3AF", shadow: "rgba(180,160,130,0.06)" },
];

const SUBJECT_ICONS = ["📚", "🔢", "🌍", "🎨", "🔬", "🎵"];

/* ══════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════════════════ */
export default function EstudiantePage() {
  const router = useRouter();
  const {
    token, user, active_student_id,
    setActiveStudentId, activeSession, setActiveSession, logout,
    _hasHydrated,
  } = useSessionStore();

  const [student,    setStudent]    = useState<StudentResponse | null>(null);
  const [progresses, setProgresses] = useState<SubjectProgress[]>([]);
  const [selected,   setSelected]   = useState<SubjectProgress | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [consultas,  setConsultas]  = useState<AssistedSessionResponse[]>([]);

  // Aplica el perfil sensorial y expone helpers de contraste
  const { isHighContrast, isLowContrast } = useSensoryProfile(token, active_student_id);
  const activePalette = isHighContrast ? HC_SUBJECT_PALETTE
                      : isLowContrast  ? LC_SUBJECT_PALETTE
                      : SUBJECT_PALETTE;
  // ids completadas en esta sesión (persiste mientras el estudiante navega)
  const [completedSet,  setCompletedSet]  = useState<Set<string>>(new Set());
  const [sidebarOpen,   setSidebarOpen]   = useState(false);

  /* ── Carga inicial ── */
  const loadData = useCallback(async () => {
    if (!token || !active_student_id) return;

    // Recuperar actividades completadas guardadas localmente
    try {
      const storageKey = `aula_completed_${active_student_id}`;
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]") as string[];
      if (stored.length > 0) setCompletedSet(new Set(stored));
    } catch {}

    try {
      const stud = await api.getStudent(token, active_student_id);
      setStudent(stud);

      const subs = await api.getSubjects({ degree_id: stud.id_degree });

      // Para cada materia, cargamos sus actividades
      const withActivities: SubjectProgress[] = await Promise.all(
        subs.map(async (subject) => {
          try {
            const acts = await api.getActivities(token, { subject_id: subject.id_subject });
            return { subject, activities: acts, completed: new Set<string>() };
          } catch {
            return { subject, activities: [], completed: new Set<string>() };
          }
        })
      );
      setProgresses(withActivities);

      if (!activeSession) {
        const session = await api.createSession(token, {
          id_student: active_student_id,
          session_type: "aprendizaje",
        });
        setActiveSession({
          id_session: session.id_session,
          id_student: session.id_student,
          start_time: session.start_time,
        });
      }

      // Cargar consultas asistidas activas
      try {
        const cons = await api.getAssistedSessions(token);
        setConsultas(cons.filter(c => !["finalizada", "rechazada"].includes(c.status)));
      } catch {}
    } catch (err) {
      console.error("Error cargando datos del estudiante:", err);
    } finally {
      setLoading(false);
    }
  }, [token, active_student_id, activeSession, setActiveSession]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token || !user) { router.replace("/login"); return; }
    if (user.rol === "estudiante" && !active_student_id) {
      setActiveStudentId(user.user_id); return;
    }
    if (!active_student_id) {
      router.replace(user.rol === "tutor" ? "/tutor" : "/admin"); return;
    }
    loadData();
  }, [_hasHydrated, token, user, active_student_id, setActiveStudentId, router, loadData]);

  /* ── Marcar actividad completada ── */
  const markDone = (actId: string) => {
    setCompletedSet(prev => {
      const next = new Set([...Array.from(prev), actId]);
      try {
        const storageKey = `aula_completed_${active_student_id}`;
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  /* ── Cerrar sesión y volver ── */
  const handleExit = async () => {
    if (activeSession && token) {
      try { await api.closeSession(token, activeSession.id_session, { status: "completada" }); } catch {}
    }
    setActiveSession(null);
    if (user?.rol === "estudiante") { logout(); router.replace("/login"); }
    else router.replace(user?.rol === "tutor" ? "/tutor" : "/admin");
  };

  /* ── Estadísticas globales ── */
  const totalActivities   = progresses.reduce((s, p) => s + p.activities.length, 0);
  const totalCompleted    = completedSet.size;
  const globalPct         = totalActivities > 0 ? Math.round((totalCompleted / totalActivities) * 100) : 0;
  const studentName       = student?.full_name?.split(" ")[0] ?? "Estudiante";

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center student-shell" style={{ backgroundColor: "#FDF8F2" }}>
        <motion.div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-14 h-14 rounded-full border-4 mx-auto"
            style={{ borderColor: "#D5DBDB", borderTopColor: "#7FB3D5" }}
          />
          <p className="font-bold" style={{ color: "#7FB3D5" }}>Cargando…</p>
        </motion.div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     RENDER PRINCIPAL
  ══════════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen student-shell"
      style={{ backgroundColor: isHighContrast ? "#0F172A" : isLowContrast ? "#FAF3E8" : "#FDF8F2" }}>
      <CalmingScreen />

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ════════════ SIDEBAR IZQUIERDO ════════════ */}
      <aside
        className={`fixed top-0 left-0 h-full flex flex-col z-30 transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{
          width: 230,
          background: isHighContrast ? "#111827" : isLowContrast ? "#FAF3E8" : "white",
          borderRight: isHighContrast ? "1.5px solid #1F2937" : "1.5px solid #D5DBDB",
          boxShadow: isHighContrast ? "4px 0 20px rgba(0,0,0,0.5)" : "4px 0 20px rgba(127,179,213,0.10)",
        }}
      >
        {/* Logo + brand */}
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: "1.5px solid #D5DBDB" }}>
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}
          >
            <Star className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-extrabold leading-tight" style={{ color: "#4587a9" }}>Aula Global</p>
            <p className="text-xs" style={{ color: "#a0aec0" }}>Mi aprendizaje</p>
          </div>
        </div>

        {/* Info del estudiante */}
        <div className="px-5 py-4" style={{ borderBottom: "1.5px solid #D5DBDB" }}>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-white mx-auto mb-3"
            style={{ background: "linear-gradient(135deg,#7FB3D5,#5a9ec2)" }}
          >
            {studentName.charAt(0).toUpperCase()}
          </div>
          <p className="text-sm font-extrabold text-center" style={{ color: "#34495E" }}>
            ¡Hola, {studentName}!
          </p>
          <p className="text-xs text-center mt-0.5" style={{ color: "#a0aec0" }}>
            {progresses.length} materias disponibles
          </p>
        </div>

        {/* Progreso global */}
        <div className="px-5 py-4" style={{ borderBottom: "1.5px solid #D5DBDB" }}>
          <p className="text-xs font-bold mb-2" style={{ color: "#34495E" }}>Mi progreso hoy</p>

          {/* Barra global */}
          <div className="h-3 rounded-full overflow-hidden mb-1" style={{ background: "#f3f4f6" }}>
            <motion.div
              className="h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${globalPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              style={{ background: "linear-gradient(90deg,#7FB3D5,#A2D9A1)" }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "#a0aec0" }}>
            <span>{totalCompleted} completadas</span>
            <span>{globalPct}%</span>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-xl p-2 text-center" style={{ background: "#E1EFFF" }}>
              <p className="text-base font-black" style={{ color: "#7FB3D5" }}>{totalCompleted}</p>
              <p className="text-[10px] font-medium" style={{ color: "#7f8c8d" }}>Hechas</p>
            </div>
            <div className="rounded-xl p-2 text-center" style={{ background: "#f0fdf4" }}>
              <p className="text-base font-black" style={{ color: "#A2D9A1" }}>{totalActivities - totalCompleted}</p>
              <p className="text-[10px] font-medium" style={{ color: "#7f8c8d" }}>Pendientes</p>
            </div>
          </div>
        </div>

        {/* Lista de materias (navegación) */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider px-2 mb-2" style={{ color: "#a0aec0" }}>
            Materias
          </p>
          {progresses.map((prog, i) => {
            const palette = SUBJECT_PALETTE[i % SUBJECT_PALETTE.length];
            const done    = prog.activities.filter(a => completedSet.has(a.id_activity)).length;
            const total   = prog.activities.length;
            const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
            const active  = selected?.subject.id_subject === prog.subject.id_subject;

            return (
              <button
                key={prog.subject.id_subject}
                onClick={() => { setSelected(prog); setSidebarOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                style={active ? { background: "#E1EFFF" } : {}}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f8f9fa"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span className="text-lg flex-shrink-0">
                  {prog.subject.icon || SUBJECT_ICONS[i % SUBJECT_ICONS.length]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: active ? "#4587a9" : "#34495E" }}>
                    {prog.subject.subject_name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: palette.accent }}
                      />
                    </div>
                    <span className="text-[10px]" style={{ color: "#a0aec0" }}>{done}/{total}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-4 py-4" style={{ borderTop: "1.5px solid #D5DBDB" }}>
          <button
            onClick={handleExit}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{ color: "#a0aec0" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.color = "#ef4444"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#a0aec0"; }}
          >
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </aside>

      {/* ════════════ CONTENIDO PRINCIPAL ════════════ */}
      <div className="flex-1 flex flex-col lg:ml-[230px]">

        {/* Top bar */}
        <header
          className="sticky top-0 z-10 px-4 md:px-8 py-4 flex items-center justify-between"
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
            <h1 className="text-base md:text-lg font-extrabold" style={{ color: "#34495E" }}>
              {selected ? selected.subject.subject_name : "¿Qué quieres aprender hoy? ✨"}
            </h1>
            <p className="text-xs mt-0.5 hidden sm:block" style={{ color: "#a0aec0" }}>
              {selected
                ? `${selected.activities.filter(a => completedSet.has(a.id_activity)).length} de ${selected.activities.length} actividades completadas`
                : `${progresses.length} materias · ${totalActivities} actividades en total`
              }
            </p>
          </div>

          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-colors"
              style={{ color: "#5a9ec2" }}
              onMouseEnter={e => e.currentTarget.style.background = "#E1EFFF"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              ← Todas las materias
            </button>
          )}
        </header>

        {/* Main */}
        <main className="flex-1 px-4 md:px-8 py-4 md:py-8">
          <AnimatePresence mode="wait">

            {/* ══ VISTA: Todas las materias ══ */}
            {!selected && (
              <motion.div
                key="materias"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >

                {/* ── Consultas activas ── */}
                {consultas.length > 0 && (
                  <div className="mb-6 space-y-3">
                    {consultas.map((c, i) => (
                      <motion.div
                        key={c.id_sesion_asistida}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="rounded-2xl p-4"
                        style={{
                          background: c.meeting_link
                            ? "linear-gradient(135deg,#EFF6FF,#E1EFFF)"
                            : "linear-gradient(135deg,#F0FDF4,#ECFDF5)",
                          border: c.meeting_link ? "1.5px solid #93C5FD" : "1.5px solid #86EFAC",
                          boxShadow: "0 2px 12px rgba(127,179,213,0.10)",
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl"
                            style={{ background: c.meeting_link ? "#DBEAFE" : "#D1FAE5" }}
                          >
                            🩺
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-sm" style={{ color: "#1D4ED8" }}>
                              Consulta con {c.professional_name || "tu especialista"}
                            </p>
                            <p className="text-xs" style={{ color: "#6B7280" }}>
                              {c.professional_speciality || "Especialista"}
                            </p>

                            {/* Horario */}
                            {c.scheduled_at && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <span className="text-sm">📅</span>
                                <p className="text-xs font-semibold" style={{ color: "#374151" }}>
                                  {new Date(c.scheduled_at).toLocaleDateString("es-CO", {
                                    weekday: "long", day: "numeric", month: "long",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            )}

                            {/* Indicaciones del profesional */}
                            {c.professional_notes && (
                              <div className="mt-2 rounded-xl px-3 py-2"
                                style={{ background: "rgba(255,255,255,0.7)", border: "1px solid #BBF7D0" }}>
                                <p className="text-[10px] font-bold mb-0.5" style={{ color: "#15803D" }}>
                                  📋 Indicaciones de tu especialista
                                </p>
                                <p className="text-xs" style={{ color: "#374151" }}>
                                  {c.professional_notes}
                                </p>
                              </div>
                            )}

                            {/* Notas del tutor */}
                            {c.notes && (
                              <p className="mt-2 text-xs rounded-lg px-2 py-1"
                                style={{ background: "rgba(255,251,235,0.8)", color: "#D97706", border: "1px solid #FCD34D" }}>
                                📝 {c.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Botón de unirse si hay link */}
                        {c.meeting_link && (
                          <a
                            href={c.meeting_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-extrabold text-white transition-all"
                            style={{ background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", boxShadow: "0 4px 14px rgba(59,130,246,0.40)" }}
                          >
                            <ExternalLink className="w-4 h-4" />
                            ¡Unirse a la consulta! 🎉
                          </a>
                        )}

                        {/* Estado si aún no hay link */}
                        {!c.meeting_link && (
                          <div className="mt-3 text-center">
                            <p className="text-xs font-semibold" style={{ color: "#15803D" }}>
                              {c.status === "pendiente"
                                ? "⏳ Esperando confirmación del especialista…"
                                : "✅ Aceptada · Pronto recibirás el enlace de la reunión"}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Trofeo si completó algo */}
                {totalCompleted > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-3 px-5 py-3 rounded-2xl mb-6"
                    style={{
                      background: "linear-gradient(135deg,#fef9db,#fef0b3)",
                      border: "1.5px solid rgba(249,231,159,0.6)",
                    }}
                  >
                    <Trophy className="w-6 h-6 flex-shrink-0" style={{ color: "#e6c200" }} />
                    <p className="text-sm font-bold" style={{ color: "#34495E" }}>
                      ¡Llevas {totalCompleted} actividad{totalCompleted !== 1 ? "es" : ""} completada{totalCompleted !== 1 ? "s" : ""} hoy! Sigue así 🚀
                    </p>
                  </motion.div>
                )}

                {/* Grid de materias */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {progresses.map((prog, index) => {
                    const palette = activePalette[index % activePalette.length];
                    const done    = prog.activities.filter(a => completedSet.has(a.id_activity)).length;
                    const total   = prog.activities.length;
                    const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

                    return (
                      <motion.button
                        key={prog.subject.id_subject}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.07 }}
                        whileHover={{ scale: 1.03, y: -4 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => { setSelected(prog); setSidebarOpen(false); }}
                        className="rounded-[1.5rem] p-6 text-left"
                        style={{
                          background: palette.bg,
                          border: `2px solid ${palette.border}`,
                          boxShadow: isHighContrast
                            ? `0 0 22px ${palette.shadow}, 0 4px 20px rgba(0,0,0,0.45)`
                            : `0 2px 12px ${palette.shadow}`,
                        }}
                      >
                        {/* Emoji en contenedor con acento (alto contraste) o directo */}
                        <div className="flex items-start justify-between mb-4">
                          {isHighContrast ? (
                            <div className="w-13 h-13 rounded-2xl flex items-center justify-center text-3xl"
                              style={{
                                background: `${palette.accent}22`,
                                border: `2px solid ${palette.accent}55`,
                                width: 52, height: 52,
                              }}>
                              {prog.subject.icon || SUBJECT_ICONS[index % SUBJECT_ICONS.length]}
                            </div>
                          ) : (
                            <span className="text-4xl">
                              {prog.subject.icon || SUBJECT_ICONS[index % SUBJECT_ICONS.length]}
                            </span>
                          )}
                          {done === total && total > 0 && (
                            <span className="text-xl">🏆</span>
                          )}
                        </div>

                        <h3 className="text-base font-extrabold mb-1"
                          style={{ color: palette.textTitle }}>
                          {prog.subject.subject_name}
                        </h3>
                        {prog.subject.description && (
                          <p className="text-xs mb-3" style={{ color: palette.textSub }}>
                            {prog.subject.description}
                          </p>
                        )}

                        {/* Barra de progreso */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1"
                            style={{ color: palette.textSub }}>
                            <span>{done} de {total} actividades</span>
                            <span className="font-bold" style={{ color: palette.accent }}>{pct}%</span>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden"
                            style={{ background: isHighContrast ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.6)" }}>
                            <motion.div
                              className="h-full rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, delay: index * 0.07 }}
                              style={{
                                background: palette.accent,
                                boxShadow: isHighContrast ? `0 0 8px ${palette.accent}` : "none",
                              }}
                            />
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-1" style={{ color: palette.accent }}>
                          <span className="text-xs font-bold">
                            {pct === 100 ? "¡Completado! 🎉" : pct > 0 ? "Continuar →" : "Empezar →"}
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}

                  {progresses.length === 0 && (
                    <div className="col-span-full text-center py-20">
                      <BookOpen className="w-16 h-16 mx-auto mb-4" style={{ color: "#D5DBDB" }} />
                      <p className="font-bold" style={{ color: "#a0aec0" }}>No hay materias disponibles todavía</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ══ VISTA: Actividades de una materia (journey) ══ */}
            {selected && (
              <motion.div
                key={selected.subject.id_subject}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                {/* Resumen de progreso de la materia */}
                {(() => {
                  const idx     = progresses.findIndex(p => p.subject.id_subject === selected.subject.id_subject);
                  const palette = activePalette[idx % activePalette.length];
                  const done    = selected.activities.filter(a => completedSet.has(a.id_activity)).length;
                  const total   = selected.activities.length;
                  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

                  return (
                    <div
                      className="rounded-2xl p-5 mb-8 flex items-center gap-5"
                      style={{
                        background: palette.bg,
                        border: `2px solid ${palette.border}`,
                        boxShadow: isHighContrast
                          ? `0 0 22px ${palette.shadow}, 0 4px 20px rgba(0,0,0,0.45)`
                          : undefined,
                      }}
                    >
                      {isHighContrast ? (
                        <div className="flex-shrink-0 rounded-2xl flex items-center justify-center text-3xl"
                          style={{
                            width: 60, height: 60,
                            background: `${palette.accent}22`,
                            border: `2px solid ${palette.accent}55`,
                          }}>
                          {selected.subject.icon || SUBJECT_ICONS[idx % SUBJECT_ICONS.length]}
                        </div>
                      ) : (
                        <span className="text-5xl flex-shrink-0">
                          {selected.subject.icon || SUBJECT_ICONS[idx % SUBJECT_ICONS.length]}
                        </span>
                      )}
                      <div className="flex-1">
                        <h2 className="text-lg font-extrabold mb-1" style={{ color: palette.textTitle }}>
                          {selected.subject.subject_name}
                        </h2>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-3 rounded-full overflow-hidden"
                            style={{ background: isHighContrast ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.5)" }}>
                            <motion.div
                              className="h-full rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6 }}
                              style={{
                                background: palette.accent,
                                boxShadow: isHighContrast ? `0 0 8px ${palette.accent}` : "none",
                              }}
                            />
                          </div>
                          <span className="text-sm font-extrabold flex-shrink-0" style={{ color: palette.accent }}>
                            {done}/{total}
                          </span>
                        </div>
                      </div>
                      {/* Stats rápidos */}
                      <div className="flex gap-3 flex-shrink-0">
                        <div className="text-center">
                          <p className="text-xl font-black" style={{ color: isHighContrast ? "#6EE7B7" : "#A2D9A1" }}>{done}</p>
                          <p className="text-[10px]" style={{ color: palette.textSub }}>Hechas</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-black" style={{ color: palette.textSub }}>{total - done}</p>
                          <p className="text-[10px]" style={{ color: palette.textSub }}>Pendientes</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Journey de actividades */}
                {selected.activities.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-base font-bold" style={{ color: "#a0aec0" }}>
                      No hay actividades en esta materia todavía
                    </p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Línea vertical del journey */}
                    <div
                      className="absolute left-6 top-4 bottom-4 w-0.5"
                      style={{ background: "#D5DBDB" }}
                    />

                    <div className="space-y-4">
                      {selected.activities.map((activity, index) => {
                        const isDone    = completedSet.has(activity.id_activity);
                        // Se puede hacer si es la primera o si la anterior está completa
                        const canDo     = index === 0
                          || completedSet.has(selected.activities[index - 1]?.id_activity);

                        const diffStyle =
                          activity.difficulty_level === "facil"
                            ? { bg: "#dcfce7", text: "#16a34a", label: "⭐ Fácil" }
                            : activity.difficulty_level === "medio"
                            ? { bg: "#ffedd5", text: "#ea580c", label: "⚡ Normal" }
                            : { bg: "#fce7f3", text: "#be185d", label: "🔥 Difícil" };

                        return (
                          <motion.div
                            key={activity.id_activity}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.06 }}
                            className="flex items-start gap-4"
                          >
                            {/* Nodo del journey */}
                            <div className="flex-shrink-0 z-10 mt-4">
                              {isDone ? (
                                <div
                                  className="w-12 h-12 rounded-full flex items-center justify-center"
                                  style={{ background: "linear-gradient(135deg,#A2D9A1,#7dc97c)", boxShadow: "0 2px 10px rgba(162,217,161,0.5)" }}
                                >
                                  <CheckCircle2 className="w-6 h-6 text-white" />
                                </div>
                              ) : canDo ? (
                                <motion.div
                                  animate={{ scale: [1, 1.08, 1] }}
                                  transition={{ duration: 2, repeat: Infinity }}
                                  className="w-12 h-12 rounded-full flex items-center justify-center"
                                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 2px 12px rgba(255,148,80,0.45)" }}
                                >
                                  <span className="text-white font-black text-sm">{index + 1}</span>
                                </motion.div>
                              ) : (
                                <div
                                  className="w-12 h-12 rounded-full flex items-center justify-center"
                                  style={{ background: "#f3f4f6", border: "2px solid #D5DBDB" }}
                                >
                                  <Circle className="w-5 h-5" style={{ color: "#D5DBDB" }} />
                                </div>
                              )}
                            </div>

                            {/* Tarjeta de actividad */}
                            <div
                              className="flex-1 rounded-2xl p-5 transition-all"
                              style={{
                                background: isHighContrast
                                  ? isDone ? "#0A2818" : canDo ? "#1E293B" : "#111827"
                                  : isDone ? "#f0fdf4" : canDo ? "white" : "#fafafa",
                                border: isHighContrast
                                  ? isDone ? "1.5px solid rgba(110,231,183,0.55)" : canDo ? "1.5px solid #334155" : "1.5px solid #1F2937"
                                  : isDone ? "1.5px solid rgba(162,217,161,0.5)" : canDo ? "1.5px solid #D5DBDB" : "1.5px solid #e5e7eb",
                                boxShadow: isHighContrast && canDo && !isDone
                                  ? "0 2px 12px rgba(94,190,255,0.12)"
                                  : canDo && !isDone ? "0 2px 12px rgba(127,179,213,0.10)" : "none",
                                opacity: !canDo && !isDone ? 0.5 : 1,
                              }}
                            >
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h3 className="text-sm font-extrabold"
                                      style={{ color: isHighContrast
                                        ? isDone ? "#6EE7B7" : "#FFFFFF"
                                        : isDone ? "#16a34a" : "#34495E" }}>
                                      {activity.title}
                                    </h3>
                                    {isDone && (
                                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                                        style={isHighContrast
                                          ? { background: "rgba(110,231,183,0.18)", color: "#6EE7B7" }
                                          : { background: "#dcfce7", color: "#16a34a" }}>
                                        ✓ Completada
                                      </span>
                                    )}
                                  </div>
                                  {activity.description && (
                                    <p className="text-xs"
                                      style={{ color: isHighContrast ? "#94A3B8" : "#7f8c8d" }}>
                                      {activity.description}
                                    </p>
                                  )}
                                </div>
                                <span
                                  className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                                  style={{ background: diffStyle.bg, color: diffStyle.text }}
                                >
                                  {diffStyle.label}
                                </span>
                              </div>

                              <div className="flex items-center justify-between mt-3">
                                {activity.estimated_minutes ? (
                                  <span className="flex items-center gap-1 text-xs"
                                    style={{ color: isHighContrast ? "#64748B" : "#a0aec0" }}>
                                    <Clock className="w-3 h-3" />
                                    {activity.estimated_minutes} min
                                  </span>
                                ) : <span />}

                                {isDone ? (
                                  <div className="flex items-center gap-1.5 text-xs font-bold"
                                    style={{ color: isHighContrast ? "#6EE7B7" : "#A2D9A1" }}>
                                    <CheckCircle2 className="w-4 h-4" />
                                    ¡Muy bien!
                                  </div>
                                ) : canDo ? (
                                  <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                      router.push(`/estudiante/actividad/${activity.id_activity}`);
                                    }}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-white"
                                    style={{
                                      background: isHighContrast
                                        ? "linear-gradient(135deg,#1D4ED8,#2563EB)"
                                        : "linear-gradient(135deg,#FFB37B,#ff9450)",
                                      boxShadow: isHighContrast
                                        ? "0 3px 14px rgba(37,99,235,0.5)"
                                        : "0 3px 12px rgba(255,148,80,0.40)",
                                    }}
                                  >
                                    <Play className="w-3 h-3" />
                                    Empezar
                                  </motion.button>
                                ) : (
                                  <span className="text-xs font-medium"
                                    style={{ color: isHighContrast ? "#374151" : "#D5DBDB" }}>
                                    🔒 Completa la anterior primero
                                  </span>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Fin del journey */}
                    {selected.activities.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: selected.activities.length * 0.06 + 0.2 }}
                        className="flex items-center gap-4 mt-4"
                      >
                        <div
                          className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 z-10 text-xl"
                          style={{
                            background: selected.activities.every(a => completedSet.has(a.id_activity))
                              ? "linear-gradient(135deg,#F9E79F,#f59e0b)"
                              : "#f3f4f6",
                            border: "2px solid #D5DBDB",
                          }}
                        >
                          🏆
                        </div>
                        <p className="text-sm font-bold" style={{ color: "#a0aec0" }}>
                          {selected.activities.every(a => completedSet.has(a.id_activity))
                            ? "¡Completaste toda la materia! Eres increíble 🎉"
                            : "Meta: completar todas las actividades"}
                        </p>
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
