"use client";

/**
 * Aula Global — Panel del Profesional
 *
 * Muestra las sesiones asistidas asignadas a este profesional:
 *   - Tab "Solicitudes": pendiente / aceptada / en_curso
 *   - Tab "Historial":   finalizada / rechazada
 *
 * Acciones posibles:
 *   pendiente → Aceptar  (o Rechazar)
 *   aceptada  → Pegar enlace Zoom/Meet/Teams → Enviar enlace
 *   en_curso  → Ver enlace + Finalizar sesión
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api, type AssistedSessionResponse } from "@/lib/api";
import {
  LogOut,
  CheckCircle,
  XCircle,
  Send,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Video,
} from "lucide-react";

// ── Status visual config ─────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pendiente:  { label: "⏳ Pendiente",   color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
  aceptada:   { label: "✅ Aceptada",    color: "#1D4ED8", bg: "#EFF6FF", border: "#93C5FD" },
  en_curso:   { label: "🟢 En curso",    color: "#15803D", bg: "#F0FDF4", border: "#86EFAC" },
  finalizada: { label: "🏁 Finalizada",  color: "#6B7280", bg: "#F9FAFB", border: "#D1D5DB" },
  rechazada:  { label: "❌ Rechazada",   color: "#B91C1C", bg: "#FEF2F2", border: "#FCA5A5" },
};

const SPECIALTY_EMOJI: Record<string, string> = {
  "Psicólogo Clínico":     "🧠",
  "Psiquiatra":            "🩺",
  "Neuropsicólogo":        "🔬",
  "Terapeuta Ocupacional": "🤝",
  "Logopeda":              "💬",
};

// ── Loading screen ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FDF8F2" }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        className="w-14 h-14 rounded-full border-4"
        style={{ borderColor: "#D5DBDB", borderTopColor: "#7FB3D5" }}
      />
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ProfesionalPage() {
  const router = useRouter();
  const { token, user, logout, _hasHydrated } = useSessionStore();

  const [sessions,        setSessions]        = useState<AssistedSessionResponse[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [tab,             setTab]             = useState<"solicitudes" | "historial">("solicitudes");
  const [linkInput,       setLinkInput]       = useState<Record<string, string>>({});
  const [submittingId,    setSubmittingId]    = useState<string | null>(null);
  const [submittingKind,  setSubmittingKind]  = useState<"accept" | "reject" | "link" | "close" | null>(null);
  const [refreshing,      setRefreshing]      = useState(false);

  // ── Accept form state (inline, per card) ──────────────────────────────────
  const [acceptFormId,    setAcceptFormId]    = useState<string | null>(null);
  const [scheduleInput,   setScheduleInput]   = useState<Record<string, string>>({});
  const [profNotesInput,  setProfNotesInput]  = useState<Record<string, string>>({});

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadSessions = useCallback(async (showRefresh = false) => {
    if (!token) return;
    if (showRefresh) setRefreshing(true);
    try {
      const data = await api.getAssistedSessions(token);
      setSessions(data);
    } catch (err) {
      console.error("Error cargando sesiones:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token || !user || user.rol !== "profesional") {
      router.replace("/login");
      return;
    }
    loadSessions();
  }, [_hasHydrated, token, user, router, loadSessions]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const run = async (
    id:   string,
    kind: "accept" | "reject" | "link" | "close",
    fn:   () => Promise<AssistedSessionResponse>,
  ) => {
    setSubmittingId(id);
    setSubmittingKind(kind);
    try {
      const updated = await fn();
      setSessions(prev => prev.map(s => s.id_sesion_asistida === id ? updated : s));
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingId(null);
      setSubmittingKind(null);
    }
  };

  const handleAccept = (id: string) => {
    const scheduled_at    = scheduleInput[id]  ? new Date(scheduleInput[id]).toISOString()  : undefined;
    const professional_notes = profNotesInput[id]?.trim() || undefined;
    run(id, "accept", () =>
      api.acceptAssistedSession(token!, id, { scheduled_at, professional_notes })
    ).then(() => setAcceptFormId(null));
  };

  const handleReject = (id: string) =>
    run(id, "reject", () => api.rejectAssistedSession(token!, id));

  const handleSendLink = (id: string) => {
    const link = linkInput[id]?.trim();
    if (!link) return;
    run(id, "link", async () => {
      const res = await api.sendSessionLink(token!, id, link);
      setLinkInput(prev => ({ ...prev, [id]: "" }));
      return res;
    });
  };

  const handleClose = (id: string) =>
    run(id, "close", () => api.closeAssistedSession(token!, id));

  // ── Data split ────────────────────────────────────────────────────────────
  const activeSessions  = sessions.filter(s => !["finalizada", "rechazada"].includes(s.status));
  const historySessions = sessions.filter(s =>  ["finalizada", "rechazada"].includes(s.status));
  const displayed       = tab === "solicitudes" ? activeSessions : historySessions;

  if (!_hasHydrated || loading) return <Spinner />;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FDF8F2" }}>

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-4 sm:px-8 py-4"
        style={{ background: "rgba(253,248,242,0.94)", borderColor: "#D5DBDB" }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Aula Global" width={36} height={36}
              style={{ objectFit: "contain" }} priority />
            <div>
              <p className="font-extrabold text-sm leading-tight" style={{ color: "#4587a9" }}>
                Aula Global
              </p>
              <p className="text-xs" style={{ color: "#a0aec0" }}>
                {SPECIALTY_EMOJI["Neuropsicólogo"]} Panel Profesional
              </p>
            </div>
          </div>

          {/* User info + logout */}
          <div className="flex items-center gap-3">
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ background: "#E1EFFF", color: "#4587a9" }}
            >
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: "linear-gradient(135deg,#7FB3D5,#5a9ec2)" }}>
                {user?.email?.charAt(0).toUpperCase() ?? "P"}
              </span>
              <span className="max-w-[140px] truncate">{user?.email}</span>
            </div>
            <button
              onClick={() => { logout(); router.replace("/login"); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ color: "#a0aec0" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#fee2e2"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#a0aec0"; e.currentTarget.style.background = "transparent"; }}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8">

        {/* Welcome banner */}
        <div
          className="rounded-2xl p-5 mb-8 flex items-center gap-4"
          style={{ background: "linear-gradient(135deg,#E1EFFF,#EFF6FF)", border: "1.5px solid #BFDBFE" }}
        >
          <span className="text-4xl flex-shrink-0">🩺</span>
          <div>
            <h1 className="text-lg font-extrabold" style={{ color: "#1D4ED8" }}>
              Bienvenido, profesional
            </h1>
            <p className="text-sm" style={{ color: "#374151" }}>
              Aquí puedes gestionar las sesiones asistidas que te han asignado.
            </p>
          </div>
        </div>

        {/* ── Tabs + refresh ── */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {[
            { id: "solicitudes", label: "Solicitudes activas", count: activeSessions.length },
            { id: "historial",   label: "Historial",           count: historySessions.length },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all"
              style={
                tab === t.id
                  ? { background: "#E1EFFF", color: "#4587a9", border: "1.5px solid #93C5FD" }
                  : { background: "white",   color: "#7f8c8d", border: "1.5px solid #D5DBDB" }
              }
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                  style={tab === t.id ? { background: "#7FB3D5", color: "white" } : { background: "#f3f4f6", color: "#7f8c8d" }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}

          <button
            onClick={() => loadSessions(true)}
            disabled={refreshing}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{ color: "#7f8c8d", background: "white", border: "1.5px solid #D5DBDB" }}
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* ── Session cards ── */}
        <AnimatePresence mode="wait">
          {displayed.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-20 rounded-3xl"
              style={{ background: "white", border: "1.5px solid #D5DBDB" }}
            >
              <div className="text-5xl mb-4">
                {tab === "solicitudes" ? "📭" : "📋"}
              </div>
              <p className="font-bold" style={{ color: "#7f8c8d" }}>
                {tab === "solicitudes"
                  ? "No tienes solicitudes activas en este momento"
                  : "Tu historial de sesiones aparecerá aquí"}
              </p>
            </motion.div>
          ) : (
            <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-5">
              {displayed.map((s, i) => {
                const sc = STATUS[s.status] || STATUS.pendiente;
                const isBusy = submittingId === s.id_sesion_asistida;

                return (
                  <motion.div
                    key={s.id_sesion_asistida}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl p-6"
                    style={{
                      background:  "white",
                      border:      `1.5px solid ${sc.border}`,
                      boxShadow:   "0 2px 12px rgba(127,179,213,0.08)",
                    }}
                  >
                    {/* ── Top row ── */}
                    <div className="flex items-start justify-between mb-5 flex-wrap gap-2">
                      <span
                        className="text-xs font-extrabold px-3 py-1 rounded-full"
                        style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
                      >
                        {sc.label}
                      </span>
                      <span className="text-xs" style={{ color: "#a0aec0" }}>
                        {s.requested_at
                          ? new Date(s.requested_at).toLocaleDateString("es-CO", {
                              day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>

                    {/* ── Info cards: student + tutor ── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                      {/* Student */}
                      <div className="rounded-xl p-4" style={{ background: "#F0FDF4" }}>
                        <p className="text-xs font-bold mb-1.5" style={{ color: "#15803D" }}>
                          👤 Estudiante
                        </p>
                        <p className="font-extrabold text-base" style={{ color: "#34495E" }}>
                          {s.student_name || "—"}
                        </p>
                      </div>
                      {/* Tutor */}
                      <div className="rounded-xl p-4" style={{ background: "#EFF6FF" }}>
                        <p className="text-xs font-bold mb-1.5" style={{ color: "#1D4ED8" }}>
                          🏠 Tutor solicitante
                        </p>
                        <p className="font-extrabold text-base" style={{ color: "#34495E" }}>
                          {s.tutor_name || "—"}
                        </p>
                      </div>
                    </div>

                    {/* ── Notas del tutor ── */}
                    {s.notes && (
                      <div
                        className="rounded-xl p-4 mb-4 flex items-start gap-2"
                        style={{ background: "#FFFBEB", border: "1px solid #FCD34D" }}
                      >
                        <span className="text-sm flex-shrink-0">📝</span>
                        <div>
                          <p className="text-xs font-bold mb-0.5" style={{ color: "#D97706" }}>
                            Notas del tutor
                          </p>
                          <p className="text-sm" style={{ color: "#374151" }}>{s.notes}</p>
                        </div>
                      </div>
                    )}

                    {/* ── Horario agendado ── */}
                    {s.scheduled_at && (
                      <div className="rounded-xl p-4 mb-4 flex items-center gap-3"
                        style={{ background: "#EFF6FF", border: "1px solid #93C5FD" }}>
                        <span className="text-lg flex-shrink-0">📅</span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: "#1D4ED8" }}>Horario agendado</p>
                          <p className="text-sm font-semibold" style={{ color: "#374151" }}>
                            {new Date(s.scheduled_at).toLocaleDateString("es-CO", {
                              weekday: "long", day: "numeric", month: "long", year: "numeric",
                              hour: "2-digit", minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ── Indicaciones del profesional ── */}
                    {s.professional_notes && (
                      <div className="rounded-xl p-4 mb-4 flex items-start gap-2"
                        style={{ background: "#F0FDF4", border: "1px solid #86EFAC" }}>
                        <span className="text-sm flex-shrink-0">📋</span>
                        <div>
                          <p className="text-xs font-bold mb-0.5" style={{ color: "#15803D" }}>
                            Tus indicaciones
                          </p>
                          <p className="text-sm" style={{ color: "#374151" }}>{s.professional_notes}</p>
                        </div>
                      </div>
                    )}

                    {/* ── Meeting link (en_curso) ── */}
                    {s.meeting_link && s.status === "en_curso" && (
                      <div
                        className="rounded-xl p-4 mb-5"
                        style={{ background: "#E1EFFF", border: "1.5px solid #93C5FD" }}
                      >
                        <p className="text-xs font-bold mb-2 flex items-center gap-1.5"
                          style={{ color: "#1D4ED8" }}>
                          <Video className="w-3.5 h-3.5" />
                          Enlace de reunión enviado al tutor
                        </p>
                        <a
                          href={s.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold underline flex items-center gap-1 break-all"
                          style={{ color: "#1D4ED8" }}
                        >
                          <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                          {s.meeting_link}
                        </a>
                      </div>
                    )}

                    {/* ── Actions ── */}
                    <div className="flex flex-wrap gap-3 w-full">

                      {/* PENDIENTE → form + Reject */}
                      {s.status === "pendiente" && (
                        <div className="w-full space-y-3">
                          {/* Botón que abre/cierra el form de aceptación */}
                          {acceptFormId !== s.id_sesion_asistida ? (
                            <div className="flex flex-wrap gap-3">
                              <button
                                onClick={() => setAcceptFormId(s.id_sesion_asistida)}
                                disabled={isBusy}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                                style={{ background: "linear-gradient(135deg,#22C55E,#16A34A)", opacity: isBusy ? 0.6 : 1 }}
                              >
                                <CheckCircle className="w-4 h-4" />
                                Aceptar solicitud
                              </button>
                              <button
                                onClick={() => handleReject(s.id_sesion_asistida)}
                                disabled={isBusy}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                                style={{ background: "#FEF2F2", color: "#B91C1C", border: "1.5px solid #FCA5A5", opacity: isBusy ? 0.6 : 1 }}
                              >
                                {isBusy && submittingKind === "reject"
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <XCircle className="w-4 h-4" />}
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            /* Formulario de aceptación */
                            <div className="rounded-2xl p-5 space-y-4"
                              style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC" }}>
                              <p className="text-sm font-extrabold" style={{ color: "#15803D" }}>
                                ✅ Confirmar aceptación
                              </p>

                              {/* Horario */}
                              <div>
                                <label className="text-xs font-bold block mb-1.5" style={{ color: "#374151" }}>
                                  📅 Horario de la consulta
                                  <span className="font-normal ml-1" style={{ color: "#9CA3AF" }}>(opcional)</span>
                                </label>
                                <input
                                  type="datetime-local"
                                  value={scheduleInput[s.id_sesion_asistida] || ""}
                                  onChange={e => setScheduleInput(prev => ({ ...prev, [s.id_sesion_asistida]: e.target.value }))}
                                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
                                  style={{ border: "1.5px solid #86EFAC", background: "white", color: "#374151" }}
                                />
                              </div>

                              {/* Indicaciones */}
                              <div>
                                <label className="text-xs font-bold block mb-1.5" style={{ color: "#374151" }}>
                                  📋 Indicaciones para el tutor y estudiante
                                  <span className="font-normal ml-1" style={{ color: "#9CA3AF" }}>(opcional)</span>
                                </label>
                                <textarea
                                  rows={3}
                                  value={profNotesInput[s.id_sesion_asistida] || ""}
                                  onChange={e => setProfNotesInput(prev => ({ ...prev, [s.id_sesion_asistida]: e.target.value }))}
                                  placeholder="Ej: El niño debe descansar 30 min antes, traer sus últimas evaluaciones, usar ropa cómoda…"
                                  className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                                  style={{ border: "1.5px solid #86EFAC", background: "white", color: "#374151" }}
                                />
                              </div>

                              {/* Botones confirmar / cancelar */}
                              <div className="flex gap-3">
                                <button
                                  onClick={() => handleAccept(s.id_sesion_asistida)}
                                  disabled={isBusy}
                                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                                  style={{ background: "linear-gradient(135deg,#22C55E,#16A34A)", opacity: isBusy ? 0.6 : 1 }}
                                >
                                  {isBusy && submittingKind === "accept"
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <CheckCircle className="w-4 h-4" />}
                                  Confirmar
                                </button>
                                <button
                                  onClick={() => setAcceptFormId(null)}
                                  disabled={isBusy}
                                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                                  style={{ background: "white", color: "#6B7280", border: "1.5px solid #D1D5DB" }}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ACEPTADA → Send link form */}
                      {s.status === "aceptada" && (
                        <div className="flex-1 flex flex-col sm:flex-row gap-2 min-w-0">
                          <input
                            type="url"
                            value={linkInput[s.id_sesion_asistida] || ""}
                            onChange={e =>
                              setLinkInput(prev => ({ ...prev, [s.id_sesion_asistida]: e.target.value }))
                            }
                            placeholder="Pega el enlace de Zoom / Google Meet / Teams…"
                            className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none min-w-0"
                            style={{ border: "1.5px solid #93C5FD", background: "#EFF6FF", color: "#374151" }}
                          />
                          <button
                            onClick={() => handleSendLink(s.id_sesion_asistida)}
                            disabled={!linkInput[s.id_sesion_asistida]?.trim() || isBusy}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white flex-shrink-0 transition-all"
                            style={{
                              background:   "linear-gradient(135deg,#3B82F6,#1D4ED8)",
                              opacity:      !linkInput[s.id_sesion_asistida]?.trim() || isBusy ? 0.5 : 1,
                              cursor:       !linkInput[s.id_sesion_asistida]?.trim() ? "not-allowed" : "pointer",
                            }}
                          >
                            {isBusy && submittingKind === "link"
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Send className="w-4 h-4" />}
                            Enviar enlace
                          </button>
                        </div>
                      )}

                      {/* EN_CURSO → Close */}
                      {s.status === "en_curso" && (
                        <button
                          onClick={() => handleClose(s.id_sesion_asistida)}
                          disabled={isBusy}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                          style={{ background: "#F9FAFB", color: "#6B7280", border: "1.5px solid #D1D5DB", opacity: isBusy ? 0.6 : 1 }}
                        >
                          {isBusy && submittingKind === "close"
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <XCircle className="w-4 h-4" />}
                          Finalizar sesión
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
