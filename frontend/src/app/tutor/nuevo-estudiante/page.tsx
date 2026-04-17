"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api, apiFetch, type DegreeResponse } from "@/lib/api";
import { ArrowLeft, ArrowRight, CheckCircle, User, Sliders } from "lucide-react";

// ── Tipos del formulario ──────────────────────────────────────

interface BasicForm {
  full_name:  string;
  birth_date: string;
  id_degree:  string;
}

interface ProfileForm {
  volume_level:    number;   // 0-10
  visual_contrast: string;   // 'normal' | 'alto' | 'bajo'
  feedback_type:   string;   // 'visual' | 'auditivo' | 'mixto'
  font_size:       string;   // 'pequeno' | 'normal' | 'grande'
  animation_speed: string;   // 'lenta' | 'normal' | 'rapida'
  max_session_min: number;   // minutos
  needs_breaks:    boolean;
  break_interval:  number;   // minutos entre pausas
}

const STEPS = ["Datos básicos", "Perfil sensorial", "Listo"];

export default function NuevoEstudiantePage() {
  const router = useRouter();
  const { token } = useSessionStore();

  const [step, setStep]       = useState(0);
  const [degrees, setDegrees] = useState<DegreeResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [createdId, setCreatedId] = useState("");

  const [basic, setBasic] = useState<BasicForm>({
    full_name:  "",
    birth_date: "",
    id_degree:  "",
  });

  const [profile, setProfile] = useState<ProfileForm>({
    volume_level:    5,
    visual_contrast: "normal",
    feedback_type:   "visual",
    font_size:       "normal",
    animation_speed: "normal",
    max_session_min: 30,
    needs_breaks:    true,
    break_interval:  10,
  });

  // Cargar grados al montar
  useEffect(() => {
    api.getDegrees().then(setDegrees).catch(console.error);
  }, []);

  // Validar step 0
  const validateBasic = () => {
    if (!basic.full_name.trim())  return "El nombre es obligatorio";
    if (!basic.birth_date)         return "La fecha de nacimiento es obligatoria";
    if (!basic.id_degree)          return "Selecciona el grado escolar";
    // Edad razonable: entre 4 y 18 años
    const age = (Date.now() - new Date(basic.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (age < 4 || age > 18)       return "La edad debe estar entre 4 y 18 años";
    return "";
  };

  const handleNextStep = () => {
    setError("");
    if (step === 0) {
      const err = validateBasic();
      if (err) { setError(err); return; }
    }
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      // 1. Crear estudiante
      const student = await api.createStudent(token, {
        full_name:  basic.full_name.trim(),
        birth_date: basic.birth_date,
        id_degree:  basic.id_degree,
      });

      // 2. Crear perfil de adaptación
      await apiFetch(`/api/students/${student.id_student}/profile`, {
        method: "POST",
        body:   { id_student: student.id_student, ...profile },
        token,
      });

      setCreatedId(student.id_student);
      setStep(2);  // Pantalla de éxito
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el estudiante");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button
            onClick={() => (step > 0 && step < 2 ? setStep(step - 1) : router.push("/tutor"))}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Nuevo estudiante</h1>
            <p className="text-sm text-gray-400">{STEPS[step]}</p>
          </div>
        </div>
      </header>

      {/* Barra de progreso */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-6 py-3 flex gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  i <= step ? "bg-primary-500" : "bg-gray-200"
                }`}
              />
              <p className={`text-xs mt-1 ${i === step ? "text-primary-600 font-semibold" : "text-gray-400"}`}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">

          {/* ── Step 0: Datos básicos ── */}
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Información del estudiante</h2>
                  <p className="text-sm text-gray-400">Datos personales básicos</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
                {/* Nombre */}
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">
                    Nombre completo <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={basic.full_name}
                    onChange={(e) => setBasic({ ...basic, full_name: e.target.value })}
                    className="input-kid"
                    placeholder="Juan Pérez García"
                  />
                </div>

                {/* Fecha de nacimiento */}
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">
                    Fecha de nacimiento <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={basic.birth_date}
                    onChange={(e) => setBasic({ ...basic, birth_date: e.target.value })}
                    className="input-kid"
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>

                {/* Grado */}
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">
                    Grado escolar <span className="text-red-400">*</span>
                  </label>
                  {degrees.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">Cargando grados...</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {degrees.map((d) => (
                        <button
                          key={d.id_degree}
                          type="button"
                          onClick={() => setBasic({ ...basic, id_degree: d.id_degree })}
                          className={`p-3 rounded-xl border-2 text-center transition-all ${
                            basic.id_degree === d.id_degree
                              ? "border-primary-400 bg-primary-50 text-primary-700 font-bold"
                              : "border-gray-200 hover:border-gray-300 text-gray-600"
                          }`}
                        >
                          <span className="text-2xl block mb-1">
                            {["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"][d.level - 1] || "🎒"}
                          </span>
                          <span className="text-xs">{d.grade_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                >
                  {error}
                </motion.p>
              )}

              <button
                onClick={handleNextStep}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors"
              >
                Siguiente
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* ── Step 1: Perfil sensorial ── */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <Sliders className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Perfil de adaptación</h2>
                  <p className="text-sm text-gray-400">
                    Configura las preferencias sensoriales del estudiante
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                {/* Volumen */}
                <div>
                  <label className="flex items-center justify-between text-sm font-semibold text-gray-600 mb-2">
                    <span>🔊 Nivel de volumen</span>
                    <span className="text-primary-600">{profile.volume_level}/10</span>
                  </label>
                  <input
                    type="range" min={0} max={10}
                    value={profile.volume_level}
                    onChange={(e) => setProfile({ ...profile, volume_level: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Sin sonido</span><span>Alto</span>
                  </div>
                </div>

                {/* Contraste visual */}
                <SelectGroup
                  label="🎨 Contraste visual"
                  value={profile.visual_contrast}
                  onChange={(v) => setProfile({ ...profile, visual_contrast: v })}
                  options={[
                    { value: "bajo",   label: "Suave" },
                    { value: "normal", label: "Normal" },
                    { value: "alto",   label: "Alto contraste" },
                  ]}
                />

                {/* Tipo de feedback */}
                <SelectGroup
                  label="💬 Tipo de retroalimentación"
                  value={profile.feedback_type}
                  onChange={(v) => setProfile({ ...profile, feedback_type: v })}
                  options={[
                    { value: "visual",   label: "Visual" },
                    { value: "auditivo", label: "Auditivo" },
                    { value: "mixto",    label: "Mixto" },
                  ]}
                />

                {/* Tamaño de letra */}
                <SelectGroup
                  label="🔤 Tamaño de texto"
                  value={profile.font_size}
                  onChange={(v) => setProfile({ ...profile, font_size: v })}
                  options={[
                    { value: "pequeno", label: "Pequeño" },
                    { value: "normal",  label: "Normal" },
                    { value: "grande",  label: "Grande" },
                  ]}
                />

                {/* Velocidad de animaciones */}
                <SelectGroup
                  label="⚡ Velocidad de animaciones"
                  value={profile.animation_speed}
                  onChange={(v) => setProfile({ ...profile, animation_speed: v })}
                  options={[
                    { value: "lenta",  label: "Lenta" },
                    { value: "normal", label: "Normal" },
                    { value: "rapida", label: "Rápida" },
                  ]}
                />

                {/* Duración de sesión */}
                <div>
                  <label className="flex items-center justify-between text-sm font-semibold text-gray-600 mb-2">
                    <span>⏱ Duración máxima de sesión</span>
                    <span className="text-primary-600">{profile.max_session_min} min</span>
                  </label>
                  <input
                    type="range" min={10} max={90} step={5}
                    value={profile.max_session_min}
                    onChange={(e) => setProfile({ ...profile, max_session_min: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>10 min</span><span>90 min</span>
                  </div>
                </div>

                {/* Pausas */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-600">🧘 Pausas automáticas</p>
                    <p className="text-xs text-gray-400">Descansos breves durante la sesión</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, needs_breaks: !profile.needs_breaks })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      profile.needs_breaks ? "bg-primary-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        profile.needs_breaks ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {profile.needs_breaks && (
                  <div>
                    <label className="flex items-center justify-between text-sm font-semibold text-gray-600 mb-2">
                      <span>⏰ Intervalo entre pausas</span>
                      <span className="text-primary-600">{profile.break_interval} min</span>
                    </label>
                    <input
                      type="range" min={5} max={30} step={5}
                      value={profile.break_interval}
                      onChange={(e) => setProfile({ ...profile, break_interval: Number(e.target.value) })}
                      className="w-full accent-primary-500"
                    />
                  </div>
                )}
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3"
                >
                  {error}
                </motion.p>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {loading ? "Registrando..." : "Registrar estudiante"}
                {!loading && <CheckCircle className="w-5 h-5" />}
              </button>
            </motion.div>
          )}

          {/* ── Step 2: Éxito ── */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-12"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5 }}
                className="text-7xl mb-6"
              >
                🎉
              </motion.div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                ¡Estudiante registrado!
              </h2>
              <p className="text-gray-500 mb-8">
                <strong>{basic.full_name}</strong> ya está en el sistema con su perfil de adaptación.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => router.push(`/tutor/estudiante/${createdId}`)}
                  className="px-6 py-3 bg-primary-500 text-white font-bold rounded-xl hover:bg-primary-600 transition-colors"
                >
                  Ver perfil completo
                </button>
                <button
                  onClick={() => router.push("/tutor")}
                  className="px-6 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Volver al panel
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}

// ── Componente auxiliar: grupo de botones de selección ────────

function SelectGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-600 mb-2">{label}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
              value === opt.value
                ? "border-primary-400 bg-primary-50 text-primary-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
