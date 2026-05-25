"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eraser, Trash2 } from "lucide-react";

// ─── Brand palette ────────────────────────────────────────────────────────────
const BRAND = {
  bg: "#FDF8F2",
  blue: "#7FB3D5",
  orange: "#FFB37B",
  green: "#A2D9A1",
  text: "#34495E",
  border: "#D5DBDB",
  canvasBg: "#FFFDF7",
  activeTool: "#E1EFFF",
  activeToolBorder: "#7FB3D5",
  activeEraser: "#FFE8D4",
  activeEraserBorder: "#FFB37B",
};

// ─── Drawing palette (14 colors, 2 cols) ──────────────────────────────────────
const PALETTE = [
  { name: "Rojo",         hex: "#E74C3C" },
  { name: "Naranja",      hex: "#FF8C42" },
  { name: "Amarillo",     hex: "#F1C40F" },
  { name: "Verde",        hex: "#2ECC71" },
  { name: "Azul",         hex: "#3498DB" },
  { name: "Morado",       hex: "#9B59B6" },
  { name: "Salmón",       hex: "#FA8072" },
  { name: "Lima",         hex: "#AADB5C" },
  { name: "Dorado",       hex: "#D4AC0D" },
  { name: "Verde oscuro", hex: "#1A7A4C" },
  { name: "Gris oscuro",  hex: "#5D6D7E" },
  { name: "Lila",         hex: "#BB8FCE" },
  { name: "Blanco",       hex: "#FFFFFF" },
  { name: "Negro",        hex: "#1C1C1C" },
];

// ─── Brush sizes ──────────────────────────────────────────────────────────────
const BRUSH_SIZES = [
  { label: "S", size: 6 },
  { label: "M", size: 14 },
  { label: "L", size: 24 },
];

// ─── Emotions ─────────────────────────────────────────────────────────────────
const EMOTIONS = [
  { emoji: "😊", label: "Feliz" },
  { emoji: "😐", label: "Normal" },
  { emoji: "😢", label: "Triste" },
  { emoji: "😤", label: "Frustrado" },
  { emoji: "😰", label: "Ansioso" },
];

// ─── Internal canvas resolution ───────────────────────────────────────────────
const CANVAS_W = 700;
const CANVAS_H = 450;

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ArteCanvasProps {
  onComplete: (progress: number, emotion: string, strokeCount: number) => void;
  onProgress?: (pct: number) => void;
  instruction?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ArteCanvas({
  onComplete,
  onProgress,
  instruction = "¡Dibuja lo que quieras! Usa los colores y pinceles para crear tu obra.",
}: ArteCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // UI state
  const [activeColor, setActiveColor] = useState(PALETTE[4].hex); // azul por defecto
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size); // M
  const [isEraser, setIsEraser] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showEmotions, setShowEmotions] = useState(false);
  const [selectedEmotion, setSelectedEmotion] = useState("");
  const [completed, setCompleted] = useState(false);

  // ─── Init canvas ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = BRAND.canvasBg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const getCanvasPos = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const calculateProgress = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const data = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
    let painted = 0;
    const total = CANVAS_W * CANVAS_H;
    // Canvas bg is #FFFDF7 → R=255 G=253 B=247
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(r >= 250 && g >= 248 && b >= 240)) painted++;
    }
    return Math.min(100, Math.round((painted / total) * 100));
  }, []);

  const drawLine = useCallback(
    (x0: number, y0: number, x1: number, y1: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = isEraser ? BRAND.canvasBg : activeColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    },
    [activeColor, brushSize, isEraser]
  );

  const endStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPosRef.current = null;
    setStrokeCount((prev) => {
      const next = prev + 1;
      return next;
    });
    const pct = calculateProgress();
    setProgress(pct);
    onProgress?.(pct);
  }, [calculateProgress, onProgress]);

  // ─── Mouse events ───────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      isDrawingRef.current = true;
      lastPosRef.current = getCanvasPos(e.clientX, e.clientY);
    },
    [getCanvasPos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || !lastPosRef.current) return;
      const pos = getCanvasPos(e.clientX, e.clientY);
      drawLine(lastPosRef.current.x, lastPosRef.current.y, pos.x, pos.y);
      lastPosRef.current = pos;
    },
    [getCanvasPos, drawLine]
  );

  const handleMouseUp = useCallback(() => endStroke(), [endStroke]);
  const handleMouseLeave = useCallback(() => endStroke(), [endStroke]);

  // ─── Touch events ───────────────────────────────────────────────────────────
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const touch = e.touches[0];
      isDrawingRef.current = true;
      lastPosRef.current = getCanvasPos(touch.clientX, touch.clientY);
    },
    [getCanvasPos]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawingRef.current || !lastPosRef.current) return;
      const touch = e.touches[0];
      const pos = getCanvasPos(touch.clientX, touch.clientY);
      drawLine(lastPosRef.current.x, lastPosRef.current.y, pos.x, pos.y);
      lastPosRef.current = pos;
    },
    [getCanvasPos, drawLine]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      endStroke();
    },
    [endStroke]
  );

  // ─── Clear canvas ───────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = BRAND.canvasBg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    setStrokeCount(0);
    setProgress(0);
    setCompleted(false);
    onProgress?.(0);
  }, [onProgress]);

  // ─── Complete ────────────────────────────────────────────────────────────────
  const handleComplete = useCallback(() => {
    if (completed) return;
    setCompleted(true);
    onComplete(progress, selectedEmotion || "Normal", strokeCount);
  }, [completed, onComplete, progress, selectedEmotion, strokeCount]);

  // Show complete button condition
  const showComplete = progress >= 15 || strokeCount >= 8;

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const toolboxStyle: React.CSSProperties = {
    width: 230,
    minWidth: 230,
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.1rem",
    flexShrink: 0,
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    color: "#8FA3B1",
    textTransform: "uppercase",
    marginBottom: 6,
  };

  const paletteGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 6,
  };

  const brushRowStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
  };

  const toolRowStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  return (
    <div
      style={{
        background: BRAND.bg,
        borderRadius: 24,
        padding: "1.25rem",
        fontFamily: "'Nunito', 'Segoe UI', sans-serif",
        color: BRAND.text,
      }}
    >
      {/* ── Flex wrapper ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1.25rem",
          alignItems: "flex-start",
        }}
      >
        {/* ══════════════════════════════════════════════════════════════════════
            LEFT TOOLBOX
        ══════════════════════════════════════════════════════════════════════ */}
        <div style={toolboxStyle}>
          {/* Color palette */}
          <div>
            <p style={sectionLabelStyle}>Colores</p>
            <div style={paletteGridStyle}>
              {PALETTE.map((c) => {
                const isActive = !isEraser && activeColor === c.hex;
                return (
                  <motion.button
                    key={c.hex}
                    whileTap={{ scale: 0.88 }}
                    onClick={() => { setActiveColor(c.hex); setIsEraser(false); }}
                    title={c.name}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      borderRadius: 10,
                      background: c.hex,
                      border: isActive
                        ? `3px solid ${BRAND.text}`
                        : `2px solid ${BRAND.border}`,
                      outline: isActive ? `2px solid ${BRAND.blue}` : "none",
                      outlineOffset: 1,
                      cursor: "pointer",
                      boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.18)" : "none",
                      transition: "all 0.15s",
                    }}
                    aria-label={c.name}
                  />
                );
              })}
            </div>
          </div>

          {/* Brush sizes */}
          <div>
            <p style={sectionLabelStyle}>Pincel</p>
            <div style={brushRowStyle}>
              {BRUSH_SIZES.map((b) => {
                const isActive = !isEraser && brushSize === b.size;
                return (
                  <motion.button
                    key={b.label}
                    whileTap={{ scale: 0.88 }}
                    onClick={() => { setBrushSize(b.size); setIsEraser(false); }}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: 10,
                      border: isActive
                        ? `2px solid ${BRAND.activeToolBorder}`
                        : `2px solid ${BRAND.border}`,
                      background: isActive ? BRAND.activeTool : "#F7F9FA",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: b.label === "L" ? 18 : b.label === "M" ? 15 : 12,
                      color: BRAND.text,
                      transition: "all 0.15s",
                    }}
                  >
                    {b.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Tools */}
          <div>
            <p style={sectionLabelStyle}>Herramientas</p>
            <div style={toolRowStyle}>
              {/* Eraser */}
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => setIsEraser((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: isEraser
                    ? `2px solid ${BRAND.activeEraserBorder}`
                    : `2px solid ${BRAND.border}`,
                  background: isEraser ? BRAND.activeEraser : "#F7F9FA",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  color: BRAND.text,
                  transition: "all 0.15s",
                }}
              >
                <Eraser size={16} color={isEraser ? BRAND.orange : BRAND.text} />
                Borrador
              </motion.button>

              {/* Clear all */}
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={handleClear}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: `2px solid #FADBD8`,
                  background: "#FEF9F9",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#C0392B",
                  transition: "all 0.15s",
                }}
              >
                <Trash2 size={16} color="#C0392B" />
                Limpiar todo
              </motion.button>
            </div>
          </div>

          {/* Color preview */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: isEraser ? BRAND.canvasBg : activeColor,
                border: `2px solid ${BRAND.border}`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: "#8FA3B1", fontWeight: 600 }}>
              {isEraser ? "Borrador activo" : PALETTE.find((p) => p.hex === activeColor)?.name ?? "Color"}
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            CENTER: instruction + canvas + progress + emotions + complete btn
        ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {/* Instruction banner */}
          <div
            style={{
              background: "#E1EFFF",
              color: "#4587a9",
              fontWeight: 700,
              fontSize: 13,
              borderRadius: 12,
              padding: "8px 16px",
              lineHeight: 1.4,
            }}
          >
            {instruction}
          </div>

          {/* Canvas */}
          <div
            style={{
              border: `2px solid ${BRAND.border}`,
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 6px 24px rgba(0,0,0,0.10)",
              lineHeight: 0,
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{
                display: "block",
                width: "100%",
                cursor: isEraser ? "cell" : "crosshair",
                touchAction: "none",
                background: BRAND.canvasBg,
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </div>

          {/* Progress bar */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.text }}>
                Progreso del lienzo
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.blue }}>
                {progress}%
              </span>
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 99,
                background: BRAND.border,
                overflow: "hidden",
              }}
            >
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{
                  height: "100%",
                  background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.green})`,
                  borderRadius: 99,
                }}
              />
            </div>
          </div>

          {/* Emotion toggle */}
          <div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowEmotions((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 16px",
                borderRadius: 12,
                border: `2px solid ${showEmotions ? BRAND.blue : BRAND.border}`,
                background: showEmotions ? BRAND.activeTool : "#F7F9FA",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
                color: BRAND.text,
              }}
            >
              <span style={{ fontSize: 18 }}>
                {selectedEmotion
                  ? EMOTIONS.find((e) => e.label === selectedEmotion)?.emoji ?? "🎨"
                  : "🎨"}
              </span>
              ¿Cómo te sientes?
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#8FA3B1" }}>
                {showEmotions ? "▲" : "▼"}
              </span>
            </motion.button>

            <AnimatePresence>
              {showEmotions && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.22 }}
                  style={{ overflow: "hidden" }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 8,
                      padding: "10px 12px",
                      background: "#fff",
                      borderRadius: 14,
                      border: `1px solid ${BRAND.border}`,
                    }}
                  >
                    {EMOTIONS.map((em) => {
                      const isSelected = selectedEmotion === em.label;
                      return (
                        <motion.button
                          key={em.label}
                          whileTap={{ scale: 0.88 }}
                          onClick={() => {
                            setSelectedEmotion(em.label);
                            setShowEmotions(false);
                          }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 3,
                            padding: "8px 10px",
                            borderRadius: 12,
                            border: isSelected
                              ? `2px solid ${BRAND.blue}`
                              : `2px solid ${BRAND.border}`,
                            background: isSelected ? BRAND.activeTool : "#F7F9FA",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                            color: BRAND.text,
                            minWidth: 64,
                          }}
                        >
                          <span style={{ fontSize: 24 }}>{em.emoji}</span>
                          {em.label}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Complete button */}
          <AnimatePresence>
            {showComplete && !completed && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 10 }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleComplete}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 20,
                  border: "none",
                  background: "linear-gradient(135deg, #FFB37B, #ff9450)",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: "pointer",
                  letterSpacing: "0.02em",
                  boxShadow: "0 4px 18px rgba(255,148,80,0.40)",
                }}
              >
                🎉 ¡Terminé mi obra!
              </motion.button>
            )}

            {completed && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  borderRadius: 20,
                  background: `linear-gradient(135deg, ${BRAND.green}, #72c870)`,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 16,
                  textAlign: "center",
                  boxShadow: "0 4px 18px rgba(114,200,112,0.35)",
                }}
              >
                ✅ ¡Obra guardada!
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stroke counter hint */}
          {!showComplete && (
            <p
              style={{
                textAlign: "center",
                fontSize: 11,
                color: "#B0BEC5",
                margin: 0,
              }}
            >
              Sigue dibujando… {Math.max(0, 8 - strokeCount)} trazos o{" "}
              {Math.max(0, 15 - progress)}% más para terminar
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
