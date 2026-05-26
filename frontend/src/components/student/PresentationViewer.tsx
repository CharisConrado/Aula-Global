"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface Slide {
  num: number;
  titulo: string;
  puntos: string[];
}

interface PresentationViewerProps {
  slides: Slide[];
  title: string;
  onContinue: () => void;
}

// Color palettes for slides (cycles through them)
const PALETTES = [
  { from: "#7C3AED", to: "#4F46E5" },   // purple → indigo
  { from: "#0EA5E9", to: "#0369A1" },   // sky → blue
  { from: "#10B981", to: "#047857" },   // emerald → green
  { from: "#F59E0B", to: "#D97706" },   // amber → orange
  { from: "#EC4899", to: "#BE185D" },   // pink → rose
  { from: "#14B8A6", to: "#0F766E" },   // teal → cyan
];

export default function PresentationViewer({ slides, title, onContinue }: PresentationViewerProps) {
  const [current,   setCurrent]   = useState(0);
  const [direction, setDirection] = useState(0);

  const slide  = slides[current];
  const isLast = current === slides.length - 1;
  const pal    = PALETTES[current % PALETTES.length];

  function goTo(idx: number) {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }
  const goPrev = () => goTo(current - 1);
  const goNext = () => goTo(current + 1);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!slides || slides.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <span className="text-6xl mb-4 block">📂</span>
        <p className="text-gray-400 text-lg mb-6">No hay diapositivas para mostrar</p>
        <button
          onClick={onContinue}
          className="px-8 py-3 rounded-2xl font-bold text-white"
          style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}
        >
          Ir a la actividad 🚀
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto select-none"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">📊</span>
          <div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Presentación</p>
            <h2 className="font-extrabold text-gray-700 text-lg leading-tight">{title}</h2>
          </div>
        </div>
        <span className="text-sm font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {current + 1} / {slides.length}
        </span>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      <div className="h-2 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, ${pal.from}, ${pal.to})` }}
          animate={{ width: `${((current + 1) / slides.length) * 100}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>

      {/* ── Slide card ──────────────────────────────────────────────────────── */}
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
          {/* Decorative blobs */}
          <div
            className="absolute top-0 right-0 w-56 h-56 rounded-full opacity-20"
            style={{ background: "white", transform: "translate(30%, -30%)" }}
          />
          <div
            className="absolute bottom-0 left-0 w-36 h-36 rounded-full opacity-15"
            style={{ background: "white", transform: "translate(-30%, 30%)" }}
          />

          <div className="relative z-10 p-7 sm:p-9">
            {/* Slide badge */}
            <span className="inline-block text-xs font-bold px-3 py-1 rounded-full mb-4 bg-white/20 text-white">
              Diapositiva {slide.num}
            </span>

            {/* Title */}
            {slide.titulo && (
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-5 leading-tight drop-shadow-sm">
                {slide.titulo}
              </h3>
            )}

            {/* Bullets */}
            {slide.puntos.length > 0 && (
              <ul className="space-y-3">
                {slide.puntos.map((punto, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.08 }}
                    className="flex items-start gap-3 text-white"
                  >
                    <span
                      className="mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.25)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-base sm:text-lg font-medium leading-snug">{punto}</span>
                  </motion.li>
                ))}
              </ul>
            )}

            {/* Slide with no text content */}
            {!slide.titulo && slide.puntos.length === 0 && (
              <p className="text-white/70 text-xl font-semibold italic">
                🖼️ Observa el contenido de esta diapositiva
              </p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Navigation row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-4 gap-3">
        {/* Prev */}
        <button
          onClick={goPrev}
          disabled={current === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-semibold text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          Anterior
        </button>

        {/* Dot indicators */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="rounded-full transition-all duration-200"
              style={{
                width:  i === current ? 24 : 10,
                height: 10,
                background: i === current ? pal.from : "#D1D5DB",
              }}
            />
          ))}
        </div>

        {/* Next / Continue */}
        {isLast ? (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={onContinue}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl font-extrabold text-white text-sm"
            style={{
              background: "linear-gradient(135deg,#FFB37B,#ff9450)",
              boxShadow: "0 4px 18px rgba(255,148,80,0.45)",
            }}
          >
            ¡Empezar! 🚀
          </motion.button>
        ) : (
          <button
            onClick={goNext}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl font-bold text-sm text-white transition-all"
            style={{ background: pal.from }}
          >
            Siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Skip link */}
      {!isLast && (
        <div className="text-center mt-3">
          <button
            onClick={() => goTo(slides.length - 1)}
            className="text-xs text-gray-400 hover:text-gray-500 underline transition-colors"
          >
            Saltar al final →
          </button>
        </div>
      )}
    </motion.div>
  );
}
