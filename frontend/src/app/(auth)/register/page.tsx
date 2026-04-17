"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSessionStore, type User } from "@/store/sessionStore";
import { api as apiClient } from "@/lib/api";

const ROLES = [
  { value: "tutor",       label: "Tutor / Familiar",  icon: "👨‍👩‍👧" },
  { value: "profesional", label: "Profesional",        icon: "🩺" },
];

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useSessionStore();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    rol: "tutor",
    // Campos opcionales según el rol
    phone: "",
    specialty: "",       // solo profesional
    relationship_type: "familiar",   // valores válidos: familiar | cuidador | profesional_externo
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
    if (!form.full_name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    setLoading(true);

    try {
      let res: { access_token: string; token_type: string; rol: string; user_id: string };

      if (form.rol === "tutor") {
        res = await apiClient.registerTutor({
          email:             form.email,
          password:          form.password,
          full_name:         form.full_name.trim(),
          phone:             form.phone || undefined,
          relationship_type: form.relationship_type || undefined,
        });
      } else {
        res = await apiClient.registerProfessional({
          email:      form.email,
          password:   form.password,
          full_name:  form.full_name.trim(),
          speciality: form.specialty || undefined,
          phone:      form.phone || undefined,
        });
      }

      setAuth(res.access_token, {
        user_id: res.user_id,
        email:   form.email,
        rol:     res.rol as User["rol"],
      });

      const routes: Record<string, string> = {
        tutor:        "/tutor",
        profesional:  "/admin",
        admin:        "/admin",
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
            {/* Tipo de cuenta */}
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

            {/* Nombre completo */}
            <div>
              <label
                htmlFor="full_name"
                className="block text-sm font-semibold text-gray-600 mb-2"
              >
                Nombre completo
              </label>
              <input
                id="full_name"
                type="text"
                value={form.full_name}
                onChange={(e) => updateField("full_name", e.target.value)}
                className="input-kid"
                placeholder="María García López"
                required
              />
            </div>

            {/* Email */}
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

            {/* Teléfono (opcional) */}
            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-semibold text-gray-600 mb-2"
              >
                Teléfono{" "}
                <span className="font-normal text-gray-400">(opcional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className="input-kid"
                placeholder="+57 300 000 0000"
              />
            </div>

            {/* Campo específico según rol */}
            {form.rol === "profesional" ? (
              <div>
                <label
                  htmlFor="specialty"
                  className="block text-sm font-semibold text-gray-600 mb-2"
                >
                  Especialidad{" "}
                  <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  id="specialty"
                  type="text"
                  value={form.specialty}
                  onChange={(e) => updateField("specialty", e.target.value)}
                  className="input-kid"
                  placeholder="Psicología, Fonoaudiología, etc."
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="relationship_type"
                  className="block text-sm font-semibold text-gray-600 mb-2"
                >
                  Relación con el estudiante
                </label>
                <select
                  id="relationship_type"
                  value={form.relationship_type}
                  onChange={(e) =>
                    updateField("relationship_type", e.target.value)
                  }
                  className="input-kid"
                >
                  <option value="familiar">Familiar (padre, madre, hermano…)</option>
                  <option value="cuidador">Cuidador / Docente</option>
                  <option value="profesional_externo">Profesional externo</option>
                </select>
              </div>
            )}

            {/* Contraseña */}
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
