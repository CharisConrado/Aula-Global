"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams }     from "next/navigation";
import { motion, AnimatePresence }  from "framer-motion";
import { useSessionStore }          from "@/store/sessionStore";
import { useSensoryProfile }        from "@/hooks/useSensoryProfile";
import { api, type ActivityResponse } from "@/lib/api";
import { ArrowLeft, CheckCircle, HelpCircle, SkipForward } from "lucide-react";
import dynamic from "next/dynamic";

// ── Dynamic imports (no SSR) ──────────────────────────────────────────────────
const EmotionDetector    = dynamic(() => import("@/components/monitoring/EmotionDetector"),          { ssr: false });
const CalmingScreen      = dynamic(() => import("@/components/ui/CalmingScreen"),                    { ssr: false });
const PresentationViewer = dynamic(() => import("@/components/student/PresentationViewer"),          { ssr: false });

// Activity components — one per subject type
const ArteCanvas      = dynamic(() => import("@/components/activities/ArteCanvas"),                  { ssr: false });
const EmparejarGame   = dynamic(() => import("@/components/activities/EmparejarGame"),               { ssr: false });
const VideoUpload     = dynamic(() => import("@/components/activities/VideoUpload"),                  { ssr: false });
const ArchivoUpload   = dynamic(() => import("@/components/activities/ArchivoUpload"),               { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────
interface QuizQuestion {
  pregunta:           string;
  opciones:           string[];
  respuesta_correcta: number;
  pista?:             string;
}
interface SlideData { num: number; titulo: string; puntos: string[] }
interface Par       { a: string; b: string }

// ── Detect activity kind from content ─────────────────────────────────────────
// tipo_evaluacion is set by seed_curriculum.py per subject:
//   arte             → "dibujo"
//   ciencias-sociales→ "video_upload"
//   ingles           → "quiz"
//   lenguaje         → "emparejar"
//   matematicas      → "ejercicio_archivo"
//   ciencias-naturales→ "quiz"
function getKind(activity: ActivityResponse): string {
  const c     = activity.content || {};
  const t     = ((activity.activity_type as string) || "").toLowerCase();
  const title = (activity.title || "").toLowerCase();

  // Explicit override written by the seed script — always trust this first
  if (c.tipo_evaluacion) return c.tipo_evaluacion as string;

  // Fallback: infer from content shape
  if (c.instruccion)                                         return "dibujo";
  if (c.preguntas)                                           return "quiz";
  if (c.pares)                                               return "emparejar";
  if (c.oraciones)                                           return "completar";
  if (c.texto)                                               return "lectura";
  if (c.ejercicios)                                          return "ejercicio_archivo";
  if ("busqueda_sugerida" in c || c.video_url !== undefined) return "video";
  if (c.enunciado)                                           return "ejercicio";

  // Fallback: DB type name
  if (t.includes("dibujo") || t.includes("arte"))            return "dibujo";
  if (t.includes("quiz"))                                    return "quiz";
  if (t.includes("asociar") || t.includes("memoria"))        return "emparejar";
  if (t.includes("completar"))                               return "completar";
  if (t.includes("lectura"))                                 return "lectura";
  if (t.includes("video"))                                   return "video";
  if (t.includes("ejercicio"))                               return "ejercicio";

  if (title.includes("arte") || title.includes("dibujo") || title.includes("pintura"))
    return "dibujo";

  return "generico";
}

// ── Loading screen ────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-blue to-soft-green student-shell">
      <motion.p
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="text-kid-xl font-bold text-primary-600"
      >
        Preparando actividad...
      </motion.p>
    </div>
  );
}

// ── Subject badge colours ─────────────────────────────────────────────────────
const KIND_META: Record<string, { emoji: string; label: string }> = {
  dibujo:            { emoji: "🎨", label: "Arte" },
  video_upload:      { emoji: "🎥", label: "Ciencias Sociales" },
  quiz:              { emoji: "🧠", label: "Quiz" },
  emparejar:         { emoji: "🔗", label: "Lenguaje" },
  ejercicio_archivo: { emoji: "🧮", label: "Matemáticas" },
  completar:         { emoji: "✍️", label: "Completar" },
  lectura:           { emoji: "📖", label: "Lectura" },
  ejercicio:         { emoji: "📝", label: "Ejercicio" },
  video:             { emoji: "🎬", label: "Video" },
  generico:          { emoji: "⭐", label: "Actividad" },
};

// ═════════════════════════════════════════════════════════════════════════════
export default function ActividadPage() {
  const router     = useRouter();
  const params     = useParams();
  const activityId = String(params.id);

  const { token, user, active_student_id, activeSession, _hasHydrated, setActiveSession } =
    useSessionStore();
  const { isHighContrast } = useSensoryProfile(token, active_student_id);

  // ── State ─────────────────────────────────────────────────────────────────
  const [activity,         setActivity]         = useState<ActivityResponse | null>(null);
  const [activityRecordId, setActivityRecordId] = useState<string | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [completed,        setCompleted]        = useState(false);
  const [score,            setScore]            = useState<number | null>(null);

  // Step: show PPTX slides before the activity
  const [showPresentation, setShowPresentation] = useState(true);

  // Quiz state
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer,  setSelectedAnswer]  = useState<number | null>(null);
  const [answers,         setAnswers]         = useState<number[]>([]);
  const [showFeedback,    setShowFeedback]    = useState(false);
  const [showHint,        setShowHint]        = useState(false);

  // Drawing state
  const [arteProgress, setArteProgress] = useState(0);

  const startTimeRef = useRef(Date.now());

  // ── Load activity ─────────────────────────────────────────────────────────
  const loadActivity = useCallback(async () => {
    if (!token || !activeSession || !active_student_id) return;
    try {
      const act = await api.getActivity(token, activityId);
      setActivity(act);
    } catch {
      setLoading(false);
      return;
    }
    try {
      const rec = await api.startActivity(token, activeSession.id_session, {
        id_student:  active_student_id,
        id_activity: activityId,
      });
      setActivityRecordId(rec.id_student_activity);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, [token, activeSession, active_student_id, activityId]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!token || !user) { router.replace("/login"); return; }
    if (!active_student_id) {
      router.replace(user.rol === "tutor" ? "/tutor" : "/admin");
      return;
    }
    if (!activeSession) {
      api.createSession(token, { id_student: active_student_id, session_type: "aprendizaje" })
        .then((s) =>
          setActiveSession({ id_session: s.id_session, id_student: s.id_student, start_time: s.start_time })
        )
        .catch(async () => {
          try { const act = await api.getActivity(token, activityId); setActivity(act); } catch {}
          setLoading(false);
        });
      return;
    }
    loadActivity();
  }, [_hasHydrated, token, user, active_student_id, activeSession, setActiveSession, router, loadActivity]);

  // ── Finish ────────────────────────────────────────────────────────────────
  const finishActivity = useCallback(async (nota: number) => {
    setScore(nota);
    setCompleted(true);

    // Persiste en localStorage para que el dashboard la muestre como completada
    if (active_student_id && activityId) {
      try {
        const storageKey = `aula_completed_${active_student_id}`;
        const prev = JSON.parse(localStorage.getItem(storageKey) || "[]") as string[];
        if (!prev.includes(activityId)) {
          localStorage.setItem(storageKey, JSON.stringify([...prev, activityId]));
        }
      } catch {}
    }

    if (!token || !activeSession || !activityRecordId) return;
    const tiempo = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await api.updateActivity(token, activeSession.id_session, activityRecordId, {
        score:             nota,
        is_completed:      true,
        time_spent_sec:    tiempo,
        achievement_level: nota >= 2 ? "completado" : "fallido",
      });
    } catch {}
  }, [token, activeSession, activityRecordId, active_student_id, activityId]);

  // ── Quiz answer handler ───────────────────────────────────────────────────
  const handleAnswer = (idx: number) => {
    if (showFeedback) return;
    setSelectedAnswer(idx);
    setShowFeedback(true);
    const newAns = [...answers, idx];
    setAnswers(newAns);
    setTimeout(() => {
      setShowFeedback(false);
      setSelectedAnswer(null);
      setShowHint(false);
      const qs = (activity?.content?.preguntas as QuizQuestion[]) || [];
      if (currentQuestion + 1 < qs.length) {
        setCurrentQuestion((q) => q + 1);
      } else {
        const correct = newAns.filter((a, i) => a === qs[i]?.respuesta_correcta).length;
        finishActivity(Math.round((correct / qs.length) * 5 * 10) / 10);
      }
    }, 1500);
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (!_hasHydrated || loading || !activity) return <LoadingScreen />;

  const slides       = (activity.content?.slides as SlideData[]) || [];
  const pptxUrl      = (activity.content?.presentacion_url as string) || undefined;
  const hasPresentation = slides.length > 0 || !!pptxUrl;
  const kind         = getKind(activity);
  const questions    = (activity.content?.preguntas as QuizQuestion[]) || [];
  const meta         = KIND_META[kind] || KIND_META.generico;

  // Past the presentation step?
  const pastPresentation = !showPresentation || !hasPresentation;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen student-shell"
      style={{ background: isHighContrast ? "#0F172A" : undefined }}
    >
      <CalmingScreen />
      {/* Emotion monitoring active from the moment the student opens the activity,
          including while viewing slides */}
      <EmotionDetector active={!completed} />

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="px-4 sm:px-6 py-4 backdrop-blur-sm border-b"
        style={{
          background: isHighContrast ? "#1E293B" : "rgba(255,255,255,0.85)",
          borderColor: isHighContrast ? "#334155" : "#f3f4f6",
        }}>
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <button
            onClick={() => router.push("/estudiante")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold hidden sm:inline">Volver</span>
          </button>

          <div className="flex-1 flex flex-col items-center min-w-0">
            <h1 className="text-kid-base font-bold text-gray-700 truncate w-full text-center">
              {activity.title}
            </h1>
            <span className="text-xs font-bold text-gray-400">
              {meta.emoji} {meta.label}
            </span>
          </div>

          {/* Presentation step badge */}
          {!pastPresentation && (
            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full flex-shrink-0">
              {pptxUrl ? "📊 Presentación" : `📊 ${slides.length} diap.`}
            </span>
          )}

          {/* Quiz progress */}
          {kind === "quiz" && pastPresentation && !completed && questions.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm text-gray-400">{currentQuestion + 1}/{questions.length}</span>
              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary-400 rounded-full"
                  animate={{ width: `${(currentQuestion / questions.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Drawing progress */}
          {kind === "dibujo" && pastPresentation && !completed && (
            <span className="text-sm font-semibold flex-shrink-0" style={{ color: "#7f8c8d" }}>
              🎨 {arteProgress}%
            </span>
          )}
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* ══════════════════════════════════════════════════════════════════
            STEP 1 — PRESENTATION (slides extracted from PPTX)
            All subjects show slides first, then the evaluative activity.
        ══════════════════════════════════════════════════════════════════ */}
        {showPresentation && !completed && hasPresentation && (
          <PresentationViewer
            slides={slides}
            pptxUrl={pptxUrl}
            title={activity.title}
            onContinue={() => setShowPresentation(false)}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            STEP 2 — EVALUATIVE ACTIVITY (per-subject)
        ══════════════════════════════════════════════════════════════════ */}
        {pastPresentation && (
          <AnimatePresence mode="wait">

            {/* ── COMPLETED SCREEN ─────────────────────────────────────── */}
            {completed && (
              <motion.div key="done"
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16"
              >
                <motion.div
                  animate={{ rotate: [0, 14, -14, 0] }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="text-8xl mb-6"
                >
                  {kind === "dibujo"            ? "🎨" :
                   kind === "video_upload"       ? "🎥" :
                   kind === "emparejar"          ? "🔗" :
                   kind === "ejercicio_archivo"  ? "📁" :
                   score !== null && score >= 4  ? "🎉" :
                   score !== null && score >= 3  ? "👏" : "💪"}
                </motion.div>
                <h2 className="text-2xl font-extrabold mb-3" style={{ color: "#34495E" }}>
                  {kind === "dibujo"           ? "¡Obra de arte guardada! 🌟" :
                   kind === "video_upload"      ? "¡Video entregado! 🎬" :
                   kind === "emparejar"         ? "¡Todo emparejado! 🔗" :
                   kind === "ejercicio_archivo" ? "¡Tarea entregada! 📚" :
                   score !== null && score >= 4 ? "¡Excelente trabajo!" :
                   score !== null && score >= 3 ? "¡Muy bien!" : "¡Buen esfuerzo!"}
                </h2>
                {/* Score for quiz/completar */}
                {score !== null && ["quiz", "completar"].includes(kind) && (
                  <div className="flex items-center justify-center gap-2 mb-8">
                    <span className="text-4xl font-extrabold" style={{ color: "#FFB37B" }}>{score}</span>
                    <span className="text-xl" style={{ color: "#a0aec0" }}>/ 5</span>
                  </div>
                )}
                {kind === "dibujo" && arteProgress > 0 && (
                  <p className="text-base mb-6 font-semibold" style={{ color: "#7f8c8d" }}>
                    Completaste el {arteProgress}% del lienzo 🖌️
                  </p>
                )}
                <motion.button
                  whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/estudiante")}
                  className="px-8 py-4 rounded-2xl font-extrabold text-white text-base"
                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
                >
                  <CheckCircle className="w-5 h-5 inline mr-2" />
                  Seguir aprendiendo
                </motion.button>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                ARTE → Canvas de dibujo
            ══════════════════════════════════════════════════════════════ */}
            {!completed && kind === "dibujo" && (
              <motion.div key="dibujo" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ArteCanvas
                  instruction={
                    (activity.content?.instruccion as string) ||
                    activity.description ||
                    "✏️ Dibuja lo que aprendiste en la presentación 🎨"
                  }
                  onProgress={(pct) => setArteProgress(pct)}
                  onComplete={(progress) => {
                    setArteProgress(progress);
                    finishActivity(Math.min(5, Math.round((progress / 20) * 10) / 10 + 1));
                  }}
                />
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                CIENCIAS SOCIALES → Subir video
            ══════════════════════════════════════════════════════════════ */}
            {!completed && kind === "video_upload" && (
              <motion.div key="video_upload" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <VideoUpload
                  instruccion={
                    (activity.content?.instruccion as string) ||
                    `Graba un video explicando lo que aprendiste sobre ${activity.title}`
                  }
                  puntosClave={(activity.content?.puntos_clave as string[]) || []}
                  onComplete={(nota) => finishActivity(nota)}
                />
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                INGLÉS / CIENCIAS NATURALES → Quiz selección múltiple
            ══════════════════════════════════════════════════════════════ */}
            {!completed && kind === "quiz" && questions[currentQuestion] && (
              <motion.div key={`q${currentQuestion}`}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3 }}
              >
                {/* ── Tarjeta de la pregunta ── */}
                <div
                  className="rounded-3xl p-6 mb-6 shadow-sm"
                  style={{
                    background:  isHighContrast ? "#1E293B" : "white",
                    border:      isHighContrast ? "2px solid #38BDF8" : "2px solid #E1EFFF",
                    boxShadow:   isHighContrast ? "0 0 24px rgba(56,189,248,0.15)" : "0 4px 20px rgba(127,179,213,0.12)",
                  }}
                >
                  <p className="text-kid-lg font-bold text-center"
                    style={{ color: isHighContrast ? "#F1F5F9" : "#34495E" }}>
                    {questions[currentQuestion].pregunta}
                  </p>
                  {showHint && questions[currentQuestion].pista && (
                    <motion.p
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="text-center mt-3 text-sm font-semibold"
                      style={{ color: isHighContrast ? "#7DD3FC" : "#7FB3D5" }}
                    >
                      💡 {questions[currentQuestion].pista}
                    </motion.p>
                  )}
                </div>

                {/* ── Opciones estilo Kahoot ── */}
                {/* Colores fijos por posición (como Kahoot): rojo, azul, amarillo, verde */}
                {(() => {
                  const OPTION_COLORS = isHighContrast
                    ? [
                        { bg: "#7F1D1D", border: "#F87171", text: "#FECACA", label: "#F87171" },
                        { bg: "#1E3A5F", border: "#60A5FA", text: "#BFDBFE", label: "#60A5FA" },
                        { bg: "#78350F", border: "#FCD34D", text: "#FEF3C7", label: "#FCD34D" },
                        { bg: "#14532D", border: "#4ADE80", text: "#DCFCE7", label: "#4ADE80" },
                      ]
                    : [
                        { bg: "#FFF1F2", border: "#FDA4AF", text: "#374151", label: "#E11D48" },
                        { bg: "#EFF6FF", border: "#93C5FD", text: "#374151", label: "#1D4ED8" },
                        { bg: "#FFFBEB", border: "#FCD34D", text: "#374151", label: "#D97706" },
                        { bg: "#F0FDF4", border: "#86EFAC", text: "#374151", label: "#16A34A" },
                      ];
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {questions[currentQuestion].opciones?.map((opt: string, i: number) => {
                        const isSel  = selectedAnswer === i;
                        const isCorr = i === questions[currentQuestion].respuesta_correcta;
                        const col    = OPTION_COLORS[i];

                        // Estilos según estado de feedback
                        let bg     = col.bg;
                        let border = col.border;
                        if (showFeedback && isSel && isCorr) {
                          bg = isHighContrast ? "#14532D" : "#DCFCE7";
                          border = "#22C55E";
                        } else if (showFeedback && isSel && !isCorr) {
                          bg = isHighContrast ? "#7F1D1D" : "#FEE2E2";
                          border = "#EF4444";
                        } else if (showFeedback && isCorr) {
                          bg = isHighContrast ? "#14532D" : "#DCFCE7";
                          border = "#22C55E";
                        }

                        return (
                          <motion.button key={i}
                            whileHover={!showFeedback ? { scale: 1.02, y: -2 } : {}}
                            whileTap={!showFeedback  ? { scale: 0.98 } : {}}
                            onClick={() => handleAnswer(i)}
                            disabled={showFeedback}
                            className="p-5 rounded-2xl border-2 text-left transition-all flex items-center gap-3"
                            style={{ background: bg, borderColor: border }}
                          >
                            {/* Letra (A B C D) */}
                            <span
                              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0"
                              style={{
                                background: border,
                                color: isHighContrast ? "#0F172A" : "white",
                              }}
                            >
                              {String.fromCharCode(65 + i)}
                            </span>
                            {/* Texto de la opción */}
                            <span
                              className="flex-1 text-kid-base font-semibold leading-snug"
                              style={{ color: isHighContrast ? col.text : "#374151" }}
                            >
                              {opt}
                            </span>
                            {/* Icono de feedback */}
                            {showFeedback && isSel && isCorr  && (
                              <span className="text-2xl flex-shrink-0">✅</span>
                            )}
                            {showFeedback && isSel && !isCorr && (
                              <span className="text-2xl flex-shrink-0">❌</span>
                            )}
                            {showFeedback && !isSel && isCorr && (
                              <span className="text-2xl flex-shrink-0">⭐</span>
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── Botones de ayuda ── */}
                <div className="flex justify-center gap-4 mt-6">
                  {!showHint && questions[currentQuestion].pista && (
                    <button onClick={() => setShowHint(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-colors"
                      style={{
                        color:      isHighContrast ? "#7DD3FC" : "#7f8c8d",
                        background: isHighContrast ? "rgba(56,189,248,0.10)" : "transparent",
                        border:     isHighContrast ? "1.5px solid rgba(56,189,248,0.30)" : "none",
                      }}
                    >
                      <HelpCircle className="w-5 h-5" />
                      Necesito una pista
                    </button>
                  )}
                  <button onClick={() => handleAnswer(-1)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-colors"
                    style={{
                      color:      isHighContrast ? "#94A3B8" : "#a0aec0",
                      background: isHighContrast ? "rgba(148,163,184,0.10)" : "transparent",
                      border:     isHighContrast ? "1.5px solid rgba(148,163,184,0.20)" : "none",
                    }}
                  >
                    <SkipForward className="w-5 h-5" />
                    Saltar
                  </button>
                </div>
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                LENGUAJE / ESPAÑOL → Emparejar conceptos
            ══════════════════════════════════════════════════════════════ */}
            {!completed && kind === "emparejar" && (
              <motion.div key="emparejar" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <EmparejarGame
                  pares={(activity.content?.pares as Par[]) || []}
                  onComplete={(nota) => finishActivity(nota)}
                />
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                MATEMÁTICAS → Ejercicios + subir archivo
            ══════════════════════════════════════════════════════════════ */}
            {!completed && kind === "ejercicio_archivo" && (
              <motion.div key="ejercicio_archivo" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <ArchivoUpload
                  ejercicios={(activity.content?.ejercicios as string[]) || []}
                  instruccion={
                    (activity.content?.instruccion as string) ||
                    "Resuelve los ejercicios en tu cuaderno y sube una foto o PDF con tus respuestas."
                  }
                  onComplete={(nota) => finishActivity(nota)}
                />
              </motion.div>
            )}

            {/* ══════════════════════════════════════════════════════════════
                FALLBACK — generic completion (shouldn't be needed after seed)
            ══════════════════════════════════════════════════════════════ */}
            {!completed &&
              !["dibujo","video_upload","quiz","emparejar","ejercicio_archivo"].includes(kind) && (
              <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="card-kid text-center py-10 max-w-2xl mx-auto"
              >
                <span className="text-5xl mb-4 block">{meta.emoji}</span>
                <p className="text-kid-lg text-gray-600 font-semibold mb-6">
                  {activity.description || "Completa esta actividad"}
                </p>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => finishActivity(5)}
                  className="px-8 py-4 rounded-2xl font-extrabold text-white text-base"
                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}
                >
                  Completar actividad ✅
                </motion.button>
              </motion.div>
            )}

          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
