"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api, type ActivityResponse, type SubjectResponse } from "@/lib/api";
import CalmingScreen from "@/components/ui/CalmingScreen";
import { BookOpen, Star, LogOut, Play } from "lucide-react";

/**
 * Interfaz principal del estudiante.
 * Diseño amigable para niños con TDAH/TEA:
 * - Colores suaves, tipografía grande
 * - Botones grandes con iconos
 * - Instrucciones simples
 * - Sin distracciones
 */
export default function EstudiantePage() {
  const router = useRouter();
  const { token, user, activeSession, setActiveSession, logout } =
    useSessionStore();

  const [subjects, setSubjects] = useState<SubjectResponse[]>([]);
  const [activities, setActivities] = useState<ActivityResponse[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [studentName, setStudentName] = useState("");

  const loadData = useCallback(async () => {
    if (!token || !user) return;
    try {
      // Obtener datos del estudiante
      const student = await api.getStudent(token, user.user_id);
      setStudentName(student.nombre);

      // Obtener materias del grado del estudiante
      const subs = await api.getSubjects({
        degree_id: String(student.grado_id),
      });
      setSubjects(subs);

      // Crear o continuar sesión
      if (!activeSession) {
        const session = await api.createSession(token, user.user_id);
        setActiveSession({
          id: session.id,
          student_id: session.student_id,
          fecha_inicio: session.fecha_inicio,
        });
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setLoading(false);
    }
  }, [token, user, activeSession, setActiveSession]);

  useEffect(() => {
    if (!token || !user || user.rol !== "estudiante") {
      router.replace("/login");
      return;
    }
    loadData();
  }, [token, user, router, loadData]);

  const loadActivities = async (subjectId: number) => {
    if (!token) return;
    setSelectedSubject(subjectId);
    try {
      const acts = await api.getActivities(token, {
        subject_id: String(subjectId),
      });
      setActivities(acts);
    } catch (err) {
      console.error("Error cargando actividades:", err);
    }
  };

  const handleLogout = async () => {
    if (activeSession && token) {
      try {
        await api.closeSession(token, activeSession.id, {});
      } catch {
        // Continuar con logout incluso si falla cerrar sesión
      }
    }
    setActiveSession(null);
    logout();
    router.replace("/login");
  };

  const subjectColors = [
    "from-blue-100 to-blue-200 border-blue-300",
    "from-green-100 to-green-200 border-green-300",
    "from-purple-100 to-purple-200 border-purple-300",
    "from-orange-100 to-orange-200 border-orange-300",
    "from-pink-100 to-pink-200 border-pink-300",
    "from-teal-100 to-teal-200 border-teal-300",
  ];

  const subjectIcons = ["📚", "🔢", "🌍", "🎨", "🔬", "🎵"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-soft-blue to-soft-green">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-center"
        >
          <p className="text-kid-xl font-bold text-primary-600">Cargando...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-soft-blue via-white to-soft-green">
      <CalmingScreen />

      {/* Header simple */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Star className="w-8 h-8 text-warm-400" />
            <div>
              <h1 className="text-kid-lg font-bold text-gray-700">
                ¡Hola, {studentName}!
              </h1>
              <p className="text-sm text-gray-400">
                ¿Qué quieres aprender hoy?
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-gray-600 transition-colors rounded-kid hover:bg-gray-100"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Salir</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Si no hay materia seleccionada, mostrar materias */}
        {!selectedSubject ? (
          <section>
            <h2 className="text-kid-xl font-bold text-gray-700 mb-6 text-center">
              Elige una materia
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {subjects.map((subject, index) => (
                <motion.button
                  key={subject.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => loadActivities(subject.id)}
                  className={`p-8 rounded-kid-lg border-2 bg-gradient-to-br ${
                    subjectColors[index % subjectColors.length]
                  } text-left transition-shadow hover:shadow-lg`}
                >
                  <span className="text-4xl block mb-3">
                    {subjectIcons[index % subjectIcons.length]}
                  </span>
                  <h3 className="text-kid-lg font-bold text-gray-700">
                    {subject.name}
                  </h3>
                  {subject.description && (
                    <p className="text-sm text-gray-500 mt-1">
                      {subject.description}
                    </p>
                  )}
                </motion.button>
              ))}

              {subjects.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-kid-base text-gray-400">
                    No hay materias disponibles todavía
                  </p>
                </div>
              )}
            </div>
          </section>
        ) : (
          /* Mostrar actividades de la materia seleccionada */
          <section>
            <button
              onClick={() => {
                setSelectedSubject(null);
                setActivities([]);
              }}
              className="mb-6 flex items-center gap-2 text-primary-500 hover:text-primary-600 font-semibold transition-colors"
            >
              ← Volver a materias
            </button>

            <h2 className="text-kid-xl font-bold text-gray-700 mb-6">
              Actividades
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {activities.map((activity, index) => (
                <motion.div
                  key={activity.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className="card-kid hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-kid-base font-bold text-gray-700">
                      {activity.titulo}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        activity.dificultad === "facil"
                          ? "bg-green-100 text-green-700"
                          : activity.dificultad === "medio"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {activity.dificultad === "facil"
                        ? "Fácil"
                        : activity.dificultad === "medio"
                        ? "Normal"
                        : "Difícil"}
                    </span>
                  </div>

                  {activity.descripcion && (
                    <p className="text-sm text-gray-500 mb-4">
                      {activity.descripcion}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      {activity.duracion_estimada && (
                        <span>⏱ {activity.duracion_estimada} min</span>
                      )}
                      <span>⭐ {activity.puntos} pts</span>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() =>
                        router.push(`/estudiante/actividad/${activity.id}`)
                      }
                      className="flex items-center gap-2 px-5 py-3 bg-primary-400 text-white font-bold rounded-kid hover:bg-primary-500 transition-colors"
                    >
                      <Play className="w-5 h-5" />
                      Empezar
                    </motion.button>
                  </div>
                </motion.div>
              ))}

              {activities.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <p className="text-kid-base text-gray-400">
                    No hay actividades en esta materia todavía
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
