"use client";

/**
 * CompletarGame — Aula Global
 *
 * Actividad de "rellenar el hueco": el estudiante lee cada oración con
 * un espacio en blanco (___ ) y escribe la palabra que falta.
 *
 * Flujo:
 *  1. Llena los huecos   →  clic "Comprobar"
 *  2. Ve el resultado (verde ✓ / rojo ✗ + respuesta correcta)
 *  3. Clic "Continuar"  →  llama onComplete(nota)
 */

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, ChevronRight, Lightbulb } from "lucide-react";

interface Oracion {
  texto:    string;   // Ej: "El cielo es de color ___"
  respuesta: string;  // Ej: "azul"
}

interface Props {
  oraciones:       Oracion[];
  instruccion?:    string;
  isHighContrast?: boolean;
  onComplete:      (nota: number) => void;
}

// Normaliza respuesta para comparación flexible (sin acentos, minúsculas, trim)
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Divide el texto de la oración en partes: texto antes de ___ y texto después
function splitSentence(texto: string): [string, string] {
  const idx = texto.indexOf("___");
  if (idx === -1) return [texto, ""];
  return [texto.slice(0, idx), texto.slice(idx + 3)];
}

export default function CompletarGame({
  oraciones,
  instruccion,
  isHighContrast = false,
  onComplete,
}: Props) {
  const [answers,  setAnswers]  = useState<string[]>(() => oraciones.map(() => ""));
  const [checked,  setChecked]  = useState(false);
  const inputRefs  = useRef<(HTMLInputElement | null)[]>([]);

  const results = oraciones.map((o, i) =>
    normalize(answers[i]) === normalize(o.respuesta)
  );
  const correctCount = results.filter(Boolean).length;
  const total        = oraciones.length;
  const pct          = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const nota         = total > 0 ? Math.round((correctCount / total) * 5 * 10) / 10 : 0;

  const handleCheck = () => {
    if (answers.some((a) => !a.trim())) return; // no revisar si hay vacíos
    setChecked(true);
  };

  const handleUpdate = (i: number, val: string) => {
    const n = [...answers];
    n[i] = val;
    setAnswers(n);
  };

  // Permite navegar con Enter entre inputs
  const handleKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = inputRefs.current[i + 1];
      if (next) next.focus();
      else handleCheck();
    }
  };

  const allFilled = answers.every((a) => a.trim().length > 0);

  // ── Estilos según modo ──────────────────────────────────────────────
  const cardBg     = isHighContrast ? "#1E293B" : "white";
  const cardBorder = isHighContrast ? "#334155" : "#E5E7EB";
  const textMain   = isHighContrast ? "#F1F5F9" : "#34495E";
  const textMuted  = isHighContrast ? "#94A3B8" : "#9CA3AF";
  const bgPage     = isHighContrast ? "#0F172A" : "transparent";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ background: bgPage }}
      className="max-w-2xl mx-auto"
    >
      {/* ── Instrucción ── */}
      <div
        className="rounded-2xl p-5 mb-6"
        style={{
          background: isHighContrast ? "#1E3A5F" : "#EFF6FF",
          border:     `2px solid ${isHighContrast ? "#60A5FA" : "#BFDBFE"}`,
        }}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">✏️</span>
          <div>
            <p className="font-extrabold text-sm mb-1"
              style={{ color: isHighContrast ? "#93C5FD" : "#1D4ED8" }}>
              Completa las oraciones
            </p>
            <p className="text-sm font-medium"
              style={{ color: isHighContrast ? "#BFDBFE" : "#374151" }}>
              {instruccion || "Escribe la palabra que falta en cada oración. Luego pulsa Comprobar."}
            </p>
          </div>
        </div>
      </div>

      {/* ── Oraciones ── */}
      <div className="space-y-4 mb-6">
        {oraciones.map((o, i) => {
          const [before, after] = splitSentence(o.texto);
          const isCorrect = results[i];
          const isEmpty   = !answers[i].trim();

          // Color del input según estado
          let inputBg     = isHighContrast ? "#0F172A" : "#F9FAFB";
          let inputBorder = isHighContrast ? "#475569" : "#D1D5DB";
          let inputColor  = isHighContrast ? "#F1F5F9" : "#374151";

          if (checked) {
            if (isCorrect) {
              inputBg     = isHighContrast ? "#14532D" : "#DCFCE7";
              inputBorder = "#22C55E";
              inputColor  = isHighContrast ? "#86EFAC" : "#15803D";
            } else {
              inputBg     = isHighContrast ? "#7F1D1D" : "#FEE2E2";
              inputBorder = "#EF4444";
              inputColor  = isHighContrast ? "#FCA5A5" : "#B91C1C";
            }
          }

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl p-5"
              style={{
                background: cardBg,
                border:     `2px solid ${checked
                  ? (isCorrect ? "#22C55E" : "#EF4444")
                  : cardBorder}`,
                boxShadow: isHighContrast
                  ? "none"
                  : "0 2px 8px rgba(0,0,0,0.06)",
              }}
            >
              {/* Número */}
              <div className="flex items-start gap-3">
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5"
                  style={{
                    background: isHighContrast ? "#1E3A5F" : "#E1EFFF",
                    color:      isHighContrast ? "#60A5FA" : "#1D4ED8",
                  }}
                >
                  {i + 1}
                </span>

                {/* Oración con input inline */}
                <div className="flex-1">
                  <p
                    className="text-base font-semibold leading-relaxed flex flex-wrap items-center gap-x-1 gap-y-2"
                    style={{ color: textMain }}
                  >
                    <span>{before}</span>

                    {/* Input del hueco */}
                    <input
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      value={answers[i]}
                      onChange={(e) => !checked && handleUpdate(i, e.target.value)}
                      onKeyDown={(e) => !checked && handleKeyDown(e, i)}
                      disabled={checked}
                      placeholder="___"
                      className="rounded-lg px-3 py-1 text-base font-bold text-center outline-none transition-all"
                      style={{
                        background:  inputBg,
                        border:      `2px solid ${inputBorder}`,
                        color:       inputColor,
                        minWidth:    120,
                        width:       Math.max(120, (answers[i]?.length || 3) * 12),
                      }}
                    />

                    {after && <span>{after}</span>}
                  </p>

                  {/* Feedback: respuesta correcta si erró */}
                  <AnimatePresence>
                    {checked && !isCorrect && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="flex items-center gap-2 mt-2"
                      >
                        <Lightbulb className="w-3.5 h-3.5 flex-shrink-0"
                          style={{ color: isHighContrast ? "#FCD34D" : "#D97706" }} />
                        <span
                          className="text-xs font-bold"
                          style={{ color: isHighContrast ? "#FCD34D" : "#D97706" }}
                        >
                          Respuesta correcta: <span className="underline">{o.respuesta}</span>
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Icono correcto/incorrecto */}
                {checked && (
                  <div className="flex-shrink-0 mt-0.5">
                    {isCorrect
                      ? <CheckCircle2 className="w-6 h-6" style={{ color: "#22C55E" }} />
                      : <XCircle      className="w-6 h-6" style={{ color: "#EF4444" }} />}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Resultado global (solo al revisar) ── */}
      <AnimatePresence>
        {checked && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="rounded-2xl p-5 mb-6 text-center"
            style={{
              background: isHighContrast
                ? (pct >= 70 ? "#14532D" : pct >= 40 ? "#78350F" : "#7F1D1D")
                : (pct >= 70 ? "#F0FDF4" : pct >= 40 ? "#FFFBEB" : "#FEF2F2"),
              border: `2px solid ${pct >= 70 ? "#22C55E" : pct >= 40 ? "#F59E0B" : "#EF4444"}`,
            }}
          >
            <p className="text-4xl font-black mb-1"
              style={{ color: pct >= 70 ? "#22C55E" : pct >= 40 ? "#F59E0B" : "#EF4444" }}>
              {correctCount}/{total}
            </p>
            <p className="font-bold text-sm" style={{ color: textMain }}>
              {pct === 100 ? "¡Perfecto! Todas correctas 🎉"
               : pct >= 70  ? "¡Muy bien! Casi todas correctas 👏"
               : pct >= 40  ? "Buen intento, sigue practicando 💪"
               : "Revisa las respuestas correctas y vuelve a intentarlo 📖"}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Botones ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {!checked ? (
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleCheck}
            disabled={!allFilled}
            className="flex-1 py-4 rounded-2xl font-extrabold text-white text-base flex items-center justify-center gap-2 transition-all"
            style={{
              background: allFilled
                ? "linear-gradient(135deg,#7FB3D5,#4587a9)"
                : isHighContrast ? "#1E293B" : "#E5E7EB",
              color:      allFilled ? "white" : (isHighContrast ? "#475569" : "#9CA3AF"),
              boxShadow:  allFilled ? "0 4px 18px rgba(127,179,213,0.45)" : "none",
              cursor:     allFilled ? "pointer" : "not-allowed",
            }}
          >
            <CheckCircle2 className="w-5 h-5" />
            Comprobar respuestas
          </motion.button>
        ) : (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => onComplete(nota)}
            className="flex-1 py-4 rounded-2xl font-extrabold text-white text-base flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg,#FFB37B,#ff9450)",
              boxShadow:  "0 4px 20px rgba(255,148,80,0.40)",
            }}
          >
            Continuar <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
      </div>

      {/* Hint: llena todos los campos */}
      {!checked && !allFilled && (
        <p className="text-center text-xs mt-3 font-semibold" style={{ color: textMuted }}>
          Completa todos los espacios en blanco para poder comprobar
        </p>
      )}
    </motion.div>
  );
}
