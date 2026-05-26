"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { useSensoryProfile } from "@/hooks/useSensoryProfile";
import { api, type ActivityResponse } from "@/lib/api";
import { ArrowLeft, CheckCircle, HelpCircle, SkipForward } from "lucide-react";
import dynamic from "next/dynamic";

// Importaciones dinámicas para evitar SSR de componentes que usan APIs del navegador
const EmotionDetector      = dynamic(() => import("@/components/monitoring/EmotionDetector"),        { ssr: false });
const CalmingScreen        = dynamic(() => import("@/components/ui/CalmingScreen"),                  { ssr: false });
const ArteCanvas           = dynamic(() => import("@/components/activities/ArteCanvas"),             { ssr: false });
const PresentationViewer   = dynamic(() => import("@/components/student/PresentationViewer"),        { ssr: false });

function isArteActivity(activity: ActivityResponse): boolean {
  const tipo    = activity.content?.tipo as string | undefined;
  const title   = activity.title?.toLowerCase() || "";
  const actType = (activity.activity_type as string | undefined)?.toLowerCase() || "";
  return (
    tipo === "arte" ||
    title.includes("arte") || title.includes("dibujo") || title.includes("pintura") ||
    actType.includes("arte")
  );
}

export default function ActividadPage() {
  const router     = useRouter();
  const params     = useParams();
  const activityId = String(params.id);

  const { token, user, active_student_id, activeSession, _hasHydrated, setActiveSession } = useSessionStore();

  // Aplica el perfil sensorial del estudiante al documento (contraste, fuente, animaciones)
  useSensoryProfile(token, active_student_id);

  const [activity,         setActivity]         = useState<ActivityResponse | null>(null);
  const [activityRecordId, setActivityRecordId] = useState<string | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [completed,        setCompleted]        = useState(false);
  const [score,            setScore]            = useState<number | null>(null);
  const [showHint,         setShowHint]         = useState(false);
  const [showTemario,      setShowTemario]      = useState(true);

  // Estado del quiz
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer,  setSelectedAnswer]  = useState<number | null>(null);
  const [answers,         setAnswers]         = useState<number[]>([]);
  const [showFeedback,    setShowFeedback]    = useState(false);

  const [arteProgress,      setArteProgress]      = useState(0);
  const [showPresentation,  setShowPresentation]  = useState(true); // shown first if activity has a PPTX
  const startTimeRef = useRef(Date.now());

  const loadActivity = useCallback(async () => {
    if (!token || !activeSession || !active_student_id) return;
    try {
      const act = await api.getActivity(token, activityId);
      setActivity(act);
    } catch (err) {
      console.error("Error cargando actividad:", err);
      setLoading(false);
      return;
    }
    // startActivity es no-fatal: si falla igual se muestra la actividad
    try {
      const record = await api.startActivity(token, activeSession.id_session, {
        id_student:  active_student_id,
        id_activity: activityId,
      });
      setActivityRecordId(record.id_student_activity);
    } catch (err) {
      console.warn("No se pudo registrar inicio de actividad:", err);
    } finally {
      setLoading(false);
    }
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
        .then((s) => setActiveSession({ id_session: s.id_session, id_student: s.id_student, start_time: s.start_time }))
        .catch(async () => {
          // Si falla crear sesión, igual cargar la actividad sin tracking
          try {
            const act = await api.getActivity(token, activityId);
            setActivity(act);
          } catch {}
          setLoading(false);
        });
      return;
    }
    loadActivity();
  }, [_hasHydrated, token, user, active_student_id, activeSession, setActiveSession, router, loadActivity]);

  const finishActivity = useCallback(async (nota: number) => {
    if (!token || !activeSession || !activityRecordId) return;
    const tiempo = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await api.updateActivity(token, activeSession.id_session, activityRecordId, {
        score:             nota,
        is_completed:      true,
        time_spent_sec:    tiempo,
        achievement_level: nota >= 2 ? "completado" : "fallido",
      });
    } catch (err) {
      console.error("Error al finalizar actividad:", err);
    }
  }, [token, activeSession, activityRecordId]);

  const handleAnswer = async (answerIndex: number) => {
    if (showFeedback) return;
    setSelectedAnswer(answerIndex);
    setShowFeedback(true);
    const newAnswers = [...answers, answerIndex];
    setAnswers(newAnswers);

    setTimeout(() => {
      setShowFeedback(false);
      setSelectedAnswer(null);
      const questions = (activity?.content?.preguntas as QuizQuestion[]) || [];
      if (currentQuestion + 1 < questions.length) {
        setCurrentQuestion(currentQuestion + 1);
      } else {
        const correct = newAnswers.filter((a, i) => a === questions[i]?.respuesta_correcta).length;
        const nota = Math.round((correct / questions.length) * 5 * 10) / 10;
        setScore(nota);
        setCompleted(true);
        finishActivity(nota);
      }
    }, 1500);
  };

  if (!_hasHydrated || loading || !activity) {
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

  const questions = (activity.content?.preguntas as QuizQuestion[]) || [];
  const currentQ  = questions[currentQuestion];

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-blue via-white to-soft-purple student-shell">
      <CalmingScreen />
      <EmotionDetector active={!showPresentation && (!showTemario || !activity.content?.temario)} />

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push("/estudiante")}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Volver</span>
          </button>

          <h1 className="text-kid-base font-bold text-gray-700">{activity.title}</h1>

          {questions.length > 0 && !isArteActivity(activity) && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">{currentQuestion + 1}/{questions.length}</span>
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary-400 rounded-full"
                  animate={{ width: `${((currentQuestion + (completed ? 1 : 0)) / questions.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {isArteActivity(activity) && !completed && (
            <span className="text-sm font-semibold" style={{ color: "#7f8c8d" }}>🎨 {arteProgress}% pintado</span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* ── Paso 1: Presentación PPTX ── */}
        {showPresentation && !completed && activity.content?.presentacion_url && (
          <PresentationViewer
            url={activity.content.presentacion_url as string}
            title={activity.title}
            onContinue={() => setShowPresentation(false)}
          />
        )}

        {/* ── Paso 2: Temario de la lección ── */}
        {(!showPresentation || !activity.content?.presentacion_url) &&
          showTemario && !completed && activity.content?.temario && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-kid max-w-3xl mx-auto"
          >
            <div className="flex items-center gap-3 mb-5">
              <span className="text-3xl">📖</span>
              <div>
                <h2 className="text-kid-lg font-extrabold text-gray-700">Lección</h2>
                <p className="text-sm text-gray-400">{activity.title}</p>
              </div>
            </div>
            <div
              className="rounded-2xl p-5 mb-6 text-base leading-relaxed whitespace-pre-wrap"
              style={{ background: "#F0F7FB", color: "#34495E", border: "1.5px solid #D5DBDB" }}
            >
              {activity.content.temario as string}
            </div>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowTemario(false)}
              className="w-full py-4 rounded-2xl font-extrabold text-white text-base"
              style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
            >
              ¡Entendido, empezar actividad! 🚀
            </motion.button>
          </motion.div>
        )}

        {/* ── Paso 3: Actividad (oculta mientras haya presentación o temario pendiente) ── */}
        {(!showPresentation || !activity.content?.presentacion_url) &&
         (!showTemario || !activity.content?.temario) && (
          <>
            {completed ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="text-8xl mb-6"
                >
                  {isArteActivity(activity) ? "🎨" : (score !== null && score >= 4 ? "🎉" : score !== null && score >= 3 ? "👏" : "💪")}
                </motion.div>

                <h2 className="text-2xl font-extrabold mb-3" style={{ color: "#34495E" }}>
                  {isArteActivity(activity)
                    ? "¡Obra de arte guardada! 🌟"
                    : score !== null && score >= 4 ? "¡Excelente trabajo!" : score !== null && score >= 3 ? "¡Muy bien!" : "¡Buen esfuerzo!"}
                </h2>

                {isArteActivity(activity) && arteProgress > 0 && (
                  <p className="text-base mb-4 font-semibold" style={{ color: "#7f8c8d" }}>
                    Completaste el {arteProgress}% del lienzo 🖌️
                  </p>
                )}

                {score !== null && !isArteActivity(activity) && (
                  <div className="flex items-center justify-center gap-2 mb-8">
                    <span className="text-3xl font-extrabold" style={{ color: "#FFB37B" }}>{score}</span>
                    <span className="text-xl" style={{ color: "#a0aec0" }}>/ 5</span>
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/estudiante")}
                  className="px-8 py-4 rounded-2xl font-extrabold text-white text-base"
                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
                >
                  <CheckCircle className="w-5 h-5 inline mr-2" />
                  Seguir aprendiendo
                </motion.button>
              </motion.div>

            ) : isArteActivity(activity) ? (
              <ArteCanvas
                instruction={activity.description || activity.content?.instruccion || "Dibuja libremente lo que sientes hoy 🎨"}
                onProgress={(pct) => setArteProgress(pct)}
                onComplete={(progress) => {
                  const nota = Math.min(5, Math.round((progress / 20) * 10) / 10 + 1);
                  setScore(nota);
                  setArteProgress(progress);
                  setCompleted(true);
                  finishActivity(nota);
                }}
              />

            ) : questions.length > 0 && currentQ ? (
              <motion.div
                key={currentQuestion}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="card-kid mb-6">
                  <p className="text-kid-lg font-bold text-gray-700 text-center">{currentQ.pregunta}</p>
                  {showHint && currentQ.pista && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center text-primary-500 mt-3 text-sm"
                    >
                      💡 {currentQ.pista}
                    </motion.p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentQ.opciones?.map((option: string, index: number) => {
                    const isSelected = selectedAnswer === index;
                    const isCorrect  = index === currentQ.respuesta_correcta;
                    let bgClass = "bg-white border-gray-200 hover:border-primary-300 hover:bg-primary-50";
                    if (showFeedback && isSelected && isCorrect)  bgClass = "bg-green-50 border-green-400";
                    else if (showFeedback && isSelected && !isCorrect) bgClass = "bg-red-50 border-red-400";
                    else if (showFeedback && isCorrect) bgClass = "bg-green-50 border-green-300";

                    return (
                      <motion.button
                        key={index}
                        whileHover={!showFeedback ? { scale: 1.02 } : {}}
                        whileTap={!showFeedback ? { scale: 0.98 } : {}}
                        onClick={() => handleAnswer(index)}
                        disabled={showFeedback}
                        className={`p-6 rounded-kid-lg border-2 text-left text-kid-base font-semibold text-gray-700 transition-all ${bgClass}`}
                      >
                        <span className="inline-block w-8 h-8 rounded-full bg-gray-100 text-center text-sm leading-8 mr-3 font-bold">
                          {String.fromCharCode(65 + index)}
                        </span>
                        {option}
                        {showFeedback && isSelected && isCorrect  && <span className="float-right text-green-500 text-2xl">✓</span>}
                        {showFeedback && isSelected && !isCorrect && <span className="float-right text-red-500 text-2xl">✗</span>}
                      </motion.button>
                    );
                  })}
                </div>

                <div className="flex justify-center gap-4 mt-8">
                  {!showHint && currentQ.pista && (
                    <button
                      onClick={() => setShowHint(true)}
                      className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-primary-500 transition-colors"
                    >
                      <HelpCircle className="w-5 h-5" />
                      <span className="text-sm font-semibold">Necesito una pista</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleAnswer(-1)}
                    className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                    <span className="text-sm font-semibold">Saltar</span>
                  </button>
                </div>
              </motion.div>

            ) : (
              <div className="card-kid text-center py-12">
                <p className="text-kid-lg text-gray-500 mb-6">
                  {activity.description || "Actividad en preparación"}
                </p>
                <button
                  onClick={() => { setCompleted(true); setScore(5); finishActivity(5); }}
                  className="btn-kid-primary"
                >
                  Completar actividad
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

interface QuizQuestion {
  pregunta: string;
  opciones: string[];
  respuesta_correcta: number;
  pista?: string;
}
