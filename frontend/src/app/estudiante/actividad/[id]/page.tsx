"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams }     from "next/navigation";
import { motion, AnimatePresence }  from "framer-motion";
import { useSessionStore }          from "@/store/sessionStore";
import { useSensoryProfile }        from "@/hooks/useSensoryProfile";
import { api, type ActivityResponse } from "@/lib/api";
import {
  ArrowLeft, CheckCircle, HelpCircle,
  SkipForward, Search, Play,
} from "lucide-react";
import dynamic from "next/dynamic";

const EmotionDetector    = dynamic(() => import("@/components/monitoring/EmotionDetector"),    { ssr: false });
const CalmingScreen      = dynamic(() => import("@/components/ui/CalmingScreen"),              { ssr: false });
const ArteCanvas         = dynamic(() => import("@/components/activities/ArteCanvas"),         { ssr: false });
const PresentationViewer = dynamic(() => import("@/components/student/PresentationViewer"),    { ssr: false });

// ── Tipos ───────────────────────────────────────────────────────────────────────
interface QuizQuestion {
  pregunta:           string;
  opciones:           string[];
  respuesta_correcta: number;
  pista?:             string;
}
interface SlideData { num: number; titulo: string; puntos: string[] }
interface Par       { a: string; b: string }
interface Oracion   { texto: string; respuesta: string }

// ── Detectar qué tipo de actividad mostrar ────────────────────────────────────
function getKind(activity: ActivityResponse): string {
  const c     = activity.content || {};
  const t     = (activity.activity_type as string || "").toLowerCase();
  const title = (activity.title || "").toLowerCase();

  if (c.instruccion)                                         return "dibujo";
  if (c.preguntas)                                           return "quiz";
  if (c.oraciones)                                           return "completar";
  if (c.texto)                                               return "lectura";
  if ("busqueda_sugerida" in c || c.video_url !== undefined) return "video";
  if (c.enunciado)                                           return "ejercicio";
  if (c.pares || c.elementos)                                return "pares";

  if (t.includes("dibujo") || t.includes("arte"))            return "dibujo";
  if (t.includes("quiz"))                                    return "quiz";
  if (t.includes("completar"))                               return "completar";
  if (t.includes("lectura"))                                 return "lectura";
  if (t.includes("video"))                                   return "video";
  if (t.includes("ejercicio"))                               return "ejercicio";
  if (t.includes("memoria") || t.includes("asociar") || t.includes("arrastrar")) return "pares";

  if (title.includes("arte") || title.includes("dibujo") || title.includes("pintura")) return "dibujo";
  return "generico";
}

// ── Pantalla de carga ─────────────────────────────────────────────────────────
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

// ── Página ────────────────────────────────────────────────────────────────────
export default function ActividadPage() {
  const router     = useRouter();
  const params     = useParams();
  const activityId = String(params.id);

  const { token, user, active_student_id, activeSession, _hasHydrated, setActiveSession } =
    useSessionStore();
  useSensoryProfile(token, active_student_id);

  // ── Estado general ───────────────────────────────────────────────────────
  const [activity,         setActivity]         = useState<ActivityResponse | null>(null);
  const [activityRecordId, setActivityRecordId] = useState<string | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [completed,        setCompleted]        = useState(false);
  const [score,            setScore]            = useState<number | null>(null);

  // Presentación
  const [showPresentation, setShowPresentation] = useState(true);

  // Quiz
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer,  setSelectedAnswer]  = useState<number | null>(null);
  const [answers,         setAnswers]         = useState<number[]>([]);
  const [showFeedback,    setShowFeedback]    = useState(false);
  const [showHint,        setShowHint]        = useState(false);

  // Dibujo / Arte
  const [arteProgress, setArteProgress] = useState(0);

  // Completar (rellenar huecos)
  const [completarInputs,    setCompletarInputs]    = useState<string[]>([]);
  const [completarSubmitted, setCompletarSubmitted] = useState(false);

  // Texto libre (lectura, ejercicio, video)
  const [textRespuesta, setTextRespuesta] = useState("");

  const startTimeRef = useRef(Date.now());

  // ── Carga actividad ───────────────────────────────────────────────────────
  const loadActivity = useCallback(async () => {
    if (!token || !activeSession || !active_student_id) return;
    try {
      const act = await api.getActivity(token, activityId);
      setActivity(act);
      const ors = (act.content?.oraciones as Oracion[]) || [];
      setCompletarInputs(ors.map(() => ""));
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
    } catch { /* no-fatal */ }
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
          try {
            const act = await api.getActivity(token, activityId);
            setActivity(act);
            const ors = (act.content?.oraciones as Oracion[]) || [];
            setCompletarInputs(ors.map(() => ""));
          } catch {}
          setLoading(false);
        });
      return;
    }
    loadActivity();
  }, [_hasHydrated, token, user, active_student_id, activeSession, setActiveSession, router, loadActivity]);

  // ── Finalizar ─────────────────────────────────────────────────────────────
  const finishActivity = useCallback(async (nota: number) => {
    setScore(nota);
    setCompleted(true);
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
  }, [token, activeSession, activityRecordId]);

  // ── Quiz handler ──────────────────────────────────────────────────────────
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
      const questions = (activity?.content?.preguntas as QuizQuestion[]) || [];
      if (currentQuestion + 1 < questions.length) {
        setCurrentQuestion((q) => q + 1);
      } else {
        const correct = newAns.filter((a, i) => a === questions[i]?.respuesta_correcta).length;
        finishActivity(Math.round((correct / questions.length) * 5 * 10) / 10);
      }
    }, 1500);
  };

  // ── Completar handler ─────────────────────────────────────────────────────
  const handleCompletarSubmit = () => {
    const ors = (activity?.content?.oraciones as Oracion[]) || [];
    const ok  = completarInputs.filter((v, i) =>
      v.toLowerCase().trim() === (ors[i]?.respuesta || "").toLowerCase().trim()
    ).length;
    setCompletarSubmitted(true);
    setTimeout(
      () => finishActivity(ors.length > 0 ? Math.round((ok / ors.length) * 5 * 10) / 10 : 5),
      1800,
    );
  };

  if (!_hasHydrated || loading || !activity) return <LoadingScreen />;

  const slides    = (activity.content?.slides as SlideData[]) || [];
  const hasSlides = slides.length > 0;
  const kind      = getKind(activity);
  const questions = (activity.content?.preguntas as QuizQuestion[]) || [];
  const oraciones = (activity.content?.oraciones as Oracion[])      || [];
  const pares     = (activity.content?.pares     as Par[])          || [];

  // ¿Ya pasó la pantalla de presentación?
  const pastPresentation = !showPresentation || !hasSlides;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-blue via-white to-soft-purple student-shell">
      <CalmingScreen />

      {/*
        ⚡ Monitoreo emocional activo desde el primer segundo
           (incluye mientras el niño ve la presentación)
      */}
      <EmotionDetector active={!completed} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-2">
          <button
            onClick={() => router.push("/estudiante")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold hidden sm:inline">Volver</span>
          </button>

          <h1 className="text-kid-base font-bold text-gray-700 text-center truncate flex-1">
            {activity.title}
          </h1>

          {/* Indicador de diapositivas */}
          {!pastPresentation && (
            <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full flex-shrink-0">
              📊 {slides.length} diap.
            </span>
          )}

          {/* Progreso quiz */}
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

          {/* Progreso dibujo */}
          {kind === "dibujo" && pastPresentation && !completed && (
            <span className="text-sm font-semibold flex-shrink-0" style={{ color: "#7f8c8d" }}>
              🎨 {arteProgress}%
            </span>
          )}
        </div>
      </header>

      {/* ── Contenido ────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* ══ PASO 1: Presentación PPTX (diapositivas en JSON) ══ */}
        {showPresentation && !completed && hasSlides && (
          <PresentationViewer
            slides={slides}
            title={activity.title}
            onContinue={() => setShowPresentation(false)}
          />
        )}

        {/* ══ PASO 2: Actividad evaluativa ══ */}
        {pastPresentation && (
          <AnimatePresence mode="wait">

            {/* ── COMPLETADA ─────────────────────────────────────────────── */}
            {completed && (
              <motion.div key="done"
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <motion.div
                  animate={{ rotate: [0, 12, -12, 0] }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="text-8xl mb-5"
                >
                  {kind === "dibujo"  ? "🎨" :
                   kind === "lectura" ? "📖" :
                   kind === "video"   ? "🎬" :
                   score !== null && score >= 4 ? "🎉" :
                   score !== null && score >= 3 ? "👏" : "💪"}
                </motion.div>
                <h2 className="text-2xl font-extrabold mb-3" style={{ color: "#34495E" }}>
                  {kind === "dibujo" ? "¡Obra de arte guardada! 🌟" :
                   score !== null && score >= 4 ? "¡Excelente trabajo!" :
                   score !== null && score >= 3 ? "¡Muy bien!" : "¡Buen esfuerzo!"}
                </h2>
                {score !== null && !["dibujo","lectura","ejercicio","video","pares","generico"].includes(kind) && (
                  <div className="flex items-center justify-center gap-2 mb-6">
                    <span className="text-4xl font-extrabold" style={{ color: "#FFB37B" }}>{score}</span>
                    <span className="text-xl" style={{ color: "#a0aec0" }}>/ 5</span>
                  </div>
                )}
                {kind === "dibujo" && arteProgress > 0 && (
                  <p className="text-base mb-4 font-semibold" style={{ color: "#7f8c8d" }}>
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

            {/* ── QUIZ ───────────────────────────────────────────────────── */}
            {!completed && kind === "quiz" && questions[currentQuestion] && (
              <motion.div key={`q${currentQuestion}`}
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}  transition={{ duration: 0.3 }}
              >
                <div className="card-kid mb-6">
                  <p className="text-kid-lg font-bold text-gray-700 text-center">
                    {questions[currentQuestion].pregunta}
                  </p>
                  {showHint && questions[currentQuestion].pista && (
                    <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="text-center text-primary-500 mt-3 text-sm"
                    >
                      💡 {questions[currentQuestion].pista}
                    </motion.p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {questions[currentQuestion].opciones?.map((opt: string, i: number) => {
                    const isSelected = selectedAnswer === i;
                    const isCorrect  = i === questions[currentQuestion].respuesta_correcta;
                    let cls = "bg-white border-gray-200 hover:border-primary-300 hover:bg-primary-50";
                    if (showFeedback && isSelected && isCorrect)   cls = "bg-green-50 border-green-400";
                    else if (showFeedback && isSelected)           cls = "bg-red-50 border-red-400";
                    else if (showFeedback && isCorrect)            cls = "bg-green-50 border-green-300";
                    return (
                      <motion.button key={i}
                        whileHover={!showFeedback ? { scale: 1.02 } : {}}
                        whileTap={!showFeedback  ? { scale: 0.98 } : {}}
                        onClick={() => handleAnswer(i)}
                        disabled={showFeedback}
                        className={`p-5 rounded-kid-lg border-2 text-left text-kid-base font-semibold text-gray-700 transition-all ${cls}`}
                      >
                        <span className="inline-block w-8 h-8 rounded-full bg-gray-100 text-center text-sm leading-8 mr-2 font-bold">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                        {showFeedback && isSelected && isCorrect  && <span className="float-right text-green-500 text-2xl">✓</span>}
                        {showFeedback && isSelected && !isCorrect && <span className="float-right text-red-500 text-2xl">✗</span>}
                      </motion.button>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-4 mt-6">
                  {!showHint && questions[currentQuestion].pista && (
                    <button onClick={() => setShowHint(true)}
                      className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-primary-500 transition-colors"
                    >
                      <HelpCircle className="w-5 h-5" />
                      <span className="text-sm font-semibold">Necesito una pista</span>
                    </button>
                  )}
                  <button onClick={() => handleAnswer(-1)}
                    className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                    <span className="text-sm font-semibold">Saltar</span>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── DIBUJO ─────────────────────────────────────────────────── */}
            {!completed && kind === "dibujo" && (
              <motion.div key="dibujo" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <ArteCanvas
                  instruction={
                    (activity.content?.instruccion as string) ||
                    activity.description ||
                    "✏️ Dibuja lo que aprendiste hoy 🎨"
                  }
                  onProgress={(pct) => setArteProgress(pct)}
                  onComplete={(progress) => {
                    setArteProgress(progress);
                    finishActivity(Math.min(5, Math.round((progress / 20) * 10) / 10 + 1));
                  }}
                />
              </motion.div>
            )}

            {/* ── LECTURA ────────────────────────────────────────────────── */}
            {!completed && kind === "lectura" && (
              <motion.div key="lectura" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto"
              >
                <div className="card-kid mb-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl">📖</span>
                    <h2 className="text-kid-lg font-extrabold text-gray-700">Lee con atención</h2>
                  </div>
                  <div
                    className="rounded-2xl p-5 whitespace-pre-wrap text-base leading-relaxed"
                    style={{ background: "#F0F7FB", color: "#34495E", border: "1.5px solid #D5DBDB" }}
                  >
                    {activity.content?.texto as string}
                  </div>
                </div>

                {activity.content?.pregunta_reflexion && (
                  <div className="card-kid">
                    <p className="font-bold text-gray-700 mb-3 text-base">
                      💬 {activity.content.pregunta_reflexion as string}
                    </p>
                    <textarea
                      value={textRespuesta}
                      onChange={(e) => setTextRespuesta(e.target.value)}
                      rows={4}
                      placeholder="Escribe tu reflexión aquí..."
                      className="w-full rounded-2xl border-2 border-gray-200 p-4 text-base focus:border-primary-300 focus:outline-none resize-none"
                    />
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={() => finishActivity(5)}
                      disabled={textRespuesta.trim().length < 3}
                      className="w-full mt-4 py-4 rounded-2xl font-extrabold text-white text-base disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
                    >
                      Entregar reflexión 📝
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── COMPLETAR (rellena los huecos) ─────────────────────────── */}
            {!completed && kind === "completar" && (
              <motion.div key="completar" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto"
              >
                <div className="card-kid mb-5">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-4xl">✍️</span>
                    <h2 className="text-kid-lg font-extrabold text-gray-700">Completa las oraciones</h2>
                  </div>
                  <div className="space-y-4">
                    {oraciones.map((o, i) => (
                      <div key={i} className="rounded-2xl p-4 border-2 border-gray-100 bg-gray-50">
                        <p className="text-base font-semibold text-gray-600 mb-2">{o.texto}</p>
                        <input
                          type="text"
                          value={completarInputs[i] || ""}
                          onChange={(e) => {
                            const next = [...completarInputs];
                            next[i] = e.target.value;
                            setCompletarInputs(next);
                          }}
                          disabled={completarSubmitted}
                          placeholder="Tu respuesta..."
                          className={`w-full rounded-xl border-2 px-4 py-2 text-base font-medium focus:outline-none transition-colors ${
                            completarSubmitted
                              ? completarInputs[i]?.toLowerCase().trim() === o.respuesta.toLowerCase().trim()
                                ? "border-green-400 bg-green-50 text-green-700"
                                : "border-red-400   bg-red-50   text-red-600"
                              : "border-gray-200 focus:border-primary-300"
                          }`}
                        />
                        {completarSubmitted && (
                          <p className="text-xs mt-1 font-semibold"
                            style={{
                              color: completarInputs[i]?.toLowerCase().trim() === o.respuesta.toLowerCase().trim()
                                ? "#16a34a" : "#dc2626"
                            }}
                          >
                            {completarInputs[i]?.toLowerCase().trim() === o.respuesta.toLowerCase().trim()
                              ? "✓ ¡Correcto!"
                              : `✗ Era: "${o.respuesta}"`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {!completarSubmitted && (
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleCompletarSubmit}
                    disabled={completarInputs.some((v) => !v?.trim())}
                    className="w-full py-4 rounded-2xl font-extrabold text-white text-base disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
                  >
                    Revisar respuestas ✔️
                  </motion.button>
                )}
              </motion.div>
            )}

            {/* ── EJERCICIO (respuesta escrita) ───────────────────────────── */}
            {!completed && kind === "ejercicio" && (
              <motion.div key="ejercicio" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto"
              >
                <div className="card-kid mb-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl">📝</span>
                    <h2 className="text-kid-lg font-extrabold text-gray-700">Tu ejercicio</h2>
                  </div>
                  <div
                    className="rounded-2xl p-5 mb-4 whitespace-pre-wrap text-base leading-relaxed font-medium"
                    style={{ background: "#FFF8F0", color: "#34495E", border: "1.5px solid #FFD9A0" }}
                  >
                    {activity.content?.enunciado as string}
                  </div>
                  <textarea
                    value={textRespuesta}
                    onChange={(e) => setTextRespuesta(e.target.value)}
                    rows={5}
                    placeholder="Escribe tu respuesta aquí..."
                    className="w-full rounded-2xl border-2 border-gray-200 p-4 text-base focus:border-primary-300 focus:outline-none resize-none"
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => finishActivity(5)}
                  disabled={textRespuesta.trim().length < 5}
                  className="w-full py-4 rounded-2xl font-extrabold text-white text-base disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
                >
                  Entregar ejercicio 🚀
                </motion.button>
              </motion.div>
            )}

            {/* ── VIDEO ──────────────────────────────────────────────────── */}
            {!completed && kind === "video" && (
              <motion.div key="video" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto"
              >
                <div className="card-kid mb-5">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-4xl">🎬</span>
                    <h2 className="text-kid-lg font-extrabold text-gray-700">Actividad de video</h2>
                  </div>
                  {activity.content?.instruccion && (
                    <p className="text-base font-semibold text-gray-600 mb-4">
                      {activity.content.instruccion as string}
                    </p>
                  )}
                  {activity.content?.video_url ? (
                    <div className="rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
                      <iframe
                        src={activity.content.video_url as string}
                        className="w-full h-full"
                        allowFullScreen style={{ border: "none" }}
                      />
                    </div>
                  ) : activity.content?.busqueda_sugerida ? (
                    <div className="rounded-2xl p-5 text-center border-2 border-dashed border-blue-200 bg-blue-50">
                      <Play className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm font-semibold mb-3">
                        Busca este video con ayuda de un adulto:
                      </p>
                      <p className="bg-white rounded-xl px-4 py-3 font-bold text-gray-700 text-base mb-4 border border-blue-100">
                        🔍 {activity.content.busqueda_sugerida as string}
                      </p>
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(activity.content.busqueda_sugerida as string)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white text-sm"
                        style={{ background: "#FF0000" }}
                      >
                        <Search className="w-4 h-4" />
                        Buscar en YouTube
                      </a>
                    </div>
                  ) : null}
                  <textarea
                    value={textRespuesta}
                    onChange={(e) => setTextRespuesta(e.target.value)}
                    rows={3}
                    placeholder="¿Qué aprendiste con el video?"
                    className="w-full mt-4 rounded-2xl border-2 border-gray-200 p-4 text-base focus:border-primary-300 focus:outline-none resize-none"
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => finishActivity(5)}
                  disabled={textRespuesta.trim().length < 3}
                  className="w-full py-4 rounded-2xl font-extrabold text-white text-base disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
                >
                  Ya vi el video 🎬
                </motion.button>
              </motion.div>
            )}

            {/* ── PARES (memoria / asociar) ───────────────────────────────── */}
            {!completed && kind === "pares" && (
              <motion.div key="pares" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl mx-auto"
              >
                <div className="card-kid mb-5">
                  <div className="flex items-center gap-3 mb-5">
                    <span className="text-4xl">🧩</span>
                    <h2 className="text-kid-lg font-extrabold text-gray-700">Relaciona los conceptos</h2>
                  </div>
                  <div className="space-y-3">
                    {pares.map((par, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="flex-1 rounded-xl bg-purple-50 border border-purple-200 p-3 text-sm font-semibold text-purple-700 text-center">
                          {par.a}
                        </div>
                        <span className="text-gray-400 font-bold text-lg">↔</span>
                        <div className="flex-1 rounded-xl bg-orange-50 border border-orange-200 p-3 text-sm font-semibold text-orange-700 text-center">
                          {par.b}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 text-center mt-4">
                    Estudia los pares de conceptos y sus relaciones
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => finishActivity(5)}
                  className="w-full py-4 rounded-2xl font-extrabold text-white text-base"
                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
                >
                  ¡Ya los memoricé! 🧠
                </motion.button>
              </motion.div>
            )}

            {/* ── GENÉRICO ───────────────────────────────────────────────── */}
            {!completed && kind === "generico" && (
              <motion.div key="gen" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="card-kid text-center py-10 max-w-2xl mx-auto"
              >
                <span className="text-6xl mb-4 block">⭐</span>
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
