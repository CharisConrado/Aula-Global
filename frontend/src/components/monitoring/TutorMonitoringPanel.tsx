"use client";

import { motion } from "framer-motion";

const EMOTION_META: Record<string, { emoji: string; color: string; label: string }> = {
  neutro:    { emoji: "😐", color: "#a0aec0", label: "Tranquilo" },
  feliz:     { emoji: "😄", color: "#FFD700", label: "Feliz" },
  frustrado: { emoji: "😤", color: "#ff6b6b", label: "Frustrado" },
  ansioso:   { emoji: "😰", color: "#ffa500", label: "Ansioso" },
  distraido: { emoji: "😶", color: "#9370db", label: "Distraído" },
  estresado: { emoji: "😟", color: "#ff4444", label: "Estresado" },
  calmado:   { emoji: "😌", color: "#7BC8A4", label: "Calmado" },
};

export interface EmotionEntry {
  emotion: string;
  attention: number;
  time: number;
}

interface Props {
  emotion: string;
  attentionLevel: number;
  stimming: boolean;
  alerta_crisis: string | null;
  history: EmotionEntry[];
  videoFrame?: string | null;
}

export default function TutorMonitoringPanel({
  emotion,
  attentionLevel,
  stimming,
  alerta_crisis,
  history,
  videoFrame,
}: Props) {
  const meta = EMOTION_META[emotion] || EMOTION_META.neutro;
  const atPct = Math.round(attentionLevel * 100);

  /* ── SVG sparkline ── */
  const W = 220, H = 44, PAD = 4;
  const pts = history.slice(-20);
  const svgPath = pts.length > 1
    ? pts.map((p, i) => {
        const x = PAD + (i / (pts.length - 1)) * (W - PAD * 2);
        const y = H - PAD - p.attention * (H - PAD * 2);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : null;

  const atColor = atPct > 60 ? "#7BC8A4" : atPct > 30 ? "#FCD34D" : "#F87171";

  return (
    <div className="mt-3 rounded-2xl overflow-hidden" style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0" }}>

      {/* Video en vivo del estudiante */}
      <div
        className="relative w-full overflow-hidden"
        style={{ background: "#1a1a2e", aspectRatio: "4/3" }}
      >
        {videoFrame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/jpeg;base64,${videoFrame}`}
            alt="Video estudiante"
            className="w-full h-full object-cover"
            style={{ display: "block" }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="text-3xl">📷</span>
            <p className="text-xs font-semibold" style={{ color: "#64748b" }}>
              Esperando cámara…
            </p>
          </div>
        )}
        {/* Overlay de emoción sobre el video */}
        {videoFrame && (
          <div
            className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-xl"
            style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          >
            <span className="text-base leading-none">{meta.emoji}</span>
            <span className="text-[10px] font-extrabold" style={{ color: meta.color }}>{meta.label}</span>
          </div>
        )}
        {/* Indicador de transmisión en vivo */}
        {videoFrame && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.85)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-extrabold text-white tracking-wider">EN VIVO</span>
          </div>
        )}
      </div>

      {/* Top row: emotion + attention */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        {/* Emotion bubble */}
        <motion.div
          key={emotion}
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl"
          style={{ background: `${meta.color}18`, border: `1.5px solid ${meta.color}44` }}
        >
          <span className="text-xl leading-none">{meta.emoji}</span>
          <span className="text-xs font-extrabold" style={{ color: meta.color }}>{meta.label}</span>
        </motion.div>

        {/* Attention bar */}
        <div className="flex-1">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "#94a3b8" }}>Atención</span>
            <span className="text-[10px] font-extrabold" style={{ color: atColor }}>{atPct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#E2E8F0" }}>
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${atPct}%` }}
              transition={{ type: "spring", stiffness: 80, damping: 20 }}
              style={{ background: `linear-gradient(90deg, ${atColor}, ${atColor}cc)` }}
            />
          </div>
        </div>
      </div>

      {/* Sparkline chart */}
      {pts.length > 1 && svgPath && (
        <div className="px-4 pb-2">
          <p className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: "#94a3b8" }}>
            Atención — últimas {pts.length} lecturas
          </p>
          <svg width={W} height={H} style={{ overflow: "visible" }}>
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map((v) => {
              const y = H - PAD - v * (H - PAD * 2);
              return <line key={v} x1={PAD} x2={W - PAD} y1={y} y2={y} stroke="#E2E8F0" strokeWidth="1" />;
            })}
            {/* Area fill */}
            <path
              d={`${svgPath} L${(W - PAD).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`}
              fill={`${atColor}22`}
            />
            {/* Line */}
            <path d={svgPath} fill="none" stroke={atColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {/* Last dot */}
            {pts.length > 0 && (() => {
              const last = pts[pts.length - 1];
              const lx = PAD + ((pts.length - 1) / (pts.length - 1)) * (W - PAD * 2);
              const ly = H - PAD - last.attention * (H - PAD * 2);
              return <circle cx={lx} cy={ly} r="4" fill={atColor} stroke="white" strokeWidth="2" />;
            })()}
          </svg>
        </div>
      )}

      {/* Emotion history dots */}
      {pts.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#94a3b8" }}>
            Historial de emociones
          </p>
          <div className="flex gap-1 flex-wrap">
            {pts.map((entry, i) => {
              const m = EMOTION_META[entry.emotion] || EMOTION_META.neutro;
              return (
                <div
                  key={i}
                  title={`${m.label} — ${new Date(entry.time).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] cursor-default"
                  style={{
                    background: `${m.color}22`,
                    border: `1.5px solid ${m.color}`,
                    opacity: 0.4 + (i / pts.length) * 0.6,
                  }}
                >
                  {m.emoji}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alerts row */}
      {(stimming || alerta_crisis) && (
        <div className="px-4 pb-3 flex gap-2 flex-wrap">
          {stimming && (
            <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "#FFF7ED", color: "#EA580C", border: "1px solid #FED7AA" }}>
              ⚠ Stimming detectado
            </span>
          )}
          {alerta_crisis && (
            <motion.span
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="text-[10px] font-extrabold px-2 py-1 rounded-lg"
              style={{ background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" }}
            >
              🚨 Crisis {alerta_crisis}
            </motion.span>
          )}
        </div>
      )}
    </div>
  );
}
