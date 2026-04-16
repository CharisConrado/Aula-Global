"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import { api } from "@/lib/api";

const ROLES = [
  { value: "tutor", label: "Tutor / Familiar", icon: "👨‍👩‍👧" },
  { value: "profesional", label: "Profesional", icon: "🩺" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useSessionStore();

  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    email: "",
    password: "",
    confirmPassword: "",
    rol: "tutor",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    if (form.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setLoading(true);

    try {
      const res = await api.register({
        email: form.email,
        password: form.password,
        nombre: form.nombre,
        apellido: form.apellido,
        rol: form.rol,
      });

      setAuth(res.access_token, {
        user_id: res.user_id,
        email: form.email,
        rol: res.rol as "estudiante" | "tutor" | "profesional" | "admin",
      });

      const routes: Record<string, string> = {
        tutor: "/tutor",
        profesional: "/admin",
        admin: "/admin",
      };
      router.push(routes[res.rol] || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al registrarse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-calm-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-primary-600 mb-2">
            Crear Cuenta
          </h1>
          <p className="text-gray-500">Únete a Aula Global</p>
        </div>

        <div className="card-kid">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Selección de rol */}
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-3">
                Tipo de cuenta
              </label>
              <div className="grid grid-cols-2 gap-3">
                {ROLES.map((rol) => (
                  <button
                    key={rol.value}
                    type="button"
                    onClick={() => updateField("rol", rol.value)}
                    className={`p-4 rounded-kid border-2 text-center transition-all duration-200 ${
                      form.rol === rol.value
                        ? "border-primary-400 bg-primary-50 text-primary-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-2xl block mb-1">{rol.icon}</span>
                    <span className="text-sm font-semibold">{rol.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="nombre"
                  className="block text-sm font-semibold text-gray-600 mb-2"
                >
                  Nombre
                </label>
                <input
                  id="nombre"
                  type="text"
                  value={form.nombre}
                  onChange={(e) => updateField("nombre", e.target.value)}
                  className="input-kid"
                  placeholder="María"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="apellido"
                  className="block text-sm font-semibold text-gray-600 mb-2"
                >
                  Apellido
                </label>
                <input
                  id="apellido"
                  type="text"
                  value={form.apellido}
                  onChange={(e) => updateField("apellido", e.target.value)}
                  className="input-kid"
                  placeholder="García"
                  required
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-gray-600 mb-2"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="input-kid"
                placeholder="tu@correo.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-gray-600 mb-2"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                className="input-kid"
                placeholder="Mínimo 6 caracteres"
                required
                autoComplete="new-password"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-semibold text-gray-600 mb-2"
              >
                Confirmar contraseña
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => updateField("confirmPassword", e.target.value)}
                className="input-kid"
                placeholder="Repite tu contraseña"
                required
                autoComplete="new-password"
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-kid text-sm"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-kid-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Registrando..." : "Crear cuenta"}
            </button>
          </form>

          <p className="text-center text-gray-500 mt-6">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/login"
              className="text-primary-500 font-semibold hover:text-primary-600 transition-colors"
            >
              Inicia sesión
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
