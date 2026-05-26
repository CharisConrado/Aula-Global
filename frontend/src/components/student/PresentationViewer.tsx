"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, ExternalLink, LayoutGrid } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface SlideData { num: number; titulo: string; puntos: string[] }

interface PresentationViewerProps {
  pptxUrl?:  string;       // URL pública del PPTX en Supabase Storage
  slides?:   SlideData[];  // Diapositivas en texto (fallback)
  title:     string;
  onContinue: () => void;
}

// ── Paletas de color para el fallback de texto ────────────────────────────────
const PALETTES = [
  { from: "#7C3AED", to: "#4F46E5" },
  { from: "#0EA5E9", to: "#0369A1" },
  { from: "#10B981", to: "#047857" },
  { from: "#F59E0B", to: "#D97706" },
  { from: "#EC4899", to: "#BE185D" },
  { from: "#14B8A6", to: "#0F766E" },
];

// ═════════════════════════════════════════════════════════════════════════════
export default function PresentationViewer({ pptxUrl, slides = [], title, onContinue }: PresentationViewerProps) {
  // Modo: "iframe" (Office Online) o "slides" (carrusel texto)
  const [mode,       setMode]       = useState<"iframe" | "slides">(pptxUrl ? "iframe" : "slides");
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [timedOut,   setTimedOut]   = useState(false);

  // Carrusel de texto
  const [current,   setCurrent]   = useState(0);
  const [direction, setDirection] = useState(0);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Timeout de 14 s para el iframe de Office Online
  useEffect(() => {
    if (mode !== "iframe" || !pptxUrl) return;
    timeoutRef.current = setTimeout(() => setTimedOut(true), 14_000);
    return () => clearTimeout(timeoutRef.current);
  }, [mode, pptxUrl]);

  // Limpiar timer cuando carga
  const handleIframeLoad = () => {
    clearTimeout(timeoutRef.current);
    setIframeLoaded(true);
    setTimedOut(false);
  };

  // ── Embed URL de Office Online ────────────────────────────────────────────
  const officeUrl = pptxUrl
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(pptxUrl)}`
    : null;

  // ── Carrusel (texto) ──────────────────────────────────────────────────────
  const slide  = slides[current];
  const isLast = current === slides.length - 1;
  const pal    = PALETTES[current % PALETTES.length];

  function goTo(idx: number) {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      {/* ── Cabecera ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📊</span>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Presentación</p>
            <h2 className="font-extrabold text-gray-700 text-lg leading-tight truncate max-w-xs sm:max-w-md">
              {title}
            </h2>
          </div>
        </div>

        {/* Botones de modo + abrir en nueva pestaña */}
        <div className="flex items-center gap-2">
          {pptxUrl && slides.length > 0 && (
            <button
              onClick={() => { setMode(mode === "iframe" ? "slides" : "iframe"); setTimedOut(false); }}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all"
              style={mode === "slides"
                ? { background: "#E1EFFF", border: "1.5px solid #7FB3D5", color: "#4587a9" }
                : { background: "#f8f9fa", border: "1.5px solid #e5e7eb", color: "#9ca3af" }}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {mode === "iframe" ? "Ver texto" : "Ver diapositivas"}
            </button>
          )}
          {pptxUrl && (
            <a
              href={pptxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border"
              style={{ background: "#f8f9fa", border: "1.5px solid #e5e7eb", color: "#9ca3af" }}
              title="Abrir en nueva pestaña"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODO A: Office Online iframe (PPTX tal como está)
      ══════════════════════════════════════════════════════════════════════ */}
      {mode === "iframe" && officeUrl && (
        <div>
          {/* Contenedor iframe */}
          <div
            className="relative rounded-3xl overflow-hidden border-2 border-purple-100"
            style={{ height: 480, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}
          >
            {/* Spinner de carga */}
            {!iframeLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-purple-50 z-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 border-4 border-purple-200 border-t-purple-500 rounded-full mb-4"
                />
                <p className="text-purple-600 font-semibold text-sm">Cargando presentación…</p>
                <p className="text-purple-400 text-xs mt-1">Puede tardar algunos segundos</p>
              </div>
            )}

            {/* Iframe */}
            <iframe
              src={officeUrl}
              title={`Presentación: ${title}`}
              className="w-full h-full"
              onLoad={handleIframeLoad}
              allowFullScreen
              style={{ border: "none" }}
            />
          </div>

          {/* Aviso de timeout */}
          <AnimatePresence>
            {timedOut && !iframeLoaded && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="mt-3 p-4 rounded-2xl flex items-center justify-between gap-4"
                style={{ background: "#fff8ed", border: "1.5px solid #fcd34d" }}
              >
                <div>
                  <p className="text-sm font-bold text-yellow-700">La presentación tarda en cargar</p>
                  <p className="text-xs text-yellow-600">Puedes esperar o ver el contenido en texto</p>
                </div>
                {slides.length > 0 && (
                  <button
                    onClick={() => setMode("slides")}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0"
                    style={{ background: "#f59e0b" }}
                  >
                    Ver en texto
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint */}
          <p className="text-center text-gray-400 text-xs mt-2 mb-4">
            💡 Usa las flechas del visor para navegar entre diapositivas
          </p>

          {/* Botón continuar */}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={onContinue}
            className="w-full py-4 rounded-2xl font-extrabold text-white text-base flex items-center justify-center gap-3"
            style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.40)" }}
          >
            ¡Ya vi la presentación, empezar actividad! 🚀
          </motion.button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODO B: Carrusel de texto (fallback o cuando no hay PPTX)
      ══════════════════════════════════════════════════════════════════════ */}
      {(mode === "slides" || (!pptxUrl && slides.length > 0)) && slides.length > 0 && (
        <div>
          {/* Barra de progreso */}
          <div className="h-2 bg-gray-100 rounded-full mb-4 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${pal.from}, ${pal.to})` }}
              animate={{ width: `${((current + 1) / slides.length) * 100}%` }}
              transition={{ duration: 0.35 }}
            />
          </div>

          {/* Slide */}
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              initial={{ opacity: 0, x: direction * 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -80 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="rounded-3xl relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${pal.from} 0%, ${pal.to} 100%)`,
                minHeight: 260,
                boxShadow: `0 12px 40px ${pal.from}55`,
              }}
            >
              <div className="absolute top-0 right-0 w-56 h-56 rounded-full opacity-20"
                style={{ background: "white", transform: "translate(30%,-30%)" }} />
              <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full opacity-15"
                style={{ background: "white", transform: "translate(-30%,30%)" }} />
              <div className="relative z-10 p-7 sm:p-9">
                <span className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-4 bg-white/20 text-white">
                  Diapositiva {slide?.num} de {slides.length}
                </span>
                {slide?.titulo && (
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-5 leading-tight">
                    {slide.titulo}
                  </h3>
                )}
                {slide?.puntos && slide.puntos.length > 0 && (
                  <ul className="space-y-3">
                    {slide.puntos.map((p, i) => (
                      <motion.li key={i}
                        initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        className="flex items-start gap-3 text-white"
                      >
                        <span className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0"
                          style={{ background: "rgba(255,255,255,0.25)" }}>{i + 1}</span>
                        <span className="text-base sm:text-lg font-medium leading-snug">{p}</span>
                      </motion.li>
                    ))}
                  </ul>
                )}
                {!slide?.titulo && (!slide?.puntos || slide.puntos.length === 0) && (
                  <p className="text-white/70 text-xl font-semibold italic">
                    🖼️ Observa esta diapositiva
                  </p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navegación */}
          <div className="flex items-center justify-between mt-4 gap-3">
            <button onClick={() => goTo(current - 1)} disabled={current === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-semibold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>

            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {slides.map((_, i) => (
                <button key={i} onClick={() => goTo(i)}
                  className="rounded-full transition-all duration-200"
                  style={{ width: i === current ? 24 : 10, height: 10, background: i === current ? pal.from : "#D1D5DB" }}
                />
              ))}
            </div>

            {isLast ? (
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                onClick={onContinue}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-extrabold text-white text-sm"
                style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 18px rgba(255,148,80,0.45)" }}
              >
                ¡Empezar! 🚀
              </motion.button>
            ) : (
              <button onClick={() => goTo(current + 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold text-sm text-white transition-all"
                style={{ background: pal.from }}
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {!isLast && (
            <div className="text-center mt-3">
              <button onClick={() => goTo(slides.length - 1)}
                className="text-xs text-gray-400 hover:text-gray-500 underline transition-colors"
              >
                Saltar al final →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══ Sin contenido ══ */}
      {!pptxUrl && slides.length === 0 && (
        <div className="rounded-3xl p-12 text-center bg-gray-50 border-2 border-dashed border-gray-200 mb-4">
          <span className="text-5xl mb-3 block">📂</span>
          <p className="text-gray-400 font-semibold">No hay presentación para esta actividad</p>
        </div>
      )}
    </motion.div>
  );
}
