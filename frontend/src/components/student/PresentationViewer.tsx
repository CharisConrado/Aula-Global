"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Maximize2, Minimize2 } from "lucide-react";

interface PresentationViewerProps {
  url: string;
  title: string;
  onContinue: () => void;
}

export default function PresentationViewer({ url, title, onContinue }: PresentationViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [loaded,   setLoaded]   = useState(false);

  // Microsoft Office Online embed viewer
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-4xl mx-auto"
    >
      {/* Header card */}
      <div
        className="rounded-3xl p-5 mb-4 flex items-center gap-4"
        style={{
          background: "linear-gradient(135deg,#667eea 0%,#764ba2 100%)",
          boxShadow: "0 8px 32px rgba(102,126,234,0.35)",
        }}
      >
        <span className="text-4xl">📊</span>
        <div className="flex-1 min-w-0">
          <p className="text-white/80 text-sm font-semibold">Antes de empezar, revisa la presentación</p>
          <h2 className="text-white font-extrabold text-lg truncate">{title}</h2>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors text-white"
          title={expanded ? "Reducir" : "Pantalla completa"}
        >
          {expanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Iframe container */}
      <div
        className="rounded-3xl overflow-hidden border-2 border-purple-200 bg-gray-50 relative transition-all duration-300"
        style={{ height: expanded ? "75vh" : "420px", boxShadow: "0 4px 24px rgba(0,0,0,0.10)" }}
      >
        {/* Loading overlay */}
        {!loaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-purple-50 z-10">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-4 border-purple-200 border-t-purple-500 rounded-full mb-4"
            />
            <p className="text-purple-600 font-semibold text-sm">Cargando diapositivas...</p>
          </div>
        )}
        <iframe
          src={embedUrl}
          title={`Presentación: ${title}`}
          className="w-full h-full"
          onLoad={() => setLoaded(true)}
          style={{ border: "none" }}
          allowFullScreen
        />
      </div>

      {/* Hint */}
      <p className="text-center text-gray-400 text-xs mt-3 mb-4">
        💡 Puedes navegar las diapositivas con las flechas dentro del visor
      </p>

      {/* Continue button */}
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onContinue}
        className="w-full py-4 rounded-2xl font-extrabold text-white text-base flex items-center justify-center gap-3"
        style={{
          background: "linear-gradient(135deg,#FFB37B,#ff9450)",
          boxShadow: "0 4px 20px rgba(255,148,80,0.40)",
        }}
      >
        ¡Ya vi la presentación, empezar actividad!
        <ChevronRight className="w-5 h-5" />
      </motion.button>
    </motion.div>
  );
}
