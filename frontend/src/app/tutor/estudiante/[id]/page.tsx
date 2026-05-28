"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";

const TutorStudentLivePanel = dynamic(
  () => import("@/components/monitoring/TutorStudentLivePanel"),
  { ssr: false },
);
import { useSessionStore } from "@/store/sessionStore";
import {
  api,
  type StudentResponse,
  type ProfileResponse,
  type SessionResponse,
  type DegreeResponse,
  type DiagnosisResponse,
  type ProfessionalResponse,
} from "@/lib/api";
import {
  ArrowLeft,
  Edit3,
  Save,
  X,
  MessageSquare,
  Stethoscope,
  User,
  Clock,
  AlertTriangle,
  FileText,
  Upload,
  FileCheck2,
  Trash2,
  ExternalLink,
  Plus,
  Loader2,
  Send,
} from "lucide-react";

const SPECIALTY_EMOJI: Record<string, string> = {
  "Psicólogo Clínico":     "🧠",
  "Psiquiatra":            "🩺",
  "Neuropsicólogo":        "🔬",
  "Terapeuta Ocupacional": "🤝",
  "Logopeda":              "💬",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(sec: number | null, status: string): string {
  if (status === "activa") return "En progreso";
  if (!sec) return "—";
  const mins = Math.round(sec / 60);
  return `${mins} min`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    activo:      { label: "Activo",      cls: "bg-green-100 text-green-700"   },
    inactivo:    { label: "Inactivo",    cls: "bg-gray-100 text-gray-500"     },
    suspendido:  { label: "Suspendido",  cls: "bg-red-100 text-red-600"       },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function SessionTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    aprendizaje: { label: "Aprendizaje", cls: "bg-blue-100 text-blue-700"    },
    evaluacion:  { label: "Evaluación",  cls: "bg-purple-100 text-purple-700" },
    repaso:      { label: "Repaso",      cls: "bg-amber-100 text-amber-700"   },
  };
  const { label, cls } = map[type] ?? { label: type, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    activa:        { label: "Activa",        cls: "bg-green-100 text-green-700"  },
    completada:    { label: "Completada",    cls: "bg-blue-100 text-blue-700"    },
    interrumpida:  { label: "Interrumpida",  cls: "bg-orange-100 text-orange-700" },
    crisis:        { label: "Crisis",        cls: "bg-red-100 text-red-700"      },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// Button group for enum fields
function ButtonGroup({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: { value: string; label: string }[];
  value: string | null | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            value === opt.value
              ? "bg-primary-600 border-primary-600 text-white"
              : "bg-white border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Labeled slider
function SliderField({
  label,
  value,
  min,
  max,
  unit = "",
  onChange,
}: {
  label: string;
  value: number | null | undefined;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const current = value ?? min;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs font-semibold text-gray-700">
          {current}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary-600"
      />
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

// Mapeo de valores enum → etiquetas legibles
const ENUM_LABELS: Record<string, string> = {
  // visual_contrast
  bajo: "Suave",
  normal: "Normal",
  alto: "Alto contraste",
  // feedback_type
  visual: "Visual",
  auditivo: "Auditivo",
  mixto: "Mixto",
  // font_size
  pequeno: "Pequeño",
  grande: "Grande",
  // animation_speed
  lenta: "Lenta",
  rapida: "Rápida",
};

function prettyValue(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") return ENUM_LABELS[v] ?? v;
  return String(v);
}

// Read-only profile row (siempre renderiza para mostrar "—" si no hay dato)
function ProfileRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
  highlight?: boolean;
}) {
  const display = prettyValue(value);
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-400 text-sm">{label}</span>
      <span
        className={`font-semibold text-sm ${
          display === "—" ? "text-gray-300" : highlight ? "text-primary-600" : "text-gray-700"
        }`}
      >
        {display}
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TutorEstudiantePage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.id as string;

  const { token, user, _hasHydrated } = useSessionStore();

  const [student, setStudent]     = useState<StudentResponse | null>(null);
  const [profile, setProfile]     = useState<ProfileResponse | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [sessions, setSessions]   = useState<SessionResponse[]>([]);
  const [degrees, setDegrees]     = useState<DegreeResponse[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm]       = useState<Partial<ProfileResponse>>({});
  const [savingProfile, setSavingProfile]   = useState(false);
  const [successMsg, setSuccessMsg]         = useState("");
  const [errorMsg, setErrorMsg]             = useState("");
  const [consultLoading, setConsultLoading] = useState(false);

  /* ── Sesión asistida modal ── */
  const [showAssistModal,  setShowAssistModal]  = useState(false);
  const [availableProfs,   setAvailableProfs]   = useState<ProfessionalResponse[]>([]);
  const [loadingProfs,     setLoadingProfs]     = useState(false);
  const [selectedProfId,   setSelectedProfId]   = useState("");
  const [assistNotes,      setAssistNotes]      = useState("");
  const [assistSubmitting, setAssistSubmitting] = useState(false);
  const [assistBanner,     setAssistBanner]     = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  /* ── Diagnósticos ── */
  const [diagnoses, setDiagnoses] = useState<DiagnosisResponse[]>([]);
  const [diagnosisTypes, setDiagnosisTypes] = useState<{ id_type_diagnosis: string; name: string }[]>([]);
  const [showDiagModal, setShowDiagModal] = useState(false);
  const [diagFile, setDiagFile] = useState<File | null>(null);
  const [diagType, setDiagType] = useState("");
  const [diagDesc, setDiagDesc] = useState("");
  const [diagUploading, setDiagUploading] = useState(false);
  const [diagError, setDiagError] = useState("");
  const diagFileRef = useRef<HTMLInputElement>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    if (!token) return;
    setProfileLoadError(null);
    try {
      const prof = await api.getStudentProfile(token, studentId);
      setProfile(prof);
      setProfileForm(prof);
      setProfileMissing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // 404 → realmente no existe el perfil
      if (msg.toLowerCase().includes("no encontrado") || msg.toLowerCase().includes("not found") || msg.includes("404")) {
        setProfileMissing(true);
        setProfileLoadError(null);
      } else {
        // Error de red / 5xx → mostramos retry, NO el "no tiene perfil"
        console.error("Error cargando perfil sensorial:", err);
        setProfileMissing(false);
        setProfileLoadError(msg || "No se pudo cargar el perfil");
      }
      setProfile(null);
    }
  }, [token, studentId]);

  const loadDiagnoses = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.listStudentDiagnoses(token, studentId);
      setDiagnoses(list);
    } catch (err) {
      console.warn("Error cargando diagnósticos:", err);
      setDiagnoses([]);
    }
  }, [token, studentId]);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [stud, sess, degs, diagTypes] = await Promise.all([
        api.getStudent(token, studentId),
        api.getSessions(token, { student_id: studentId, limit: "20" }),
        api.getDegrees(),
        api.getDiagnosisTypes().catch(() => []),
      ]);
      setStudent(stud);
      setSessions(sess);
      setDegrees(degs);
      setDiagnosisTypes(diagTypes);
      // Cargas en paralelo (no críticas)
      loadProfile();
      loadDiagnoses();
    } catch (err) {
      console.error("Error cargando estudiante:", err);
      setErrorMsg("No se pudo cargar la información del estudiante.");
    } finally {
      setLoading(false);
    }
  }, [token, studentId, loadProfile, loadDiagnoses]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (
      !token ||
      !user ||
      (user.rol !== "tutor" && user.rol !== "profesional" && user.rol !== "admin")
    ) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [_hasHydrated, token, user, router, loadData]);

  // ── Profile save ──────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    if (!token) return;
    setSavingProfile(true);
    setErrorMsg("");
    try {
      // Si no había perfil, crearlo (POST). Si ya existía, actualizarlo (PUT).
      let result: ProfileResponse;
      if (profile) {
        result = await api.updateStudentProfile(token, studentId, profileForm);
      } else {
        // Asegurar defaults completos para el POST
        const body = {
          id_student:      studentId,
          volume_level:    profileForm.volume_level    ?? 5,
          visual_contrast: profileForm.visual_contrast ?? "normal",
          feedback_type:   profileForm.feedback_type   ?? "mixto",
          font_size:       profileForm.font_size       ?? "normal",
          animation_speed: profileForm.animation_speed ?? "normal",
          max_session_min: profileForm.max_session_min ?? 30,
          needs_breaks:    profileForm.needs_breaks    ?? false,
          break_interval:  profileForm.break_interval  ?? 15,
        };
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/students/${studentId}/profile`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(body),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Error al crear perfil" }));
          throw new Error(err.detail || `Error ${res.status}`);
        }
        result = await res.json();
      }
      setProfile(result);
      setProfileForm(result);
      setProfileMissing(false);
      setEditingProfile(false);
      showSuccess("Perfil de adaptación guardado correctamente");
    } catch (err) {
      console.error("Error guardando perfil:", err);
      setErrorMsg(err instanceof Error ? err.message : "Error al guardar el perfil.");
    } finally {
      setSavingProfile(false);
    }
  };

  const cancelEdit = () => {
    setEditingProfile(false);
    setProfileForm(profile || {});
    setErrorMsg("");
  };

  /* ── Diagnósticos: handlers ── */
  const openDiagnosisModal = () => {
    setDiagFile(null); setDiagDesc(""); setDiagType(""); setDiagError("");
    setShowDiagModal(true);
  };

  const handleDiagFileSelect = (f: File | null) => {
    setDiagError("");
    if (!f) { setDiagFile(null); return; }
    const ok = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!ok.includes(f.type))     { setDiagError("Formato no permitido. PDF/JPG/PNG/WebP."); return; }
    if (f.size > 5 * 1024 * 1024) { setDiagError("El archivo supera los 5 MB.");              return; }
    setDiagFile(f);
  };

  const handleDiagSubmit = async () => {
    if (!token || !diagFile || !diagType) {
      setDiagError("Debes seleccionar el tipo y el archivo");
      return;
    }
    setDiagUploading(true); setDiagError("");
    try {
      await api.uploadStudentDiagnosis(token, studentId, {
        id_type_diagnosis: diagType,
        description:       diagDesc || undefined,
        file:              diagFile,
      });
      showSuccess("Diagnóstico subido correctamente");
      setShowDiagModal(false);
      loadDiagnoses();
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : "Error al subir el diagnóstico");
    } finally {
      setDiagUploading(false);
    }
  };

  const handleDiagDelete = async (diag: DiagnosisResponse) => {
    if (!token) return;
    if (!confirm("¿Eliminar este diagnóstico? Esta acción no se puede deshacer.")) return;
    try {
      await api.deleteStudentDiagnosis(token, studentId, diag.id_diagnosis);
      showSuccess("Diagnóstico eliminado");
      loadDiagnoses();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  };

  // ── Consult request ───────────────────────────────────────────────────────

  const recentActiveSession = sessions.find((s) => s.status === "activa") ?? sessions[0] ?? null;

  const handleRequestConsult = async () => {
    if (!token || !recentActiveSession) return;
    setConsultLoading(true);
    setErrorMsg("");
    try {
      await api.requestExternalConsult(
        token,
        recentActiveSession.id_session,
        "Consulta solicitada"
      );
      showSuccess("Consulta enviada al profesional disponible");
    } catch (err) {
      console.error("Error solicitando consulta:", err);
      setErrorMsg("No se pudo enviar la consulta. Intenta de nuevo.");
    } finally {
      setConsultLoading(false);
    }
  };

  // ── Open assisted-session request modal ──────────────────────────────────

  const handleOpenAssistModal = async () => {
    setSelectedProfId(""); setAssistNotes(""); setAssistBanner(null);
    setShowAssistModal(true);
    setLoadingProfs(true);
    try {
      const profs = await api.getAvailableProfessionals(token!);
      setAvailableProfs(profs || []);
    } catch {
      setAvailableProfs([]);
    } finally {
      setLoadingProfs(false);
    }
  };

  const handleSubmitAssist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !user || !student || !selectedProfId) return;
    setAssistSubmitting(true);
    setAssistBanner(null);
    try {
      await api.requestAssistedSession(token, {
        id_tutor:        user.user_id,
        id_professional: selectedProfId,
        id_student:      student.id_student,
        notes:           assistNotes.trim() || undefined,
      });
      setAssistBanner({ type: "ok", msg: "¡Solicitud enviada! El profesional recibirá la notificación." });
      setTimeout(() => {
        setShowAssistModal(false);
        setSelectedProfId(""); setAssistNotes(""); setAssistBanner(null);
      }, 1800);
    } catch (err) {
      setAssistBanner({ type: "err", msg: err instanceof Error ? err.message : "Error al enviar la solicitud" });
    } finally {
      setAssistSubmitting(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalSessions     = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === "completada").length;
  const crisisCount       = sessions.filter((s) => s.status === "crisis").length;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
          className="text-gray-400 text-sm"
        >
          Cargando...
        </motion.p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <User className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-red-400 font-medium">Estudiante no encontrado</p>
          <button
            onClick={() => router.push("/tutor")}
            className="text-sm text-primary-600 underline"
          >
            Volver al panel
          </button>
        </div>
      </div>
    );
  }

  const CONTRAST_OPTIONS   = [{ value: "bajo", label: "Bajo" }, { value: "normal", label: "Normal" }, { value: "alto", label: "Alto" }];
  const FEEDBACK_OPTIONS   = [{ value: "visual", label: "Visual" }, { value: "auditivo", label: "Auditivo" }, { value: "mixto", label: "Mixto" }];
  const FONT_OPTIONS       = [{ value: "pequeno", label: "Pequeño" }, { value: "normal", label: "Normal" }, { value: "grande", label: "Grande" }];
  const ANIMATION_OPTIONS  = [{ value: "lenta", label: "Lenta" }, { value: "normal", label: "Normal" }, { value: "rapida", label: "Rápida" }];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/tutor")}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
            aria-label="Volver al panel"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-800 truncate">
                {student.full_name}
              </h1>
              <StatusBadge status={student.account_status} />
            </div>
            {student.access_code ? (
              <p className="text-xs text-gray-400 mt-0.5 font-mono tracking-wide flex items-center gap-1.5">
                Código de acceso:
                <span
                  className="text-primary-600 font-bold tracking-widest px-2 py-0.5 rounded bg-primary-50"
                  style={{ letterSpacing: "0.15em" }}
                >
                  {student.access_code}
                </span>
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-0.5">Sin código de acceso disponible</p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Feedback messages ── */}
        <AnimatePresence>
          {successMsg && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm font-medium"
            >
              <span className="text-base">✓</span>
              {successMsg}
            </motion.div>
          )}
          {errorMsg && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {errorMsg}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ════════════════════════════════════════════════════════
              LEFT COLUMN
          ════════════════════════════════════════════════════════ */}
          <div className="space-y-6">

            {/* ── Student info card ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  {student.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={student.avatar_url}
                      alt={student.full_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-5 h-5 text-primary-600" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-gray-800 leading-tight">{student.full_name}</p>
                  <p className="text-xs text-gray-400">
                    {calcAge(student.birth_date)} años
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Fecha de nacimiento</span>
                  <span className="text-gray-700 font-medium">
                    {new Date(student.birth_date).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>

                {student.identity_document && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Documento</span>
                    <span className="text-gray-700 font-medium">
                      {student.identity_document}
                    </span>
                  </div>
                )}

                {student.access_code && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Código</span>
                    <span className="font-mono bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded-lg text-xs tracking-widest select-all">
                      {student.access_code}
                    </span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-400">Grado</span>
                  <span className="text-gray-700 font-medium">
                    {degrees.find((d) => d.id_degree === student.id_degree)?.grade_name ?? "—"}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* ── Adaptation profile card ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.07 }}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-700">Perfil de Adaptación</h2>
                {profile && !editingProfile && (
                  <button
                    onClick={() => setEditingProfile(true)}
                    className="text-primary-500 hover:text-primary-700 transition-colors p-1 rounded-lg hover:bg-primary-50"
                    aria-label="Editar perfil"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                {editingProfile && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="text-green-600 hover:text-green-700 transition-colors p-1 rounded-lg hover:bg-green-50 disabled:opacity-50"
                      aria-label="Guardar"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-red-400 hover:text-red-600 transition-colors p-1 rounded-lg hover:bg-red-50"
                      aria-label="Cancelar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Error de carga (no 404) — ofrecer reintentar */}
              {profileLoadError && !profile && !editingProfile && (
                <div
                  className="rounded-xl p-4 text-center space-y-3"
                  style={{ background: "#fee2e2", border: "1.5px solid #fca5a5" }}
                >
                  <AlertTriangle className="w-6 h-6 text-red-500 mx-auto" />
                  <p className="text-sm font-semibold text-red-700">
                    No se pudo cargar el perfil
                  </p>
                  <p className="text-xs text-red-600">{profileLoadError}</p>
                  <button
                    onClick={loadProfile}
                    className="text-xs font-bold text-red-600 underline underline-offset-2"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {/* No profile yet */}
              {profileMissing && !profile && !editingProfile && (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                  </div>
                  <p className="text-sm text-gray-500">
                    Este estudiante aún no tiene un perfil de adaptación.
                  </p>
                  <button
                    onClick={() => {
                      setProfileForm({
                        volume_level: 5,
                        visual_contrast: "normal",
                        feedback_type: "mixto",
                        font_size: "normal",
                        animation_speed: "normal",
                        max_session_min: 30,
                        needs_breaks: false,
                        break_interval: 15,
                      });
                      setEditingProfile(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Crear perfil de adaptación
                  </button>
                </div>
              )}

              {/* View mode */}
              {profile && !editingProfile && (
                <div className="space-y-0.5">
                  <ProfileRow label="Volumen"             value={profile.volume_level !== null ? `${profile.volume_level} / 10` : null} />
                  <ProfileRow label="Contraste visual"    value={profile.visual_contrast} highlight />
                  <ProfileRow label="Tipo de feedback"    value={profile.feedback_type} highlight />
                  <ProfileRow label="Tamaño de fuente"    value={profile.font_size} highlight />
                  <ProfileRow label="Velocidad de animación" value={profile.animation_speed} highlight />
                  <ProfileRow label="Duración máxima"     value={profile.max_session_min !== null ? `${profile.max_session_min} min` : null} />
                  <ProfileRow label="Necesita pausas"     value={profile.needs_breaks} />
                  {profile.needs_breaks && (
                    <ProfileRow label="Intervalo pausas"  value={profile.break_interval !== null ? `${profile.break_interval} min` : null} />
                  )}
                  <ProfileRow label="Perfil activo"       value={profile.is_active} />
                </div>
              )}

              {/* Edit mode */}
              {editingProfile && (
                <div className="space-y-5">
                  {/* Volume */}
                  <SliderField
                    label="Nivel de volumen"
                    value={profileForm.volume_level}
                    min={0}
                    max={10}
                    onChange={(v) => setProfileForm((f) => ({ ...f, volume_level: v }))}
                  />

                  {/* Visual contrast */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-gray-500">Contraste visual</span>
                    <ButtonGroup
                      options={CONTRAST_OPTIONS}
                      value={profileForm.visual_contrast}
                      onChange={(v) => setProfileForm((f) => ({ ...f, visual_contrast: v }))}
                    />
                  </div>

                  {/* Feedback type */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-gray-500">Tipo de feedback</span>
                    <ButtonGroup
                      options={FEEDBACK_OPTIONS}
                      value={profileForm.feedback_type}
                      onChange={(v) => setProfileForm((f) => ({ ...f, feedback_type: v }))}
                    />
                  </div>

                  {/* Font size */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-gray-500">Tamaño de fuente</span>
                    <ButtonGroup
                      options={FONT_OPTIONS}
                      value={profileForm.font_size}
                      onChange={(v) => setProfileForm((f) => ({ ...f, font_size: v }))}
                    />
                  </div>

                  {/* Animation speed */}
                  <div className="space-y-1.5">
                    <span className="text-xs text-gray-500">Velocidad de animación</span>
                    <ButtonGroup
                      options={ANIMATION_OPTIONS}
                      value={profileForm.animation_speed}
                      onChange={(v) => setProfileForm((f) => ({ ...f, animation_speed: v }))}
                    />
                  </div>

                  {/* Max session minutes */}
                  <SliderField
                    label="Duración máxima de sesión"
                    value={profileForm.max_session_min}
                    min={10}
                    max={90}
                    unit=" min"
                    onChange={(v) => setProfileForm((f) => ({ ...f, max_session_min: v }))}
                  />

                  {/* Needs breaks toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Necesita pausas</span>
                    <button
                      type="button"
                      onClick={() =>
                        setProfileForm((f) => ({
                          ...f,
                          needs_breaks: !f.needs_breaks,
                        }))
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        profileForm.needs_breaks ? "bg-primary-600" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          profileForm.needs_breaks ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Break interval — only if needs_breaks */}
                  {profileForm.needs_breaks && (
                    <SliderField
                      label="Intervalo entre pausas"
                      value={profileForm.break_interval}
                      min={5}
                      max={30}
                      unit=" min"
                      onChange={(v) => setProfileForm((f) => ({ ...f, break_interval: v }))}
                    />
                  )}

                  {savingProfile && (
                    <p className="text-xs text-primary-600 animate-pulse text-center">
                      Guardando...
                    </p>
                  )}
                </div>
              )}
            </motion.div>

            {/* ── Diagnósticos médicos ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-500" />
                  <h2 className="font-bold text-gray-700">Diagnósticos médicos</h2>
                </div>
                <button
                  onClick={openDiagnosisModal}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{ background: "#FFE4D4", color: "#c9591e" }}
                  title="Subir nuevo diagnóstico"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Subir
                </button>
              </div>

              {diagnoses.length === 0 ? (
                <div className="text-center py-4 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6 text-amber-400" />
                  </div>
                  <p className="text-sm text-gray-500">
                    Aún no hay diagnósticos registrados.
                  </p>
                  <button
                    onClick={openDiagnosisModal}
                    className="text-xs text-amber-600 underline underline-offset-2 font-semibold"
                  >
                    Subir el primer diagnóstico
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {diagnoses.map((d) => {
                    const typeName = diagnosisTypes.find(
                      (t) => t.id_type_diagnosis === d.id_type_diagnosis
                    )?.name ?? "Diagnóstico";
                    return (
                      <div
                        key={d.id_diagnosis}
                        className="flex items-start gap-3 p-3 rounded-xl"
                        style={{ background: "#FFFBF5", border: "1px solid #EAE0D0" }}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "#FFE4D4", color: "#c9591e" }}
                        >
                          <FileCheck2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-700 truncate">{typeName}</p>
                          {d.description && (
                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{d.description}</p>
                          )}
                          {d.created_at && (
                            <p className="text-[10px] text-gray-400 mt-1">
                              {new Date(d.created_at).toLocaleDateString("es-CO", {
                                day: "numeric", month: "short", year: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {d.document_url && (
                            <a
                              href={api.absoluteUploadUrl(d.document_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: "#4587a9" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#E1EFFF")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              title="Ver documento"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleDiagDelete(d)}
                            className="p-1.5 rounded-lg transition-colors text-red-400 hover:bg-red-50 hover:text-red-600"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>

            {/* ── Request professional consult ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.14 }}
            >
              <button
                onClick={handleRequestConsult}
                disabled={!recentActiveSession || consultLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-semibold hover:bg-indigo-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  !recentActiveSession
                    ? "No hay sesión activa para adjuntar la consulta"
                    : undefined
                }
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                {consultLoading ? "Enviando..." : "Solicitar consulta con profesional"}
              </button>
              {!recentActiveSession && (
                <p className="text-xs text-gray-400 text-center mt-1.5">
                  Requiere que el estudiante tenga una sesión reciente
                </p>
              )}
            </motion.div>

            {/* ── Request assisted session ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.18 }}
            >
              <button
                onClick={handleOpenAssistModal}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 active:scale-[0.98] text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all"
                style={{ background: "linear-gradient(135deg,#7FB3D5,#4587a9)", boxShadow: "0 4px 16px rgba(127,179,213,0.35)" }}
              >
                <Stethoscope className="w-4 h-4 flex-shrink-0" />
                Solicitar consulta con profesional
              </button>
            </motion.div>
          </div>

          {/* ════════════════════════════════════════════════════════
              RIGHT COLUMN — Live monitoring + Session history
          ════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-2">

            {/* ── Panel de monitoreo en vivo ── */}
            {token && (
              <TutorStudentLivePanel studentId={studentId} token={token} />
            )}

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
            >
              <h2 className="font-bold text-gray-700 text-lg mb-4">Historial de Sesiones</h2>

              {/* ── Stats row ── */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  {
                    label: "Total",
                    value: totalSessions,
                    icon: <Clock className="w-4 h-4" />,
                    color: "text-primary-600",
                    bg: "bg-primary-50",
                  },
                  {
                    label: "Completadas",
                    value: completedSessions,
                    icon: <User className="w-4 h-4" />,
                    color: "text-green-600",
                    bg: "bg-green-50",
                  },
                  {
                    label: "Crisis",
                    value: crisisCount,
                    icon: <AlertTriangle className="w-4 h-4" />,
                    color: crisisCount > 0 ? "text-red-600" : "text-gray-400",
                    bg: crisisCount > 0 ? "bg-red-50" : "bg-gray-50",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`${stat.bg} rounded-xl border border-gray-100 p-4 flex items-center gap-3`}
                  >
                    <span className={stat.color}>{stat.icon}</span>
                    <div>
                      <p className={`text-2xl font-bold leading-none ${stat.color}`}>
                        {stat.value}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Session list ── */}
              {sessions.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-sm">
                  <Clock className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 font-medium">
                    Este estudiante aún no tiene sesiones registradas
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session, index) => (
                    <motion.div
                      key={session.id_session}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 * index }}
                      className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Session header */}
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-700 text-sm leading-snug capitalize">
                            {formatDate(session.start_time)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Inicio: {new Date(session.start_time).toLocaleTimeString("es-CO", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {session.end_time && (
                              <> · Fin: {new Date(session.end_time).toLocaleTimeString("es-CO", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                          <SessionTypeBadge type={session.session_type} />
                          <SessionStatusBadge status={session.status} />
                        </div>
                      </div>

                      {/* Session details row */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(session.duration_sec, session.status)}
                        </span>
                        {session.device_type && (
                          <span className="capitalize">{session.device_type}</span>
                        )}
                        {session.device && (
                          <span className="text-gray-400 truncate max-w-[140px]">
                            {session.device}
                          </span>
                        )}
                        {session.status === "crisis" && (
                          <span className="flex items-center gap-1 text-red-500 font-semibold">
                            <AlertTriangle className="w-3 h-3" />
                            Crisis registrada
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

        </div>
      </main>

      {/* ══════════════════ MODAL: SESIÓN ASISTIDA ══════════════════ */}
      <AnimatePresence>
        {showAssistModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-4 py-8 overflow-y-auto"
            style={{ background: "rgba(52,73,94,0.50)", backdropFilter: "blur(4px)" }}
            onClick={() => !assistSubmitting && setShowAssistModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              className="rounded-3xl p-7 w-full max-w-lg relative"
              style={{ background: "white", boxShadow: "0 12px 50px rgba(52,73,94,0.22)" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                    style={{ background: "#E1EFFF" }}>🩺</div>
                  <div>
                    <h2 className="font-extrabold text-base" style={{ color: "#34495E" }}>
                      Solicitar consulta con profesional
                    </h2>
                    <p className="text-xs" style={{ color: "#a0aec0" }}>
                      Estudiante: <strong style={{ color: "#4587a9" }}>{student?.full_name}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => !assistSubmitting && setShowAssistModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "#f3f4f6", color: "#7f8c8d" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Banner */}
              {assistBanner && (
                <div
                  className="rounded-xl px-4 py-3 text-sm font-semibold mb-4 flex items-center gap-2"
                  style={assistBanner.type === "ok"
                    ? { background: "#F0FDF4", color: "#15803D", border: "1px solid #86EFAC" }
                    : { background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5" }}
                >
                  {assistBanner.type === "ok" ? "✅" : "⚠️"} {assistBanner.msg}
                </div>
              )}

              <form onSubmit={handleSubmitAssist} className="space-y-5">

                {/* Professional selector */}
                <div>
                  <label className="text-sm font-bold block mb-2" style={{ color: "#34495E" }}>
                    Especialista disponible <span style={{ color: "#FFB37B" }}>*</span>
                  </label>
                  {loadingProfs ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#7FB3D5" }} />
                    </div>
                  ) : availableProfs.length === 0 ? (
                    <div className="rounded-xl p-4 text-sm text-center"
                      style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5" }}>
                      No hay especialistas disponibles en este momento.<br />
                      <span className="text-xs opacity-75">Deben estar aprobados y sin sesión activa.</span>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {availableProfs.map(p => (
                        <button
                          key={p.id_professional}
                          type="button"
                          onClick={() => setSelectedProfId(p.id_professional)}
                          className="w-full text-left rounded-xl p-3.5 flex items-center gap-3 transition-all"
                          style={selectedProfId === p.id_professional
                            ? { background: "#E1EFFF", border: "2px solid #7FB3D5" }
                            : { background: "#f9fafb", border: "1.5px solid #D5DBDB" }}
                        >
                          <span className="text-xl flex-shrink-0">
                            {SPECIALTY_EMOJI[p.speciality] || "🩺"}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate" style={{ color: "#34495E" }}>
                              {p.full_name}
                            </p>
                            <p className="text-xs" style={{ color: "#7f8c8d" }}>
                              {p.speciality || "Especialista"}
                              {p.license_number ? ` · ${p.license_number}` : ""}
                            </p>
                          </div>
                          {selectedProfId === p.id_professional && (
                            <span className="ml-auto text-lg flex-shrink-0" style={{ color: "#4587a9" }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm font-bold block mb-2" style={{ color: "#34495E" }}>
                    Notas para el profesional
                    <span className="font-normal ml-1" style={{ color: "#a0aec0" }}>(opcional)</span>
                  </label>
                  <textarea
                    value={assistNotes}
                    onChange={e => setAssistNotes(e.target.value)}
                    placeholder="Describe brevemente el motivo de la consulta o el comportamiento observado…"
                    rows={3}
                    style={{
                      width: "100%", border: "1.5px solid #D5DBDB", borderRadius: "0.75rem",
                      padding: "0.75rem 1rem", fontSize: "0.875rem", outline: "none",
                      color: "#34495E", background: "white", resize: "vertical",
                    }}
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={assistSubmitting || !selectedProfId || loadingProfs}
                  className="w-full py-3.5 rounded-2xl font-extrabold text-white flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: (assistSubmitting || !selectedProfId || loadingProfs)
                      ? "#D5DBDB"
                      : "linear-gradient(135deg,#7FB3D5,#4587a9)",
                    cursor: (assistSubmitting || !selectedProfId || loadingProfs) ? "not-allowed" : "pointer",
                    boxShadow: (assistSubmitting || !selectedProfId || loadingProfs)
                      ? "none" : "0 4px 18px rgba(127,179,213,0.40)",
                  }}
                >
                  {assistSubmitting
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Enviando…</>
                    : <><Send className="w-5 h-5" /> Enviar solicitud</>}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════ MODAL: SUBIR DIAGNÓSTICO ══════════════════ */}
      {showDiagModal && (
        <div
          onClick={() => !diagUploading && setShowDiagModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(52,73,94,0.45)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "1.5rem",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              borderRadius: "1.25rem",
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "1.25rem 1.5rem", borderBottom: "1.5px solid #D5DBDB",
              }}
            >
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-500" />
                <h3 className="text-base font-extrabold" style={{ color: "#34495E" }}>
                  Subir diagnóstico médico
                </h3>
              </div>
              <button
                onClick={() => !diagUploading && setShowDiagModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div style={{ padding: "1.5rem" }} className="space-y-4">
              {diagError && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm"
                  style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#dc2626" }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {diagError}
                </div>
              )}

              {/* Tipo */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                  Tipo de diagnóstico <span className="text-red-500">*</span>
                </label>
                {diagnosisTypes.length === 0 ? (
                  <p className="text-sm italic text-gray-400">No hay tipos cargados.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {diagnosisTypes.map((t) => {
                      const selected = diagType === t.id_type_diagnosis;
                      return (
                        <button
                          key={t.id_type_diagnosis}
                          type="button"
                          onClick={() => setDiagType(t.id_type_diagnosis)}
                          className="p-2.5 rounded-xl text-sm font-semibold transition-all"
                          style={selected
                            ? { border: "2px solid #FFB37B", background: "#FFE4D4", color: "#c9591e" }
                            : { border: "2px solid #D5DBDB", background: "white",  color: "#34495E" }}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                  Notas adicionales <span className="text-xs text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  rows={2} value={diagDesc} onChange={(e) => setDiagDesc(e.target.value)}
                  placeholder="Información complementaria…"
                  style={{
                    width: "100%", borderRadius: "0.75rem", padding: "0.65rem 0.85rem",
                    fontSize: "0.875rem", outline: "none", color: "#34495E",
                    background: "white", border: "1.5px solid #D5DBDB", resize: "vertical",
                  }}
                />
              </div>

              {/* Archivo */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                  Documento <span className="text-red-500">*</span>
                </label>
                <input
                  ref={diagFileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => handleDiagFileSelect(e.target.files?.[0] || null)}
                  style={{ display: "none" }}
                />
                {!diagFile ? (
                  <button
                    type="button"
                    onClick={() => diagFileRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-xl transition-colors"
                    style={{ border: "2px dashed #D5DBDB", background: "#FDF8F2", color: "#7f8c8d" }}
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-sm font-semibold">Haz clic para subir un archivo</span>
                    <span className="text-xs">PDF, JPG, PNG o WebP · máx. 5 MB</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ background: "#dcfce7", border: "1.5px solid #86efac" }}>
                    <FileCheck2 className="w-5 h-5 flex-shrink-0 text-green-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-green-800">{diagFile.name}</p>
                      <p className="text-xs text-green-600">{(diagFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => { setDiagFile(null); if (diagFileRef.current) diagFileRef.current.value = ""; }}
                      className="p-1.5 rounded-lg hover:bg-white/50 text-green-700"
                      title="Quitar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={handleDiagSubmit}
                disabled={diagUploading || !diagFile || !diagType}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: diagUploading
                    ? "#f0c89a"
                    : "linear-gradient(135deg,#FFB37B,#ff9450)",
                  boxShadow: diagUploading ? "none" : "0 3px 14px rgba(255,148,80,0.38)",
                }}
              >
                {diagUploading
                  ? (<><Loader2 className="w-4 h-4 animate-spin" /> Subiendo…</>)
                  : (<><Upload className="w-4 h-4" /> Subir diagnóstico</>)}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
