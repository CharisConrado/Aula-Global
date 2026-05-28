"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api } from "@/lib/api";

type LoginTab = "tutor" | "profesional" | "estudiante" | "admin";

const ROLE_CARDS: {
  id: LoginTab;
  icon: string;
  label: string;
  desc: string;
  color: string;
  light: string;
  shadow: string;
}[] = [
  { id: "tutor",       icon: "👨‍👩‍👧", label: "Tutor",        desc: "Familiar o cuidador",   color: "#FFB37B", light: "#FFF4EB", shadow: "rgba(255,179,123,0.35)" },
  { id: "profesional", icon: "🩺",    label: "Profesional", desc: "Apoyo terapéutico",     color: "#7FB3D5", light: "#E1EFFF", shadow: "rgba(127,179,213,0.35)" },
  { id: "estudiante",  icon: "🎒",    label: "Estudiante",  desc: "Acceso con código",     color: "#A2D9A1", light: "#EBF8EB", shadow: "rgba(162,217,161,0.35)" },
  { id: "admin",       icon: "⚙️",    label: "Admin",       desc: "Gestión del sistema",   color: "#b0b8c1", light: "#F4F6F7", shadow: "rgba(127,140,141,0.25)" },
];

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

function ErrorBox({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl px-4 py-3 text-sm font-medium"
      style={{ background: "#fff0f0", border: "1px solid #fca5a5", color: "#dc2626" }}
    >
      ⚠️ {message}
    </motion.div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, setActiveStudentId } = useSessionStore();

  const [tab, setTab] = useState<LoginTab | null>(null);

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [document_, setDocument]    = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminCode, setAdminCode]   = useState("");
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);

  const selectTab = (id: LoginTab) => {
    setTab((prev) => (prev === id ? null : id));
    setError("");
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await api.login(email, password);
      setAuth(res.access_token, {
        user_id: res.user_id,
        email,
        rol: res.rol as "estudiante" | "tutor" | "profesional" | "admin",
      });
      const routes: Record<string, string> = {
        tutor: "/tutor", profesional: "/profesional", admin: "/admin", estudiante: "/estudiante",
      };
      router.push(routes[res.rol] || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally { setLoading(false); }
  };

  const handleEstudianteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await api.loginStudent(document_.trim(), accessCode.trim().toUpperCase());
      setAuth(res.access_token, { user_id: res.user_id, email: res.user_id, rol: "estudiante" });
      setActiveStudentId(res.user_id);
      router.push("/estudiante");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Documento o código incorrecto");
    } finally { setLoading(false); }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/login/admin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: adminEmail.trim(), access_code: adminCode.trim().toUpperCase() }),
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Error al iniciar sesión");
      }
      const data = await res.json();
      setAuth(data.access_token, { user_id: data.user_id, email: adminEmail, rol: "admin" });
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally { setLoading(false); }
  };

  const activeCard = ROLE_CARDS.find((c) => c.id === tab);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: "#FDF8F2" }}
    >
      {/* Blobs decorativos */}
      <div
        className="absolute top-[-80px] right-[-80px] w-[340px] h-[340px] rounded-full opacity-25 pointer-events-none"
        style={{ background: "radial-gradient(circle, #7FB3D5, transparent 70%)", filter: "blur(48px)" }}
      />
      <div
        className="absolute bottom-[-60px] left-[-60px] w-[280px] h-[280px] rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, #A2D9A1, transparent 70%)", filter: "blur(40px)" }}
      />
      <div
        className="absolute top-[40%] left-[5%] w-[180px] h-[180px] rounded-full opacity-15 pointer-events-none"
        style={{ background: "radial-gradient(circle, #FFB37B, transparent 70%)", filter: "blur(36px)" }}
      />

      {/* Emojis flotantes decorativos */}
      {["📚", "✏️", "🌟", "🎒", "🌱"].map((emoji, i) => (
        <motion.span
          key={i}
          className="absolute text-2xl select-none pointer-events-none opacity-20"
          style={{
            top:  `${[12, 75, 20, 82, 55][i]}%`,
            left: `${[8,   5, 88, 90, 94][i]}%`,
          }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3 + i * 0.7, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
        >
          {emoji}
        </motion.span>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-sm sm:max-w-2xl relative z-10"
      >
        {/* Logo + título */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="flex justify-center mb-3">
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <AulaGlobalLogo size={68} />
            </motion.div>
          </div>
          <h1 className="text-4xl font-extrabold mb-1 tracking-tight" style={{ color: "#4587a9" }}>
            Aula Global
          </h1>
          <p className="text-sm font-medium" style={{ color: "#7f8c8d" }}>
            Plataforma Educativa Adaptativa
          </p>
        </motion.div>

        {/* Tarjetas de selección de rol */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {ROLE_CARDS.map((card, i) => {
            const selected = tab === card.id;
            return (
              <motion.button
                key={card.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.15 + i * 0.07 }}
                onClick={() => selectTab(card.id)}
                className="flex flex-col items-center gap-2 rounded-2xl transition-all duration-200 text-center"
                style={{
                  padding: "3.5rem 0.75rem",
                  minHeight: "260px",
                  ...(selected
                    ? {
                        background: card.light,
                        border: `2.5px solid ${card.color}`,
                        boxShadow: `0 6px 24px ${card.shadow}`,
                        transform: "translateY(-3px)",
                      }
                    : {
                        background: "white",
                        border: "2px solid #E8ECEF",
                        boxShadow: "0 2px 8px rgba(52,73,94,0.06)",
                      }),
                }}
              >
                <span
                  className="text-5xl leading-none mb-2"
                  style={{ filter: selected ? "none" : "grayscale(20%)" }}
                >
                  {card.icon}
                </span>

                <span
                  className="text-sm font-extrabold leading-tight"
                  style={{ color: selected ? card.color : "#34495E" }}
                >
                  {card.label}
                </span>
                <span
                  className="text-xs leading-tight"
                  style={{ color: selected ? card.color + "bb" : "#a0aec0" }}
                >
                  {card.desc}
                </span>

                {selected && (
                  <motion.div
                    layoutId="card-dot"
                    className="w-2 h-2 rounded-full mt-1"
                    style={{ background: card.color }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Formulario expandible */}
        <AnimatePresence mode="wait">
          {tab !== null && (
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="rounded-[1.5rem] p-7 relative max-w-md mx-auto"
              style={{
                background: "white",
                border: `1.5px solid ${activeCard ? activeCard.color + "55" : "#D5DBDB"}`,
                boxShadow: `0 4px 32px ${activeCard ? activeCard.shadow : "rgba(127,179,213,0.14)"}, 0 1px 8px rgba(52,73,94,0.06)`,
              }}
            >
              {/* Encabezado del formulario */}
              <div className="flex items-center gap-2.5 mb-5 pb-4" style={{ borderBottom: "1px solid #F0F4F7" }}>
                {activeCard && (
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                    style={{ background: activeCard.light }}
                  >
                    {activeCard.icon}
                  </div>
                )}
                <div>
                  <h2 className="text-sm font-extrabold leading-tight" style={{ color: "#34495E" }}>
                    {tab === "tutor"       && "Ingresar como Tutor"}
                    {tab === "profesional" && "Ingresar como Profesional"}
                    {tab === "estudiante"  && "Ingresar como Estudiante"}
                    {tab === "admin"       && "Ingresar como Administrador"}
                  </h2>
                  <p className="text-xs" style={{ color: "#a0aec0" }}>
                    {activeCard?.desc}
                  </p>
                </div>
              </div>

              {/* Formulario Tutor / Profesional — email + password */}
              {(tab === "tutor" || tab === "profesional") && (
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Correo electrónico
                    </label>
                    <input
                      id="email" type="email" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-kid" placeholder="tu@correo.com"
                      required autoComplete="email"
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Contraseña
                    </label>
                    <input
                      id="password" type="password" value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-kid" placeholder="••••••••"
                      required autoComplete="current-password"
                    />
                  </div>

                  {error && <ErrorBox message={error} />}

                  <button
                    type="submit" disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold text-white text-base transition-all duration-200 disabled:opacity-50 mt-1"
                    style={{
                      background: loading
                        ? "#ffba7f"
                        : "linear-gradient(135deg, #FFB37B, #ff9450)",
                      boxShadow: "0 4px 18px rgba(255,148,80,0.38)",
                    }}
                  >
                    {loading ? "Ingresando…" : "Ingresar →"}
                  </button>

                  <p className="text-center text-sm mt-1" style={{ color: "#7f8c8d" }}>
                    ¿No tienes cuenta?{" "}
                    <Link
                      href={tab === "profesional" ? "/register?rol=profesional" : "/register"}
                      className="font-bold hover:underline"
                      style={{ color: "#5a9ec2" }}
                    >
                      Regístrate aquí
                    </Link>
                  </p>
                </form>
              )}

              {/* Formulario Estudiante */}
              {tab === "estudiante" && (
                <form onSubmit={handleEstudianteSubmit} className="space-y-4">
                  <div
                    className="rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2"
                    style={{ background: "#EBF8EB", color: "#4a9e49" }}
                  >
                    <span className="text-base">🔑</span>
                    <span>
                      Ingresa con tu <strong>documento</strong> y el{" "}
                      <strong>código de acceso</strong> que te dio tu tutor.
                    </span>
                  </div>

                  <div>
                    <label htmlFor="documento" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Documento de identidad
                    </label>
                    <input
                      id="documento" type="text" value={document_}
                      onChange={(e) => setDocument(e.target.value)}
                      className="input-kid" placeholder="12345678"
                      required autoComplete="off"
                    />
                  </div>
                  <div>
                    <label htmlFor="codigo" className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Código de acceso
                    </label>
                    <input
                      id="codigo" type="text" value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                      className="input-kid text-center text-xl font-mono tracking-[0.3em] uppercase"
                      placeholder="XXXXXXXX" maxLength={8}
                      required autoComplete="off" autoCapitalize="characters"
                    />
                  </div>

                  {error && <ErrorBox message={error} />}

                  <button
                    type="submit" disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold text-white text-base transition-all duration-200 disabled:opacity-50 mt-1"
                    style={{
                      background: loading ? "#8ccf8b" : "linear-gradient(135deg, #A2D9A1, #7dc97c)",
                      boxShadow: "0 4px 18px rgba(162,217,161,0.40)",
                    }}
                  >
                    {loading ? "Verificando…" : "¡Entrar a clases! 🚀"}
                  </button>
                </form>
              )}

              {/* Formulario Admin */}
              {tab === "admin" && (
                <form onSubmit={handleAdminSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Correo electrónico
                    </label>
                    <input
                      type="email" value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="input-kid" placeholder="admin@aulaglobal.edu.co"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: "#34495E" }}>
                      Código de acceso
                    </label>
                    <input
                      type="text" value={adminCode}
                      onChange={(e) => setAdminCode(e.target.value.toUpperCase())}
                      className="input-kid font-mono tracking-widest"
                      placeholder="ADMIN2026" required maxLength={10}
                    />
                    <p className="text-xs mt-1" style={{ color: "#a0aec0" }}>
                      El código fue asignado por el super administrador
                    </p>
                  </div>

                  {error && <ErrorBox message={error} />}

                  <button
                    type="submit" disabled={loading}
                    className="w-full py-3.5 rounded-xl font-bold text-white text-base transition-all duration-200 disabled:opacity-50 mt-1"
                    style={{
                      background: loading ? "#b5a8e0" : "linear-gradient(135deg, #9b8ecb, #7b6db5)",
                      boxShadow: loading ? "none" : "0 4px 18px rgba(155,142,203,0.38)",
                    }}
                  >
                    {loading ? "Verificando…" : "Ingresar como administrador →"}
                  </button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {tab === null && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm mt-2"
            style={{ color: "#a0aec0" }}
          >
            Selecciona tu rol para iniciar sesión
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
