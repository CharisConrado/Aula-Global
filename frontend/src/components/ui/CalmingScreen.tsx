"use client";

import { motion } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";

/**
 * Pantalla calmante que se muestra durante pausas visuales.
 * Animación de respiración suave, colores pastel, sin distracciones.
 */
export default function CalmingScreen() {
  const { showCalmingScreen, setShowCalmingScreen } = useSessionStore();

  if (!showCalmingScreen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
      className="calming-screen"
    >
      <div className="text-center">
        {/* Círculo de respiración */}
        <motion.div
          className="w-48 h-48 mx-auto mb-8 rounded-full bg-gradient-to-br from-blue-200 to-green-200"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.p
          className="text-kid-xl text-gray-600 font-semibold mb-4"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          Respira conmigo...
        </motion.p>

        <motion.p
          className="text-kid-base text-gray-400 mb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          Inhala... Exhala... Todo está bien
        </motion.p>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 5 }}
          onClick={() => setShowCalmingScreen(false)}
          className="btn-kid-calm text-lg"
        >
          Estoy listo para continuar
        </motion.button>
      </div>
    </motion.div>
  );
}
