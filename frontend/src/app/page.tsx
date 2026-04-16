"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";

export default function Home() {
  const router = useRouter();
  const { token, user } = useSessionStore();

  useEffect(() => {
    if (!token || !user) {
      router.replace("/login");
      return;
    }

    // Redirigir según rol
    const routes: Record<string, string> = {
      estudiante: "/estudiante",
      tutor: "/tutor",
      profesional: "/admin",
      admin: "/admin",
    };

    router.replace(routes[user.rol] || "/login");
  }, [token, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-calm-50">
      <div className="text-center">
        <div className="animate-pulse">
          <h1 className="text-4xl font-bold text-primary-600 mb-4">
            Aula Global
          </h1>
          <p className="text-gray-500 text-lg">Cargando...</p>
        </div>
      </div>
    </div>
  );
}
