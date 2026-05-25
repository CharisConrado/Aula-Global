"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api, type DegreeResponse } from "@/lib/api";
import {
  ArrowLeft, ArrowRight, CheckCircle, User, Sliders,
  FileText, Upload, X, FileCheck2, SkipForward,
} from "lucide-react";

// ── Tipos del formulario ──────────────────────────────────────

interface BasicForm {
  full_name:          string;
  birth_date:         string;
  id_degree:          string;
  identity_document:  string;
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

const STEPS = ["Datos básicos", "Diagnóstico", "Perfil sensorial", "Listo"];

interface DiagnosisForm {
  id_type_diagnosis: string;
  description:       string;
  file:              File | null;
}

interface DiagnosisType { id_type_diagnosis: string; name: string; }

export default function NuevoEstudiantePage() {
  const router = useRouter();
  const { token } = useSessionStore();

  const [step, setStep]       = useState(0);
  const [degrees, setDegrees] = useState<DegreeResponse[]>([]);
  const [diagnosisTypes, setDiagnosisTypes] = useState<DiagnosisType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [createdId, setCreatedId]     = useState("");
  const [accessCode, setAccessCode]   = useState("");
  const [diagnosisUploaded, setDiagnosisUploaded] = useState(false);
  const [profileWarning, setProfileWarning]       = useState("");
  const [diagnosisWarning, setDiagnosisWarning]   = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [basic, setBasic] = useState<BasicForm>({
    full_name:         "",
    birth_date:        "",
    id_degree:         "",
    identity_document: "",
  });

  const [diagnosis, setDiagnosis] = useState<DiagnosisForm>({
    id_type_diagnosis: "",
    description:       "",
    file:              null,
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

  // Cargar grados y tipos de diagnóstico al montar
  useEffect(() => {
    api.getDegrees().then(setDegrees).catch(console.error);
    api.getDiagnosisTypes().then(setDiagnosisTypes).catch(console.error);
  }, []);

  // Manejo de selección de archivo
  const handleFileSelect = (f: File | null) => {
    setError("");
    if (!f) { setDiagnosis({ ...diagnosis, file: null }); return; }
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(f.type)) {
      setError("Formato no permitido. Acepta PDF, JPG, PNG o WebP.");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("El archivo supera los 5 MB permitidos.");
      return;
    }
    setDiagnosis({ ...diagnosis, file: f });
  };

  // Validar paso de diagnóstico (es opcional, pero si llenan algo debe ser válido)
  const validateDiagnosis = (): string => {
    const someField = diagnosis.id_type_diagnosis || diagnosis.description.trim() || diagnosis.file;
    if (!someField) return "";                         // se permite saltar
    if (!diagnosis.id_type_diagnosis) return "Selecciona el tipo de diagnóstico";
    if (!diagnosis.file)              return "Adjunta el documento de diagnóstico";
    return "";
  };

  // Validar step 0
  const validateBasic = () => {
    if (!basic.full_name.trim())         return "El nombre es obligatorio";
    if (!basic.birth_date)               return "La fecha de nacimiento es obligatoria";
    if (!basic.id_degree)                return "Selecciona el grado escolar";
    if (!basic.identity_document.trim()) return "El documento de identidad es obligatorio";
    // Edad razonable: entre 4 y 18 años
    const age = (Date.now() - new Date(basic.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365);
    if (age < 4 || age > 18)             return "La edad debe estar entre 4 y 18 años";
    return "";
  };

  const handleNextStep = () => {
    setError("");
    if (step === 0) {
      const err = validateBasic();
      if (err) { setError(err); return; }
    }
    if (step === 1) {
      const err = validateDiagnosis();
      if (err) { setError(err); return; }
    }
    setStep((s) => s + 1);
  };

  const handleSkipDiagnosis = () => {
    setDiagnosis({ id_type_diagnosis: "", description: "", file: null });
    setError("");
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setProfileWarning("");
    setDiagnosisWarning("");

    // ── Paso 1: Crear estudiante + perfil sensorial en UNA SOLA petición atómica ──
    let student;
    try {
      student = await api.createStudent(token, {
        full_name:         basic.full_name.trim(),
        birth_date:        basic.birth_date,
        id_degree:         basic.id_degree,
        identity_document: basic.identity_document.trim(),
        // ✓ El perfil viaja JUNTO con el estudiante — backend lo crea atómicamente
        profile: {
          volume_level:    profile.volume_level,
          visual_contrast: profile.visual_contrast,
          feedback_type:   profile.feedback_type,
          font_size:       profile.font_size,
          animation_speed: profile.animation_speed,
          max_session_min: profile.max_session_min,
          needs_breaks:    profile.needs_breaks,
          break_interval:  profile.break_interval,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrar el estudiante");
      setLoading(false);
      return;
    }

    // El estudiante + perfil ya están guardados juntos
    setCreatedId(student.id_student);
    setAccessCode(student.access_code || "");

    // ── Paso 2: Subir diagnóstico (NO fatal) ──
    let uploadedDiag = false;
    if (diagnosis.file && diagnosis.id_type_diagnosis) {
      try {
        await api.uploadStudentDiagnosis(token, student.id_student, {
          id_type_diagnosis: diagnosis.id_type_diagnosis,
          description:       diagnosis.description || undefined,
          file:              diagnosis.file,
        });
        uploadedDiag = true;
      } catch (uploadErr) {
        console.warn("Error subiendo diagnóstico:", uploadErr);
        setDiagnosisWarning(
          uploadErr instanceof Error
            ? `No se pudo subir el diagnóstico: ${uploadErr.message}. Podrás subirlo después desde el perfil del estudiante.`
            : "No se pudo subir el diagnóstico. Podrás subirlo después desde el perfil del estudiante."
        );
      }
    }
    setDiagnosisUploaded(uploadedDiag);

    setStep(3);
    setLoading(false);
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#FDF8F2" }}>
      {/* Header */}
      <header className="bg-white px-6 py-4" style={{ borderBottom: "1px solid #D5DBDB" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button
            onClick={() => (step > 0 && step < 3 ? setStep(step - 1) : router.push("/tutor"))}
            className="transition-colors hover:opacity-70"
            style={{ color: "#7FB3D5" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#34495E" }}>Nuevo estudiante</h1>
            <p className="text-sm" style={{ color: "#7f8c8d" }}>{STEPS[step]}</p>
          </div>
        </div>
      </header>

      {/* Barra de progreso */}
      <div className="bg-white" style={{ borderBottom: "1px solid #D5DBDB" }}>
        <div className="max-w-2xl mx-auto px-6 py-3 flex gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex-1">
              <div
                className="h-1.5 rounded-full transition-colors"
                style={{ backgroundColor: i <= step ? "#7FB3D5" : "#D5DBDB" }}
              />
              <p
                className="text-xs mt-1"
                style={{
                  color: i === step ? "#7FB3D5" : "#7f8c8d",
                  fontWeight: i === step ? 700 : 400,
                }}
              >
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
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#E1EFFF" }}
                >
                  <User className="w-5 h-5" style={{ color: "#7FB3D5" }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "#34495E" }}>Información del estudiante</h2>
                  <p className="text-sm" style={{ color: "#7f8c8d" }}>Datos personales básicos</p>
                </div>
              </div>

              <div
                className="bg-white rounded-2xl p-6 space-y-5"
                style={{ border: "1px solid #D5DBDB", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
              >
                {/* Nombre */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    Nombre completo <span style={{ color: "#dc2626" }}>*</span>
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
                  <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    Fecha de nacimiento <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={basic.birth_date}
                    onChange={(e) => setBasic({ ...basic, birth_date: e.target.value })}
                    className="input-kid"
                    max={new Date().toISOString().split("T")[0]}
                  />
                </div>

                {/* Documento de identidad */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    Documento de identidad <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={basic.identity_document}
                    onChange={(e) => setBasic({ ...basic, identity_document: e.target.value })}
                    className="input-kid"
                    placeholder="12345678"
                    autoComplete="off"
                  />
                  <p className="text-xs mt-1" style={{ color: "#7f8c8d" }}>
                    El estudiante usará este número junto con un código generado automáticamente para ingresar.
                  </p>
                </div>

                {/* Grado */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    Grado escolar <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  {degrees.length === 0 ? (
                    <p className="text-sm italic" style={{ color: "#7f8c8d" }}>Cargando grados...</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {degrees.map((d) => (
                        <button
                          key={d.id_degree}
                          type="button"
                          onClick={() => setBasic({ ...basic, id_degree: d.id_degree })}
                          className="p-3 rounded-xl text-center transition-all"
                          style={
                            basic.id_degree === d.id_degree
                              ? {
                                  border: "2px solid #7FB3D5",
                                  backgroundColor: "#E1EFFF",
                                  color: "#4587a9",
                                  fontWeight: 700,
                                }
                              : {
                                  border: "2px solid #D5DBDB",
                                  backgroundColor: "#ffffff",
                                  color: "#34495E",
                                }
                          }
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
                  className="text-sm rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: "#fff0f0",
                    border: "1px solid #fca5a5",
                    color: "#dc2626",
                  }}
                >
                  {error}
                </motion.p>
              )}

              <button
                onClick={handleNextStep}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 text-white font-bold rounded-xl transition-opacity hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg,#FFB37B,#ff9450)",
                  boxShadow: "0 4px 14px rgba(255,148,80,0.35)",
                }}
              >
                Siguiente
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {/* ── Step 1: Diagnóstico (opcional) ── */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#FFE4D4" }}
                >
                  <FileText className="w-5 h-5" style={{ color: "#FFB37B" }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "#34495E" }}>
                    Diagnóstico médico
                  </h2>
                  <p className="text-sm" style={{ color: "#7f8c8d" }}>
                    Sube el documento del diagnóstico para personalizar mejor la experiencia
                  </p>
                </div>
              </div>

              <div
                className="bg-white rounded-2xl p-6 space-y-5"
                style={{ border: "1px solid #D5DBDB", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
              >
                {/* Banner informativo */}
                <div
                  className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{ backgroundColor: "#E1EFFF", border: "1px solid rgba(127,179,213,0.3)" }}
                >
                  <span className="text-base flex-shrink-0">ℹ️</span>
                  <p className="text-xs" style={{ color: "#4587a9" }}>
                    Este paso es <strong>opcional</strong>. Si aún no cuentas con el diagnóstico,
                    puedes saltarlo y agregarlo más tarde desde el perfil del estudiante.
                  </p>
                </div>

                {/* Tipo de diagnóstico */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    Tipo de diagnóstico
                  </label>
                  {diagnosisTypes.length === 0 ? (
                    <p className="text-sm italic" style={{ color: "#7f8c8d" }}>Cargando tipos…</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {diagnosisTypes.map((d) => {
                        const selected = diagnosis.id_type_diagnosis === d.id_type_diagnosis;
                        return (
                          <button
                            key={d.id_type_diagnosis}
                            type="button"
                            onClick={() =>
                              setDiagnosis({ ...diagnosis, id_type_diagnosis: d.id_type_diagnosis })
                            }
                            className="p-3 rounded-xl text-sm font-semibold transition-all"
                            style={
                              selected
                                ? { border: "2px solid #FFB37B", backgroundColor: "#FFE4D4", color: "#c9591e" }
                                : { border: "2px solid #D5DBDB", backgroundColor: "#fff", color: "#34495E" }
                            }
                          >
                            {d.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    Notas adicionales <span style={{ color: "#a0aec0", fontWeight: 400 }}>(opcional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={diagnosis.description}
                    onChange={(e) => setDiagnosis({ ...diagnosis, description: e.target.value })}
                    placeholder="Información complementaria sobre el diagnóstico…"
                    style={{
                      width: "100%", borderRadius: "0.75rem", padding: "0.75rem 1rem",
                      fontSize: "0.875rem", outline: "none", color: "#34495E",
                      background: "white", border: "1.5px solid #D5DBDB", resize: "vertical",
                    }}
                  />
                </div>

                {/* Upload */}
                <div>
                  <label className="block text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    Documento del diagnóstico
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                    style={{ display: "none" }}
                  />

                  {!diagnosis.file ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl transition-colors"
                      style={{
                        border: "2px dashed #D5DBDB",
                        backgroundColor: "#FDF8F2",
                        color: "#7f8c8d",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#FFB37B";
                        e.currentTarget.style.backgroundColor = "#FFE4D4";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "#D5DBDB";
                        e.currentTarget.style.backgroundColor = "#FDF8F2";
                      }}
                    >
                      <Upload className="w-7 h-7" />
                      <span className="text-sm font-semibold">Haz clic para subir un archivo</span>
                      <span className="text-xs">PDF, JPG, PNG o WebP · máx. 5 MB</span>
                    </button>
                  ) : (
                    <div
                      className="flex items-center gap-3 p-4 rounded-xl"
                      style={{
                        backgroundColor: "#dcfce7",
                        border: "1.5px solid #86efac",
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "#16a34a", color: "white" }}
                      >
                        <FileCheck2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: "#15803d" }}>
                          {diagnosis.file.name}
                        </p>
                        <p className="text-xs" style={{ color: "#16a34a" }}>
                          {(diagnosis.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDiagnosis({ ...diagnosis, file: null });
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/50 transition-colors"
                        style={{ color: "#16a34a" }}
                        title="Quitar archivo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: "#fff0f0",
                    border: "1px solid #fca5a5",
                    color: "#dc2626",
                  }}
                >
                  {error}
                </motion.p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSkipDiagnosis}
                  className="flex items-center justify-center gap-2 px-6 py-4 font-bold rounded-xl transition-colors"
                  style={{
                    border: "1.5px solid #D5DBDB",
                    color: "#7f8c8d",
                    backgroundColor: "white",
                  }}
                >
                  <SkipForward className="w-5 h-5" />
                  Saltar
                </button>
                <button
                  onClick={handleNextStep}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-4 text-white font-bold rounded-xl transition-opacity hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg,#FFB37B,#ff9450)",
                    boxShadow: "0 4px 14px rgba(255,148,80,0.35)",
                  }}
                >
                  Siguiente
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Perfil sensorial ── */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#f0fdf4" }}
                >
                  <Sliders className="w-5 h-5" style={{ color: "#A2D9A1" }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "#34495E" }}>Perfil de adaptación</h2>
                  <p className="text-sm" style={{ color: "#7f8c8d" }}>
                    Configura las preferencias sensoriales del estudiante
                  </p>
                </div>
              </div>

              {/* ── Vista previa en vivo (sticky en pantallas grandes) ── */}
              <div
                className="lg:sticky lg:z-20"
                style={{ top: "1rem" }}
              >
                <SensoryPreview profile={profile} studentName={basic.full_name} />
              </div>

              <div
                className="bg-white rounded-2xl p-6 space-y-6"
                style={{ border: "1px solid #D5DBDB", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
              >
                {/* Volumen */}
                <div>
                  <label className="flex items-center justify-between text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    <span>🔊 Nivel de volumen</span>
                    <span style={{ color: "#7FB3D5" }}>{profile.volume_level}/10</span>
                  </label>
                  <input
                    type="range" min={0} max={10}
                    value={profile.volume_level}
                    onChange={(e) => setProfile({ ...profile, volume_level: Number(e.target.value) })}
                    className="w-full"
                    style={{ accentColor: "#7FB3D5" }}
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: "#7f8c8d" }}>
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
                <div>
                  <p className="text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    ⚡ Velocidad de animaciones
                  </p>
                  <p className="text-xs mb-2" style={{ color: "#a0aec0" }}>
                    Qué tan rápido se mueven los elementos de las actividades.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "lenta",  label: "Lenta",  hint: "Más calma" },
                      { value: "normal", label: "Normal", hint: "Equilibrio" },
                      { value: "rapida", label: "Rápida", hint: "Dinámica"  },
                    ].map((opt) => {
                      const sel = profile.animation_speed === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setProfile({ ...profile, animation_speed: opt.value })}
                          className="flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-sm font-bold transition-all"
                          style={sel
                            ? { border: "2px solid #7FB3D5", background: "#E1EFFF", color: "#4587a9" }
                            : { border: "2px solid #D5DBDB", background: "white",   color: "#34495E" }}
                        >
                          <motion.span
                            animate={sel ? { rotate: [0, 360] } : { rotate: 0 }}
                            transition={{
                              duration: opt.value === "lenta" ? 3 : opt.value === "rapida" ? 0.6 : 1.4,
                              repeat: sel ? Infinity : 0,
                              ease: "linear",
                            }}
                            style={{ fontSize: 18 }}
                          >
                            ⚡
                          </motion.span>
                          <span>{opt.label}</span>
                          <span className="text-[10px] font-normal" style={{ color: sel ? "#4587a9" : "#a0aec0" }}>
                            {opt.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duración de sesión */}
                <div>
                  <label className="flex items-center justify-between text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                    <span>⏱ Duración máxima de sesión</span>
                    <span style={{ color: "#7FB3D5" }}>{profile.max_session_min} min</span>
                  </label>
                  <input
                    type="range" min={10} max={90} step={5}
                    value={profile.max_session_min}
                    onChange={(e) => setProfile({ ...profile, max_session_min: Number(e.target.value) })}
                    className="w-full"
                    style={{ accentColor: "#7FB3D5" }}
                  />
                  <div className="flex justify-between text-xs mt-1" style={{ color: "#7f8c8d" }}>
                    <span>10 min</span><span>90 min</span>
                  </div>
                </div>

                {/* Pausas */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#34495E" }}>🧘 Pausas automáticas</p>
                    <p className="text-xs" style={{ color: "#7f8c8d" }}>Descansos breves durante la sesión</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, needs_breaks: !profile.needs_breaks })}
                    className="relative w-12 h-6 rounded-full transition-colors"
                    style={{ backgroundColor: profile.needs_breaks ? "#A2D9A1" : "#D5DBDB" }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                      style={{ transform: profile.needs_breaks ? "translateX(24px)" : "translateX(0)" }}
                    />
                  </button>
                </div>

                {profile.needs_breaks && (
                  <div>
                    <label className="flex items-center justify-between text-sm font-semibold mb-2" style={{ color: "#34495E" }}>
                      <span>⏰ Intervalo entre pausas</span>
                      <span style={{ color: "#7FB3D5" }}>{profile.break_interval} min</span>
                    </label>
                    <input
                      type="range" min={5} max={30} step={5}
                      value={profile.break_interval}
                      onChange={(e) => setProfile({ ...profile, break_interval: Number(e.target.value) })}
                      className="w-full"
                      style={{ accentColor: "#7FB3D5" }}
                    />
                  </div>
                )}
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-sm rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: "#fff0f0",
                    border: "1px solid #fca5a5",
                    color: "#dc2626",
                  }}
                >
                  {error}
                </motion.p>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 text-white font-bold rounded-xl transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg,#FFB37B,#ff9450)",
                  boxShadow: "0 4px 14px rgba(255,148,80,0.35)",
                }}
              >
                {loading ? "Registrando..." : "Registrar estudiante"}
                {!loading && <CheckCircle className="w-5 h-5" />}
              </button>
            </motion.div>
          )}

          {/* ── Step 3: Éxito ── */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5 }}
                className="text-7xl mb-6"
              >
                🎉
              </motion.div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: "#34495E" }}>
                ¡Estudiante registrado!
              </h2>
              <p className="mb-6" style={{ color: "#7f8c8d" }}>
                <strong style={{ color: "#34495E" }}>{basic.full_name}</strong> ya está en el sistema.
              </p>

              {/* Chips de estado */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                {!profileWarning && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: "#dcfce7", border: "1.5px solid #86efac" }}
                  >
                    <CheckCircle className="w-3.5 h-3.5" style={{ color: "#15803d" }} />
                    <span className="text-xs font-bold" style={{ color: "#15803d" }}>
                      Perfil sensorial configurado
                    </span>
                  </motion.div>
                )}
                {diagnosisUploaded && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: "#dcfce7", border: "1.5px solid #86efac" }}
                  >
                    <FileCheck2 className="w-3.5 h-3.5" style={{ color: "#15803d" }} />
                    <span className="text-xs font-bold" style={{ color: "#15803d" }}>
                      Diagnóstico adjuntado
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Warnings — perfil o diagnóstico no se guardaron */}
              {profileWarning && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 px-4 py-3 rounded-xl mb-3 text-left"
                  style={{
                    backgroundColor: "#fef9c3",
                    border: "1.5px solid #fde047",
                    color: "#854d0e",
                  }}
                >
                  <span className="flex-shrink-0 mt-0.5">⚠️</span>
                  <p className="text-xs font-semibold">{profileWarning}</p>
                </motion.div>
              )}
              {diagnosisWarning && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 px-4 py-3 rounded-xl mb-3 text-left"
                  style={{
                    backgroundColor: "#fef9c3",
                    border: "1.5px solid #fde047",
                    color: "#854d0e",
                  }}
                >
                  <span className="flex-shrink-0 mt-0.5">⚠️</span>
                  <p className="text-xs font-semibold">{diagnosisWarning}</p>
                </motion.div>
              )}

              {/* Credenciales de acceso del estudiante */}
              {accessCode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="rounded-2xl p-6 mb-8 text-left"
                  style={{
                    backgroundColor: "#E1EFFF",
                    border: "2px solid rgba(127,179,213,0.4)",
                  }}
                >
                  <p
                    className="text-sm font-bold mb-3 text-center uppercase tracking-wide"
                    style={{ color: "#4587a9" }}
                  >
                    🔑 Credenciales de acceso del estudiante
                  </p>
                  <div className="space-y-3">
                    <div
                      className="flex items-center justify-between bg-white rounded-xl px-4 py-3"
                      style={{ border: "1px solid rgba(127,179,213,0.3)" }}
                    >
                      <span className="text-sm font-medium" style={{ color: "#7f8c8d" }}>Documento:</span>
                      <span className="font-mono font-bold" style={{ color: "#34495E" }}>
                        {basic.identity_document}
                      </span>
                    </div>
                    <div
                      className="flex items-center justify-between bg-white rounded-xl px-4 py-3"
                      style={{ border: "1px solid rgba(127,179,213,0.3)" }}
                    >
                      <span className="text-sm font-medium" style={{ color: "#7f8c8d" }}>Código de acceso:</span>
                      <span
                        className="font-mono font-bold text-2xl tracking-widest"
                        style={{ color: "#FFB37B" }}
                      >
                        {accessCode}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mt-3 text-center" style={{ color: "#4587a9" }}>
                    ⚠️ Guarda este código — el estudiante lo necesitará para ingresar a la plataforma.
                  </p>
                </motion.div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => router.push("/tutor")}
                  className="px-6 py-3 text-white font-bold rounded-xl transition-opacity hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg,#FFB37B,#ff9450)",
                    boxShadow: "0 4px 14px rgba(255,148,80,0.35)",
                  }}
                >
                  Volver al panel principal
                </button>
                <button
                  onClick={() => router.push(`/tutor/estudiante/${createdId}`)}
                  className="px-6 py-3 font-semibold rounded-xl transition-colors hover:opacity-80"
                  style={{
                    border: "1px solid #D5DBDB",
                    color: "#34495E",
                    backgroundColor: "#ffffff",
                  }}
                >
                  Ver perfil del estudiante
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Vista previa en vivo del perfil sensorial
// ════════════════════════════════════════════════════════════

function SensoryPreview({
  profile,
  studentName,
}: {
  profile: ProfileForm;
  studentName: string;
}) {
  // ── Tokens visuales derivados del perfil ──
  const fontSize = {
    pequeno: { title: 14, body: 11, option: 12 },
    normal:  { title: 18, body: 14, option: 15 },
    grande:  { title: 24, body: 18, option: 19 },
  }[profile.font_size] || { title: 18, body: 14, option: 15 };

  const contrast = {
    bajo: {
      bg: "#FDF8F2", surface: "#FFFBF5", text: "#7f8c8d", textSoft: "#a0aec0",
      accent: "#FFD9B8", accentText: "#c9591e", border: "#EAE0D0",
    },
    normal: {
      bg: "#ffffff", surface: "#F0F7FB", text: "#34495E", textSoft: "#7f8c8d",
      accent: "#7FB3D5", accentText: "#ffffff", border: "#D5DBDB",
    },
    alto: {
      bg: "#0F172A", surface: "#1E293B", text: "#FFFFFF", textSoft: "#cbd5e1",
      accent: "#FFB37B", accentText: "#0F172A", border: "#475569",
    },
  }[profile.visual_contrast] || {
    bg: "#ffffff", surface: "#F0F7FB", text: "#34495E", textSoft: "#7f8c8d",
    accent: "#7FB3D5", accentText: "#ffffff", border: "#D5DBDB",
  };

  const animDuration = {
    lenta:  3.5,
    normal: 1.8,
    rapida: 0.7,
  }[profile.animation_speed] || 1.8;

  const feedbackInfo = {
    visual:   { emoji: "✨", label: "Visual",   detail: "Estrellas y luces" },
    auditivo: { emoji: "🔊", label: "Auditivo", detail: "Sonidos y voces" },
    mixto:    { emoji: "🎭", label: "Mixto",    detail: "Visual + auditivo" },
  }[profile.feedback_type] || { emoji: "✨", label: "Visual", detail: "" };

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "linear-gradient(135deg, #FFFBF5 0%, #F0F7FB 100%)",
        border: "1.5px solid #D5DBDB",
        boxShadow: "0 4px 24px rgba(127,179,213,0.18)",
      }}
    >
      {/* Header del panel */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "#FFE4D4", color: "#c9591e" }}
        >
          <span style={{ fontSize: 14 }}>👀</span>
        </div>
        <div>
          <p className="text-xs font-extrabold" style={{ color: "#34495E" }}>
            Vista previa en vivo
          </p>
          <p className="text-[10px]" style={{ color: "#a0aec0" }}>
            Así verá la plataforma el estudiante
          </p>
        </div>
      </div>

      {/* Mock del dispositivo */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: contrast.bg,
          border: `2px solid ${contrast.border}`,
          transition: "background-color 0.3s, border-color 0.3s",
        }}
      >
        {/* Barra superior del "dispositivo" */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{
            background: contrast.surface,
            borderBottom: `1px solid ${contrast.border}`,
            transition: "background-color 0.3s",
          }}
        >
          <span className="text-[10px] font-bold" style={{ color: contrast.textSoft }}>
            Aula Global
          </span>
          <div className="flex gap-1">
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: contrast.textSoft }} />
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: contrast.textSoft }} />
          </div>
        </div>

        {/* Contenido de la actividad simulada */}
        <div className="p-4 space-y-3">
          {/* Saludo + nombre */}
          <p
            style={{
              fontSize: fontSize.body, color: contrast.textSoft,
              transition: "color 0.3s, font-size 0.3s",
            }}
          >
            Hola, <strong style={{ color: contrast.text }}>{studentName || "estudiante"}</strong> 👋
          </p>

          {/* Animación que reacciona a animation_speed */}
          <div className="flex items-center justify-center py-2">
            <motion.div
              key={profile.animation_speed}
              animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.08, 1] }}
              transition={{ duration: animDuration, repeat: Infinity, ease: "easeInOut" }}
              style={{ fontSize: 44, display: "inline-block" }}
            >
              🌟
            </motion.div>
          </div>

          {/* Pregunta — usa font-size del perfil */}
          <p
            style={{
              fontSize: fontSize.title, fontWeight: 800, textAlign: "center",
              color: contrast.text,
              transition: "color 0.3s, font-size 0.3s",
              lineHeight: 1.25,
            }}
          >
            ¿Cuánto es 2 + 2?
          </p>

          {/* Opciones — usan font-size + contraste */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {["3", "4", "5"].map((opt, i) => {
              const isCorrect = i === 1;
              return (
                <div
                  key={opt}
                  className="py-2 text-center font-bold rounded-lg"
                  style={{
                    background: isCorrect ? contrast.accent : contrast.surface,
                    color: isCorrect ? contrast.accentText : contrast.text,
                    border: `1.5px solid ${isCorrect ? contrast.accent : contrast.border}`,
                    fontSize: fontSize.option,
                    transition: "all 0.3s",
                  }}
                >
                  {opt}
                </div>
              );
            })}
          </div>

          {/* Feedback type indicator */}
          <div
            className="flex items-center justify-between px-3 py-2 rounded-lg mt-1"
            style={{
              background: contrast.surface,
              border: `1px solid ${contrast.border}`,
              transition: "background-color 0.3s",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span style={{ fontSize: 14 }}>{feedbackInfo.emoji}</span>
              <div>
                <p className="text-[10px] font-bold" style={{ color: contrast.text }}>
                  {feedbackInfo.label}
                </p>
                <p className="text-[9px]" style={{ color: contrast.textSoft }}>
                  {feedbackInfo.detail}
                </p>
              </div>
            </div>

            {/* Barras de volumen — reaccionan a volume_level */}
            <div className="flex items-end gap-0.5" title={`Volumen ${profile.volume_level}/10`}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 3,
                    height: 4 + i * 1.2,
                    borderRadius: 1,
                    background: i < profile.volume_level ? contrast.accent : contrast.border,
                    transition: "background-color 0.2s",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Pausa programada */}
          {profile.needs_breaks && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-1.5 text-center justify-center px-3 py-1.5 rounded-full mx-auto"
              style={{
                background: contrast.accent,
                color: contrast.accentText,
                width: "fit-content",
                fontSize: 11,
                fontWeight: 700,
                transition: "background-color 0.3s",
              }}
            >
              🧘 Pausa cada {profile.break_interval} min
            </motion.div>
          )}
        </div>

        {/* Footer del dispositivo: indicador de duración de sesión */}
        <div
          className="px-3 py-1.5 flex items-center justify-between"
          style={{
            background: contrast.surface,
            borderTop: `1px solid ${contrast.border}`,
            transition: "background-color 0.3s",
          }}
        >
          <span className="text-[10px]" style={{ color: contrast.textSoft }}>
            ⏱ {profile.max_session_min} min
          </span>
          <div
            className="flex-1 mx-2 h-1 rounded-full overflow-hidden"
            style={{ background: contrast.border }}
          >
            <motion.div
              animate={{ width: ["10%", "75%", "10%"] }}
              transition={{ duration: animDuration * 2, repeat: Infinity, ease: "easeInOut" }}
              className="h-full"
              style={{ background: contrast.accent }}
            />
          </div>
          <span className="text-[10px]" style={{ color: contrast.textSoft }}>
            Aprendiendo
          </span>
        </div>
      </div>

      {/* Resumen de configuración */}
      <div className="grid grid-cols-3 gap-1.5 mt-3">
        <PreviewChip label="Contraste" value={
          profile.visual_contrast === "bajo" ? "Suave" :
          profile.visual_contrast === "alto" ? "Alto" : "Normal"
        } />
        <PreviewChip label="Texto" value={
          profile.font_size === "pequeno" ? "Pequeño" :
          profile.font_size === "grande" ? "Grande" : "Normal"
        } />
        <PreviewChip label="Animación" value={
          profile.animation_speed === "lenta" ? "Lenta" :
          profile.animation_speed === "rapida" ? "Rápida" : "Normal"
        } />
      </div>

      <p className="text-[10px] text-center mt-3 italic" style={{ color: "#a0aec0" }}>
        ✏️ Podrás ajustar estos valores luego desde el perfil del estudiante
      </p>
    </div>
  );
}

function PreviewChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-2 py-1 rounded-lg text-center"
      style={{ background: "white", border: "1px solid #D5DBDB" }}
    >
      <p className="text-[8px] uppercase tracking-wide font-bold" style={{ color: "#a0aec0" }}>
        {label}
      </p>
      <p className="text-[10px] font-bold" style={{ color: "#34495E" }}>
        {value}
      </p>
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
      <p className="text-sm font-semibold mb-2" style={{ color: "#34495E" }}>{label}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={
              value === opt.value
                ? {
                    border: "2px solid #7FB3D5",
                    backgroundColor: "#E1EFFF",
                    color: "#4587a9",
                  }
                : {
                    border: "2px solid #D5DBDB",
                    backgroundColor: "#ffffff",
                    color: "#34495E",
                  }
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
