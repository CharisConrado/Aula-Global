"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api, type ActivityResponse } from "@/lib/api";
import EmotionDetector from "@/components/monitoring/EmotionDetector";
import CalmingScreen from "@/components/ui/CalmingScreen";
import { ArrowLeft, CheckCircle, HelpCircle, SkipForward } from "lucide-react";

/**
 * Player de actividades para el estudiante.
 * Renderiza distintos tipos de actividad: quiz, arrastrar, completar, etc.
 * Integra el detector de emociones MediaPipe y WebSocket de monitoreo.
 */
export default function ActividadPage() {
  const router = useRouter();
  const params = useParams();
  const activityId = Number(params.id);

  const { token, user, activeSession, showCalmingScreen } = useSessionStore();

  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [activityRecordId, setActivityRecordId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Estado del quiz
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);

  const startTimeRef = useRef(Date.now());

  const loadActivity = useCallback(async () => {
    if (!token || !activeSession) return;
    try {
      const act = await api.getActivity(token, activityId);
      setActivity(act);

      // Iniciar registro de la actividad en la sesión
      const record = await api.startActivity(token, activeSession.id, {
        session_id: activeSession.id,
        activity_id: activityId,
        student_id: activeSession.student_id,
      });
      setActivityRecordId(record.id);
    } catch (err) {
      console.error("Error cargando actividad:", err);
    } finally {
      setLoading(false);
    }
  }, [token, activeSession, activityId]);

  useEffect(() => {
    if (!token || !user || user.rol !== "estudiante") {
      router.replace("/login");
      return;
    }
    if (!activeSession) {
      router.replace("/estudiante");
      return;
    }
    loadActivity();
  }, [token, user, activeSession, router, loadActivity]);

  const handleAnswer = async (answerIndex: number) => {
    if (showFeedback) return;
    setSelectedAnswer(answerIndex);
    setShowFeedback(true);

    const newAnswers = [...answers, answerIndex];
    setAnswers(newAnswers);

    // Esperar 1.5 segundos mostrando retroalimentación
    setTimeout(() => {
      setShowFeedback(false);
      setSelectedAnswer(null);

      const content = activity?.contenido_json;
      const questions = (content?.preguntas as QuizQuestion[]) || [];

      if (currentQuestion + 1 < questions.length) {
        setCurrentQuestion(currentQuestion + 1);
      } else {
        // Actividad completada — calcular nota
        const correct = newAnswers.filter(
          (a, i) => a === questions[i]?.respuesta_correcta
        ).length;
        const nota = Math.round((correct / questions.length) * 5 * 10) / 10;
        setScore(nota);
        setCompleted(true);
        finishActivity(nota);
      }
    }, 1500);
  };

  const finishActivity = async (nota: number) => {
    if (!token || !activeSession || !activityRecordId) return;
    const tiempo = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      await api.updateActivity(token, activeSession.id, activityRecordId, {
        nota,
        completada: true,
        tiempo_dedicado: tiempo,
      });
    } catch (err) {
      console.error("Error al finalizar actividad:", err);
    }
  };

  if (loading || !activity) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-blue to-soft-green">
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

  const content = activity.contenido_json;
  const questions = (content?.preguntas as QuizQuestion[]) || [];
  const currentQ = questions[currentQuestion];

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-blue via-white to-soft-purple">
      <CalmingScreen />

      {/* Detector de emociones (invisible, corre en background) */}
      <EmotionDetector />

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

          <h1 className="text-kid-base font-bold text-gray-700">
            {activity.titulo}
          </h1>

          {/* Barra de progreso */}
          {questions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">
                {currentQuestion + 1}/{questions.length}
              </span>
              <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary-400 rounded-full"
                  animate={{
                    width: `${
                      ((currentQuestion + (completed ? 1 : 0)) /
                        questions.length) *
                      100
                    }%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Pantalla de actividad completada */}
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
              {score !== null && score >= 4
                ? "🎉"
                : score !== null && score >= 3
                ? "👏"
                : "💪"}
            </motion.div>

            <h2 className="text-kid-2xl font-bold text-gray-700 mb-4">
              {score !== null && score >= 4
                ? "¡Excelente trabajo!"
                : score !== null && score >= 3
                ? "¡Muy bien!"
                : "¡Buen esfuerzo!"}
            </h2>

            {score !== null && (
              <div className="flex items-center justify-center gap-2 mb-8">
                <span className="text-kid-xl font-bold text-warm-500">
                  {score}
                </span>
                <span className="text-kid-base text-gray-400">/ 5</span>
              </div>
            )}

            <div className="flex gap-4 justify-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push("/estudiante")}
                className="btn-kid-primary"
              >
                <CheckCircle className="w-6 h-6 inline mr-2" />
                Seguir aprendiendo
              </motion.button>
            </div>
          </motion.div>
        ) : questions.length > 0 && currentQ ? (
          /* Renderizar quiz */
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Pregunta */}
            <div className="card-kid mb-6">
              <p className="text-kid-lg font-bold text-gray-700 text-center">
                {currentQ.pregunta}
              </p>

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

            {/* Opciones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentQ.opciones?.map((option: string, index: number) => {
                const isSelected = selectedAnswer === index;
                const isCorrect = index === currentQ.respuesta_correcta;
                const showResult = showFeedback;

                let bgClass = "bg-white border-gray-200 hover:border-primary-300 hover:bg-primary-50";
                if (showResult && isSelected && isCorrect) {
                  bgClass = "bg-green-50 border-green-400";
                } else if (showResult && isSelected && !isCorrect) {
                  bgClass = "bg-red-50 border-red-400";
                } else if (showResult && isCorrect) {
                  bgClass = "bg-green-50 border-green-300";
                }

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

                    {showResult && isSelected && isCorrect && (
                      <span className="float-right text-green-500 text-2xl">
                        ✓
                      </span>
                    )}
                    {showResult && isSelected && !isCorrect && (
                      <span className="float-right text-red-500 text-2xl">
                        ✗
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Botones de ayuda */}
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
          /* Actividad sin contenido de quiz — mostrar contenido genérico */
          <div className="card-kid text-center py-12">
            <p className="text-kid-lg text-gray-500 mb-6">
              {activity.descripcion || "Actividad en preparación"}
            </p>
            <button
              onClick={() => {
                setCompleted(true);
                setScore(5);
                finishActivity(5);
              }}
              className="btn-kid-primary"
            >
              Completar actividad
            </button>
          </div>
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
