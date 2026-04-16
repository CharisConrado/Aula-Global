"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api, type ActivityResponse, type DegreeResponse, type SubjectResponse } from "@/lib/api";
import { Plus, BookOpen, LogOut, Settings, AlertCircle, Users } from "lucide-react";

type Tab = "actividades" | "contenido" | "usuarios" | "crisis";

export default function AdminPage() {
  const router = useRouter();
  const { token, user, logout } = useSessionStore();

  const [tab, setTab]               = useState<Tab>("actividades");
  const [activities, setActivities] = useState<ActivityResponse[]>([]);
  const [degrees, setDegrees]       = useState<DegreeResponse[]>([]);
  const [subjects, setSubjects]     = useState<SubjectResponse[]>([]);
  const [loading, setLoading]       = useState(true);

  // Form nueva actividad
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    descripcion: "",
    subject_id: "",
    type_activity_id: "1",
    dificultad: "medio",
    duracion_estimada: "15",
    puntos: "10",
    orden: "1",
    contenido_json: "",
  });
  const [formError, setFormError]   = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [acts, degs, subs] = await Promise.all([
        api.getActivities(token),
        api.getDegrees(),
        api.getSubjects(),
      ]);
      setActivities(acts);
      setDegrees(degs);
      setSubjects(subs);
    } catch (err) {
      console.error("Error cargando datos admin:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user || (user.rol !== "admin" && user.rol !== "profesional")) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [token, user, router, loadData]);

  const handleCreateActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!token) return;

    let contenidoParsed = null;
    if (formData.contenido_json.trim()) {
      try {
        contenidoParsed = JSON.parse(formData.contenido_json);
      } catch {
        setFormError("El JSON del contenido no es válido");
        return;
      }
    }

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/activities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          titulo: formData.titulo,
          descripcion: formData.descripcion,
          subject_id: Number(formData.subject_id),
          type_activity_id: Number(formData.type_activity_id),
          dificultad: formData.dificultad,
          duracion_estimada: Number(formData.duracion_estimada),
          puntos: Number(formData.puntos),
          orden: Number(formData.orden),
          contenido_json: contenidoParsed,
        }),
      });

      if (res.ok) {
        const act = await res.json();
        setActivities((prev) => [act, ...prev]);
        setShowForm(false);
        setFormSuccess("Actividad creada correctamente");
        setFormData({ titulo: "", descripcion: "", subject_id: "", type_activity_id: "1", dificultad: "medio", duracion_estimada: "15", puntos: "10", orden: "1", contenido_json: "" });
        setTimeout(() => setFormSuccess(""), 3000);
      } else {
        const err = await res.json();
        setFormError(err.detail || "Error al crear la actividad");
      }
    } catch {
      setFormError("Error de conexión con el servidor");
    }
  };

  const handleDeleteActivity = async (id: number) => {
    if (!token || !confirm("¿Eliminar esta actividad?")) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/activities/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setActivities((prev) => prev.filter((a) => a.id !== id));
    } catch {
      console.error("Error eliminando actividad");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 animate-pulse">Cargando panel admin...</p>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "actividades", label: "Actividades", icon: <BookOpen className="w-4 h-4" /> },
    { key: "contenido",   label: "Contenido",   icon: <Settings className="w-4 h-4" /> },
    { key: "crisis",      label: "Crisis",       icon: <AlertCircle className="w-4 h-4" /> },
    { key: "usuarios",    label: "Usuarios",     icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Aula Global</h1>
            <p className="text-sm text-gray-400 capitalize">
              Panel {user?.rol === "admin" ? "Administrador" : "Profesional"}
            </p>
          </div>
          <button
            onClick={() => { logout(); router.replace("/login"); }}
            className="flex items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Salir</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors border-b-2 ${
                tab === t.key
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {formSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-semibold"
          >
            ✓ {formSuccess}
          </motion.div>
        )}

        {/* --- Actividades --- */}
        {tab === "actividades" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-700">
                Actividades ({activities.length})
              </h2>
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nueva actividad
              </button>
            </div>

            {/* Formulario nueva actividad */}
            {showForm && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl border border-gray-200 p-6 mb-6"
              >
                <h3 className="font-bold text-gray-700 mb-4">Nueva Actividad</h3>
                <form onSubmit={handleCreateActivity} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-600 mb-1">
                      Título *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.titulo}
                      onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                      placeholder="Nombre de la actividad"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-600 mb-1">
                      Descripción
                    </label>
                    <textarea
                      value={formData.descripcion}
                      onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                      rows={2}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1">
                      Materia *
                    </label>
                    <select
                      required
                      value={formData.subject_id}
                      onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona una materia</option>
                      {subjects.map((s) => {
                        const degree = degrees.find((d) => d.id === s.degree_id);
                        return (
                          <option key={s.id} value={s.id}>
                            {s.name} ({degree?.name || `Grado ${degree?.grade_number}`})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1">
                      Dificultad
                    </label>
                    <select
                      value={formData.dificultad}
                      onChange={(e) => setFormData({ ...formData, dificultad: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="facil">Fácil</option>
                      <option value="medio">Normal</option>
                      <option value="dificil">Difícil</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1">
                      Duración estimada (min)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="120"
                      value={formData.duracion_estimada}
                      onChange={(e) => setFormData({ ...formData, duracion_estimada: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-600 mb-1">
                      Puntos
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.puntos}
                      onChange={(e) => setFormData({ ...formData, puntos: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-semibold text-gray-600 mb-1">
                      Contenido JSON (opcional)
                    </label>
                    <textarea
                      value={formData.contenido_json}
                      onChange={(e) => setFormData({ ...formData, contenido_json: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono"
                      rows={4}
                      placeholder={'{\n  "preguntas": [\n    {\n      "pregunta": "¿Cuánto es 2+2?",\n      "opciones": ["3", "4", "5"],\n      "respuesta_correcta": 1\n    }\n  ]\n}'}
                    />
                  </div>

                  {formError && (
                    <div className="md:col-span-2 px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                      {formError}
                    </div>
                  )}

                  <div className="md:col-span-2 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600"
                    >
                      Crear actividad
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Lista de actividades */}
            <div className="space-y-3">
              {activities.map((activity) => {
                const subject = subjects.find((s) => s.id === activity.subject_id);
                const degree  = degrees.find((d) => d.id === subject?.degree_id);

                return (
                  <div
                    key={activity.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-800">{activity.titulo}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            activity.dificultad === "facil"
                              ? "bg-green-100 text-green-700"
                              : activity.dificultad === "medio"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {activity.dificultad}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">
                        {subject?.name} — {degree?.name || `Grado ${degree?.grade_number}`}
                        {activity.duracion_estimada && ` — ${activity.duracion_estimada} min`}
                        {` — ${activity.puntos} pts`}
                      </p>
                    </div>

                    <button
                      onClick={() => handleDeleteActivity(activity.id)}
                      className="text-red-400 hover:text-red-500 transition-colors p-2"
                      title="Eliminar actividad"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              {activities.length === 0 && (
                <div className="text-center py-12">
                  <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400">No hay actividades creadas todavía</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- Contenido (materias y grados) --- */}
        {tab === "contenido" && (
          <div>
            <h2 className="text-xl font-bold text-gray-700 mb-6">Estructura de Contenido</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Grados */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-bold text-gray-700 mb-4">Grados ({degrees.length})</h3>
                <div className="space-y-2">
                  {degrees.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="font-semibold text-gray-700">{d.name}</span>
                      <span className="text-sm text-gray-400">Grado {d.grade_number}°</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Materias */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-bold text-gray-700 mb-4">Materias ({subjects.length})</h3>
                <div className="space-y-2">
                  {subjects.map((s) => {
                    const degree = degrees.find((d) => d.id === s.degree_id);
                    return (
                      <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="font-semibold text-gray-700">{s.name}</span>
                        <span className="text-sm text-gray-400">{degree?.name}</span>
                      </div>
                    );
                  })}
                  {subjects.length === 0 && (
                    <p className="text-gray-400 text-sm">No hay materias creadas</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- Crisis (para profesionales) --- */}
        {tab === "crisis" && (
          <div>
            <h2 className="text-xl font-bold text-gray-700 mb-6">
              <AlertCircle className="w-5 h-5 inline mr-2 text-red-500" />
              Crisis e Intervenciones
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">
                Gestión de crisis desde el API directamente.
              </p>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600"
              >
                Abrir API Docs (Swagger)
              </a>
            </div>
          </div>
        )}

        {/* --- Usuarios --- */}
        {tab === "usuarios" && (
          <div>
            <h2 className="text-xl font-bold text-gray-700 mb-6">
              <Users className="w-5 h-5 inline mr-2" />
              Gestión de Usuarios
            </h2>
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">
                Administración de usuarios disponible vía API.
              </p>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-semibold hover:bg-primary-600"
              >
                Abrir API Docs (Swagger)
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
