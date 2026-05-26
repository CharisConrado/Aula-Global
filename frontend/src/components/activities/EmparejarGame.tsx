"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle } from "lucide-react";

export interface Par { a: string; b: string }

interface EmparejarGameProps {
  pares:      Par[];
  onComplete: (score: number) => void;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function EmparejarGame({ pares, onComplete }: EmparejarGameProps) {
  // Shuffle both columns independently so they never align
  const leftItems  = useMemo(() => shuffle(pares.map((p) => p.a)), [pares]);
  const rightItems = useMemo(() => shuffle(pares.map((p) => p.b)), [pares]);

  // Lookup: a → correct b
  const trueMap = useMemo(() => {
    const m = new Map<string, string>();
    pares.forEach((p) => m.set(p.a, p.b));
    return m;
  }, [pares]);

  const [selectedA,  setSelectedA]  = useState<string | null>(null);
  const [matched,    setMatched]    = useState<Map<string, string>>(new Map());
  const [wrongA,     setWrongA]     = useState<string | null>(null);
  const [wrongB,     setWrongB]     = useState<string | null>(null);
  const [allDone,    setAllDone]    = useState(false);

  const isMatchedA = (a: string) => matched.has(a);
  const isMatchedB = (b: string) => [...matched.values()].includes(b);

  const handleClickA = useCallback((a: string) => {
    if (isMatchedA(a) || allDone) return;
    setSelectedA((prev) => (prev === a ? null : a));
    setWrongA(null);
    setWrongB(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matched, allDone]);

  const handleClickB = useCallback((b: string) => {
    if (!selectedA || isMatchedB(b) || allDone) return;
    const expected = trueMap.get(selectedA);
    if (expected === b) {
      // ✅ Correct
      const next = new Map(matched);
      next.set(selectedA, b);
      setMatched(next);
      setSelectedA(null);
      if (next.size === pares.length) {
        setAllDone(true);
        setTimeout(() => onComplete(5), 900);
      }
    } else {
      // ❌ Wrong — flash red then reset
      setWrongA(selectedA);
      setWrongB(b);
      setTimeout(() => {
        setWrongA(null);
        setWrongB(null);
        setSelectedA(null);
      }, 700);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedA, matched, trueMap, pares.length, allDone, onComplete]);

  const progress = Math.round((matched.size / pares.length) * 100);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="card-kid mb-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">🔗</span>
          <div>
            <h2 className="text-kid-lg font-extrabold text-gray-700">¡Empareja los conceptos!</h2>
            <p className="text-sm text-gray-400">
              Toca un término de la izquierda y luego su par de la derecha
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-1">
          <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#a78bfa,#7c3aed)" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <span className="text-sm font-bold text-purple-600 w-14 text-right">
            {matched.size}/{pares.length}
          </span>
        </div>
        {selectedA && (
          <p className="text-xs text-purple-500 font-semibold mt-2 animate-pulse">
            ✨ Seleccionado: &ldquo;{selectedA}&rdquo; — ahora elige su par a la derecha
          </p>
        )}
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-2 gap-3">
        {/* LEFT column — A items */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-extrabold text-purple-500 uppercase tracking-widest text-center mb-1">
            Concepto
          </p>
          {leftItems.map((a) => {
            const isDone   = isMatchedA(a);
            const isSel    = selectedA === a;
            const isWrong  = wrongA === a;
            return (
              <motion.button
                key={a}
                whileTap={!isDone ? { scale: 0.95 } : {}}
                animate={isWrong ? { x: [-6, 6, -6, 0] } : {}}
                transition={{ duration: 0.3 }}
                onClick={() => handleClickA(a)}
                disabled={isDone || allDone}
                className={`w-full p-3 rounded-2xl border-2 text-left text-sm font-bold transition-all leading-snug ${
                  isDone
                    ? "bg-green-50 border-green-400 text-green-700 cursor-default"
                    : isSel
                    ? "bg-purple-100 border-purple-500 text-purple-800 shadow-md"
                    : isWrong
                    ? "bg-red-50 border-red-400 text-red-600"
                    : "bg-white border-purple-200 text-gray-700 hover:border-purple-400 hover:bg-purple-50"
                }`}
              >
                {isDone && <CheckCircle className="w-4 h-4 inline mr-1.5 text-green-500" />}
                {a}
              </motion.button>
            );
          })}
        </div>

        {/* RIGHT column — B items */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-extrabold text-orange-500 uppercase tracking-widest text-center mb-1">
            Definición
          </p>
          {rightItems.map((b) => {
            const isDone   = isMatchedB(b);
            const isWrong  = wrongB === b;
            return (
              <motion.button
                key={b}
                whileTap={!isDone ? { scale: 0.95 } : {}}
                animate={isWrong ? { x: [6, -6, 6, 0] } : {}}
                transition={{ duration: 0.3 }}
                onClick={() => handleClickB(b)}
                disabled={isDone || allDone || !selectedA}
                className={`w-full p-3 rounded-2xl border-2 text-left text-sm font-bold transition-all leading-snug ${
                  isDone
                    ? "bg-green-50 border-green-400 text-green-700 cursor-default"
                    : isWrong
                    ? "bg-red-50 border-red-400 text-red-600"
                    : !selectedA
                    ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-white border-orange-200 text-gray-700 hover:border-orange-400 hover:bg-orange-50"
                }`}
              >
                {isDone && <CheckCircle className="w-4 h-4 inline mr-1.5 text-green-500" />}
                {b}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* All done banner */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 p-5 rounded-3xl text-center font-extrabold text-white text-lg"
            style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)", boxShadow: "0 6px 24px rgba(124,58,237,0.4)" }}
          >
            🎉 ¡Emparejaste todo correctamente!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
