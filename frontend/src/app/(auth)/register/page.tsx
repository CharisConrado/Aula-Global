"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore, type User } from "@/store/sessionStore";
import { api as apiClient } from "@/lib/api";

function AulaGlobalLogo({ size = 72 }: { size?: number }) {
  return (
    <Image
      src="/logo.png"
      alt="Aula Global"
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
      priority
    />
  );
}

export default function RegisterPage() {
  const router      = useRouter();
  const { setAuth } = useSessionStore();

  const [esProfesional, setEsProfesional] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEsProfesional(params.get("rol") === "profesional");
  }, []);

  const [form, setForm] = useState({
    full_name:         "",
    email:             "",
    password:          "",
    confirmPassword:   "",
    phone:             "",
    relationship_type: "familiar",
    specialty:         "",
    license_number:    "",
  });
  const [error, setError]                     = useState("");
  const [loading, setLoading]                 = useState(false);
  const [registered, setRegistered]           = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  const updateField = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const isProfesionalExterno = form.relationship_type === "profesional_externo";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) { setError("Las contraseñas no coinciden"); return; }
    if (form.password.length < 6)               { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    if (!form.full_name.trim())                 { setError("El nombre es obligatorio"); return; }

    if (esProfesional) {
      if (!form.specialty.trim())     { setError("La especialidad es obligatoria"); return; }
      if (!form.license_number.trim()) { setError("El número de licencia es obligatorio"); return; }
    }

    if (!esProfesional && isProfesionalExterno) {
      if (!form.specialty.trim())      { setError("La especialidad es obligatoria para profesional externo"); return; }
      if (!form.license_number.trim()) { setError("El número de licencia es obligatorio para profesional externo"); return; }
    }

    setLoading(true);
    try {
      let res: { access_token: string; token_type: string; rol: string; user_id: string };

      if (esProfesional) {
        res = await apiClient.registerProfessional({
          email:      form.email,
          password:   form.password,
          full_name:  form.full_name.trim(),
          speciality: form.specialty.trim() || undefined,
          phone:      form.phone || undefined,
        });
      } else {
        res = await apiClient.registerTutor({
          email:             form.email,
          password:          form.password,
          full_name:         form.full_name.trim(),
          phone:             form.phone || undefined,
          relationship_type: form.relationship_type || undefined,
        });
      }

      setAuth(res.access_token, { user_id: res.user_id, email: form.email, rol: res.rol as User["rol"] });
      setRegisteredEmail(form.email);
      setRegistered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrarse");
    } finally { setLoading(false); }
  };

  const panelDestino = esProfesional ? "/admin" : "/tutor";

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: "#FDF8F2" }}
    >
      {/* Blobs de fondo */}
      <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, #7FB3D5, transparent 70%)", filter: "blur(56px)" }} />
      <div className="absolute bottom-[-80px] left-[-80px] w-[320px] h-[320px] rounded-full opacity-15 pointer-events-none"
        style={{ background: "radial-gradient(circle, #A2D9A1, transparent 70%)", filter: "blur(48px)" }} />
      <div className="absolute top-[50%] right-[3%] w-[200px] h-[200px] rounded-full opacity-12 pointer-events-none"
        style={{ background: "radial-gradient(circle, #FFB37B, transparent 70%)", filter: "blur(40px)" }} />

      {/* Emojis flotantes */}
      {["📚", "✏️", "🌟", "🎒", "🌱"].map((emoji, i) => (
        <motion.span
          key={i}
          className="absolute text-2xl select-none pointer-events-none opacity-20"
          style={{ top: `${[12, 75, 20, 82, 55][i]}%`, left: `${[8, 5, 88, 90, 94][i]}%` }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3 + i * 0.7, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
        >
          {emoji}
        </motion.span>
      ))}

      <AnimatePresence mode="wait">
        {/* ── Pantalla de éxito ── */}
        {registered ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
            className="w-full max-w-md relative z-10"
          >
            <div
              className="rounded-[1.5rem] p-8 text-center"
              style={{
                background: "white",
                border: "1.5px solid #D5DBDB",
                boxShadow: "0 4px 32px rgba(127,179,213,0.14), 0 1px 8px rgba(52,73,94,0.06)",
              }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 280, damping: 20 }}
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: "linear-gradient(135deg, #A2D9A1, #7dc97c)", boxShadow: "0 4px 20px rgba(162,217,161,0.4)" }}
              >
                <span className="text-4xl">🎉</span>
              </motion.div>

              <h2 className="text-2xl font-extrabold mb-2" style={{ color: "#34495E" }}>
                ¡Bienvenido a Aula Global!
              </h2>
              <p className="text-sm mb-5" style={{ color: "#7f8c8d" }}>
                Hemos enviado un correo de confirmación a{" "}
                <strong style={{ color: "#34495E" }}>{registeredEmail}</strong>.{" "}
                Revisa tu bandeja de entrada.
              </p>

              <div
                className="rounded-xl px-4 py-3 text-sm text-left mb-6 flex items-start gap-2"
                style={{ background: "#E1EFFF", color: "#4587a9" }}
              >
                <span className="flex-shrink-0">💡</span>
                <span>Ya puedes usar la plataforma. Confirma tu correo cuando lo recibas para mantener tu cuenta activa.</span>
              </div>

              <button
                onClick={() => router.push(panelDestino)}
                className="w-full py-3.5 rounded-xl font-bold text-white text-base"
                style={{
                  background: "linear-gradient(135deg, #FFB37B, #ff9450)",
                  boxShadow: "0 4px 18px rgba(255,148,80,0.38)",
                }}
              >
                Ir a mi panel →
              </button>
            </div>
          </motion.div>
        ) : (
          /* ── Formulario de registro ── */
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-lg relative z-10"
          >
            {/* Logo + título */}
            <div className="text-center mb-6">
              <div className="flex justify-center mb-3">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <AulaGlobalLogo size={60} />
                </motion.div>
              </div>
              <h1 className="text-3xl font-extrabold mb-1" style={{ color: "#4587a9" }}>
                Crear cuenta
              </h1>
              <p className="text-sm" style={{ color: "#7f8c8d" }}>
                {esProfesional ? "Regístrate como Profesional de apoyo" : "Únete a Aula Global como Tutor"}
              </p>
            </div>

            <div
              className="rounded-[1.5rem] p-7"
              style={{
                background: "white",
                border: `1.5px solid ${esProfesional ? "#7FB3D566" : "#D5DBDB"}`,
                boxShadow: "0 4px 32px rgba(127,179,213,0.14), 0 1px 8px rgba(52,73,94,0.06)",
              }}
            >
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Badge de rol */}
                <div
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold flex items-center gap-2"
                  style={{
                    background: esProfesional ? "#E1EFFF" : "#FFF4EB",
                    color:      esProfesional ? "#4587a9"  : "#c97a3a",
                  }}
                >
                  <span>{esProfesional ? "🩺" : "👨‍👩‍👧"}</span>
                  <span>{esProfesional ? "Profesional de apoyo terapéutico" : "Tutor / Familiar del estudiante"}</span>
                </div>

                {/* Nombre */}
                <div>
                  <label htmlFor="full_name" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                    Nombre completo
                  </label>
                  <input id="full_name" type="text" value={form.full_name}
                    onChange={(e) => updateField("full_name", e.target.value)}
                    className="input-kid" placeholder="María García López" required />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                    Correo electrónico
                  </label>
                  <input id="email" type="email" value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    className="input-kid" placeholder="tu@correo.com" required autoComplete="email" />
                </div>

                {/* Teléfono */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                    Teléfono <span className="font-normal" style={{ color: "#a0aec0" }}>(opcional)</span>
                  </label>
                  <input id="phone" type="tel" value={form.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    className="input-kid" placeholder="+57 300 000 0000" />
                </div>

                {/* ── Campos PROFESIONAL ── */}
                {esProfesional && (
                  <>
                    <div>
                      <label htmlFor="specialty" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                        Especialidad
                      </label>
                      <input id="specialty" type="text" value={form.specialty}
                        onChange={(e) => updateField("specialty", e.target.value)}
                        className="input-kid" placeholder="Psicología, Fonoaudiología, Terapia Ocupacional…"
                        required />
                    </div>
                    <div>
                      <label htmlFor="license_number" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                        Número de licencia / tarjeta profesional
                      </label>
                      <input id="license_number" type="text" value={form.license_number}
                        onChange={(e) => updateField("license_number", e.target.value)}
                        className="input-kid" placeholder="TP-12345678"
                        required />
                    </div>
                  </>
                )}

                {/* ── Campos TUTOR ── */}
                {!esProfesional && (
                  <>
                    <div>
                      <label htmlFor="relationship_type" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                        Relación con el estudiante
                      </label>
                      <select id="relationship_type" value={form.relationship_type}
                        onChange={(e) => updateField("relationship_type", e.target.value)}
                        className="input-kid">
                        <option value="familiar">Familiar (padre, madre, hermano…)</option>
                        <option value="cuidador">Cuidador / Docente</option>
                        <option value="profesional_externo">Profesional externo</option>
                      </select>
                    </div>

                    {/* Campos extra si es profesional externo */}
                    <AnimatePresence>
                      {isProfesionalExterno && (
                        <motion.div
                          key="ext-fields"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden space-y-4"
                        >
                          <div
                            className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
                            style={{ background: "#E1EFFF", color: "#4587a9" }}
                          >
                            <span className="flex-shrink-0">🩺</span>
                            <span>Ingresa tu especialidad y número de licencia para validar tus credenciales.</span>
                          </div>
                          <div>
                            <label htmlFor="specialty2" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                              Especialidad
                            </label>
                            <input id="specialty2" type="text" value={form.specialty}
                              onChange={(e) => updateField("specialty", e.target.value)}
                              className="input-kid" placeholder="Psicología, Fonoaudiología…"
                              required={isProfesionalExterno} />
                          </div>
                          <div>
                            <label htmlFor="license2" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                              Número de licencia / tarjeta profesional
                            </label>
                            <input id="license2" type="text" value={form.license_number}
                              onChange={(e) => updateField("license_number", e.target.value)}
                              className="input-kid" placeholder="TP-12345678"
                              required={isProfesionalExterno} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {/* Contraseñas */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="password" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Contraseña
                    </label>
                    <input id="password" type="password" value={form.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      className="input-kid" placeholder="Mín. 6 caracteres" required autoComplete="new-password" />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Confirmar
                    </label>
                    <input id="confirmPassword" type="password" value={form.confirmPassword}
                      onChange={(e) => updateField("confirmPassword", e.target.value)}
                      className="input-kid" placeholder="Repite aquí" required autoComplete="new-password" />
                  </div>
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl px-4 py-3 text-sm font-medium"
                    style={{ background: "#fff0f0", border: "1px solid #fca5a5", color: "#dc2626" }}>
                    ⚠️ {error}
                  </motion.div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-base transition-all duration-200 disabled:opacity-50 mt-1"
                  style={{
                    background: loading
                      ? (esProfesional ? "#9fc0d4" : "#ffba7f")
                      : (esProfesional
                          ? "linear-gradient(135deg, #7FB3D5, #5a9ec2)"
                          : "linear-gradient(135deg, #FFB37B, #ff9450)"),
                    boxShadow: esProfesional
                      ? "0 4px 18px rgba(127,179,213,0.38)"
                      : "0 4px 18px rgba(255,148,80,0.38)",
                  }}>
                  {loading ? "Registrando…" : "Crear cuenta →"}
                </button>
              </form>

              <p className="text-center text-sm mt-5" style={{ color: "#7f8c8d" }}>
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="font-bold hover:underline" style={{ color: "#5a9ec2" }}>
                  Inicia sesión
                </Link>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
