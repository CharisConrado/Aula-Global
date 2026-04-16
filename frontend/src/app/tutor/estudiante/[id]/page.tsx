"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import {
  api,
  type StudentResponse,
  type ProfileResponse,
  type SessionResponse,
} from "@/lib/api";
import { ArrowLeft, Edit3, Save, X, MessageSquare } from "lucide-react";

export default function TutorEstudiantePage() {
  const router = useRouter();
  const params = useParams();
  const studentId = Number(params.id);

  const { token, user } = useSessionStore();

  const [student, setStudent]   = useState<StudentResponse | null>(null);
  const [profile, setProfile]   = useState<ProfileResponse | null>(null);
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<Partial<ProfileResponse>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [stud, sess] = await Promise.all([
        api.getStudent(token, studentId),
        api.getSessions(token, { student_id: String(studentId), limit: "20" }),
      ]);
      setStudent(stud);
      setSessions(sess);

      try {
        const prof = await api.getStudentProfile(token, studentId);
        setProfile(prof);
        setProfileForm(prof);
      } catch {
        // El estudiante puede no tener perfil aún
      }
    } catch (err) {
      console.error("Error cargando estudiante:", err);
    } finally {
      setLoading(false);
    }
  }, [token, studentId]);

  useEffect(() => {
    if (!token || !user || (user.rol !== "tutor" && user.rol !== "profesional" && user.rol !== "admin")) {
      router.replace("/login");
      return;
    }
    loadData();
  }, [token, user, router, loadData]);

  const handleSaveProfile = async () => {
    if (!token) return;
    setSavingProfile(true);
    try {
      if (profile) {
        // Actualizar perfil existente
        const updated = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/students/${studentId}/profile`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(profileForm),
          }
        );
        if (updated.ok) {
          const data = await updated.json();
          setProfile(data);
          setEditingProfile(false);
          setSuccessMsg("Perfil actualizado correctamente");
          setTimeout(() => setSuccessMsg(""), 3000);
        }
      }
    } catch (err) {
      console.error("Error guardando perfil:", err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRequestConsult = async () => {
    if (!token) return;
    try {
      await api.requestExternalConsult(token, studentId, "Consulta solicitada por tutor desde el dashboard");
      setSuccessMsg("Consulta enviada al profesional disponible");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      console.error("Error solicitando consulta:", err);
    }
  };

  const totalSessions   = sessions.length;
  const avgNota         = sessions.filter((s) => s.nota_cuantitativa !== null).reduce((acc, s) => acc + (s.nota_cuantitativa || 0), 0) / (sessions.filter((s) => s.nota_cuantitativa !== null).length || 1);
  const totalActivities = sessions.reduce((acc, s) => acc + s.actividades_completadas, 0);
  const totalCrisis     = sessions.reduce((acc, s) => acc + s.crisis_ocurridas, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 animate-pulse">Cargando...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-400">Estudiante no encontrado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push("/tutor")}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {student.nombre} {student.apellido}
            </h1>
            <p className="text-sm text-gray-400">@{student.username}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm font-semibold"
          >
            ✓ {successMsg}
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Columna izquierda: datos y perfil */}
          <div className="space-y-6">
            {/* Stats rápidas */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Sesiones",    value: totalSessions,         color: "text-primary-600" },
                { label: "Nota prom.",  value: avgNota.toFixed(1),    color: "text-green-600" },
                { label: "Actividades", value: totalActivities,       color: "text-blue-600" },
                { label: "Crisis",      value: totalCrisis,           color: totalCrisis > 0 ? "text-orange-500" : "text-gray-400" },
              ].map((stat) => (
                <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Perfil */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-700">Perfil de Adaptación</h2>
                {profile && !editingProfile && (
                  <button
                    onClick={() => setEditingProfile(true)}
                    className="text-primary-500 hover:text-primary-600"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                {editingProfile && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="text-green-500 hover:text-green-600"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingProfile(false);
                        setProfileForm(profile || {});
                      }}
                      className="text-red-400 hover:text-red-500"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {profile ? (
                <div className="space-y-3 text-sm">
                  {editingProfile ? (
                    <>
                      <div>
                        <label className="block text-gray-500 mb-1">Prefiere formato</label>
                        <select
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={profileForm.prefiere_formato || ""}
                          onChange={(e) => setProfileForm({ ...profileForm, prefiere_formato: e.target.value })}
                        >
                          <option value="">Sin preferencia</option>
                          <option value="visual">Visual</option>
                          <option value="auditivo">Auditivo</option>
                          <option value="kinestesico">Kinestésico</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Tiempo máx. actividad (min)</label>
                        <input
                          type="number"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={profileForm.tiempo_max_actividad || ""}
                          onChange={(e) => setProfileForm({ ...profileForm, tiempo_max_actividad: Number(e.target.value) })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="alto_contraste"
                          checked={profileForm.alto_contraste || false}
                          onChange={(e) => setProfileForm({ ...profileForm, alto_contraste: e.target.checked })}
                        />
                        <label htmlFor="alto_contraste" className="text-gray-500">
                          Modo alto contraste
                        </label>
                      </div>
                      <div>
                        <label className="block text-gray-500 mb-1">Notas adicionales</label>
                        <textarea
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          rows={3}
                          value={profileForm.notas_adicionales || ""}
                          onChange={(e) => setProfileForm({ ...profileForm, notas_adicionales: e.target.value })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <ProfileField label="Formato preferido" value={profile.prefiere_formato} />
                      <ProfileField label="Tiempo máx. actividad" value={profile.tiempo_max_actividad ? `${profile.tiempo_max_actividad} min` : null} />
                      <ProfileField label="Alto contraste" value={profile.alto_contraste ? "Sí" : "No"} />
                      <ProfileField label="Necesita pausas" value={profile.necesita_pausas ? "Sí" : "No"} />
                      {profile.notas_adicionales && (
                        <div>
                          <p className="text-gray-400 text-xs">Notas</p>
                          <p className="text-gray-700 mt-1">{profile.notas_adicionales}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">
                  Este estudiante aún no tiene perfil de adaptación configurado.
                </p>
              )}
            </div>

            {/* Solicitar consulta */}
            <button
              onClick={handleRequestConsult}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-50 border border-primary-200 text-primary-700 rounded-xl font-semibold hover:bg-primary-100 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Solicitar consulta con profesional
            </button>
          </div>

          {/* Columna derecha: historial de sesiones */}
          <div className="lg:col-span-2">
            <h2 className="font-bold text-gray-700 mb-4">Historial de Sesiones</h2>

            {sessions.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <p className="text-gray-400">Este estudiante aún no tiene sesiones</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-white rounded-xl border border-gray-200 p-5"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-700">
                          {new Date(session.fecha_inicio).toLocaleDateString("es-CO", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <p className="text-sm text-gray-400">
                          {session.duracion_total
                            ? `${Math.round(session.duracion_total / 60)} minutos`
                            : session.is_active
                            ? "En progreso ahora"
                            : "Duración no registrada"}
                        </p>
                      </div>

                      {session.nota_cuantitativa !== null && (
                        <div className="text-center">
                          <p className={`text-2xl font-bold ${
                            session.nota_cuantitativa >= 4 ? "text-green-600" :
                            session.nota_cuantitativa >= 3 ? "text-yellow-600" : "text-red-500"
                          }`}>
                            {session.nota_cuantitativa}
                          </p>
                          <p className="text-xs text-gray-400">/ 5</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4 text-sm text-gray-500">
                      <span>📚 {session.actividades_completadas} actividades</span>
                      {session.crisis_ocurridas > 0 && (
                        <span className="text-orange-500">
                          ⚠ {session.crisis_ocurridas} crisis
                        </span>
                      )}
                      {session.intervenciones_realizadas > 0 && (
                        <span className="text-blue-500">
                          🩺 {session.intervenciones_realizadas} intervenciones
                        </span>
                      )}
                    </div>

                    {session.nota_cualitativa && (
                      <p className="mt-2 text-sm text-gray-500 italic border-t border-gray-100 pt-2">
                        "{session.nota_cualitativa}"
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold text-gray-700">{value}</span>
    </div>
  );
}
