"use client";

/**
 * Aula Global — Panel de reportes administrativos
 * - KPIs globales, charts SVG y tablas.
 * - Rango de fechas personalizable (presets + selector).
 * - Exportación a PDF (jsPDF + html2canvas).
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Users, BookOpen, Activity, AlertTriangle, Brain,
  Smile, Frown, Meh, Wind, Cloud, Sun, Heart,
  Loader2, TrendingUp, Award, Calendar, FileDown,
} from "lucide-react";
import {
  api,
  type ReportOverview,
  type CrisisSummaryReport,
  type TopActivity,
  type UsageBySubject,
  type ReportDateRange,
} from "@/lib/api";

interface Props { token: string; }

/* ── Helpers de UI ────────────────────────────────────────────── */
const COLORS = {
  primary:    "#7FB3D5",
  primaryDark: "#4587a9",
  accent:     "#FFB37B",
  accentDark: "#ff9450",
  ink:        "#34495E",
  inkSoft:    "#7f8c8d",
  inkFaint:   "#a0aec0",
  border:     "#D5DBDB",
  bgSoft:     "#F0F7FB",
  bgWarm:     "#FDF8F2",
  ok:         "#16a34a",
  warn:       "#ca8a04",
  err:        "#dc2626",
};

const EMOTION_INFO: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  feliz:     { color: "#fbbf24", icon: <Smile  className="w-4 h-4" />, label: "Feliz" },
  calmado:   { color: "#60a5fa", icon: <Wind   className="w-4 h-4" />, label: "Calmado" },
  neutro:    { color: "#9ca3af", icon: <Meh    className="w-4 h-4" />, label: "Neutro" },
  frustrado: { color: "#f97316", icon: <Frown  className="w-4 h-4" />, label: "Frustrado" },
  ansioso:   { color: "#a855f7", icon: <Cloud  className="w-4 h-4" />, label: "Ansioso" },
  distraido: { color: "#06b6d4", icon: <Sun    className="w-4 h-4" />, label: "Distraído" },
  estresado: { color: "#ef4444", icon: <AlertTriangle className="w-4 h-4" />, label: "Estresado" },
};

/* ── Fechas ───────────────────────────────────────────────────── */
function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

const formatNiceDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
};

/* ════════════════════════════════════════════════════════════════ */
/* Cards genéricas                                                  */
/* ════════════════════════════════════════════════════════════════ */
function Card({
  title, subtitle, icon, children,
}: {
  title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[1.25rem] p-5"
      style={{
        background: "white",
        border: `1.5px solid ${COLORS.border}`,
        boxShadow: "0 2px 12px rgba(127,179,213,0.09)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon && (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: COLORS.bgSoft, color: COLORS.primaryDark }}>
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-sm font-extrabold" style={{ color: COLORS.ink }}>{title}</h3>
          {subtitle && <p className="text-[11px]" style={{ color: COLORS.inkFaint }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </motion.div>
  );
}

function KpiCard({
  label, value, sub, icon, color,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[1.25rem] p-5"
      style={{
        background: "white",
        border: `1.5px solid ${COLORS.border}`,
        boxShadow: "0 2px 12px rgba(127,179,213,0.09)",
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.inkFaint }}>
          {label}
        </p>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: `${color}20`, color }}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-black" style={{ color: COLORS.ink }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: COLORS.inkSoft }}>{sub}</p>}
    </motion.div>
  );
}

/* ────────── Charts SVG ────────── */
function BarChart({
  data, height = 160, max,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number; max?: number;
}) {
  if (data.length === 0) {
    return <p className="text-xs text-center py-8" style={{ color: COLORS.inkFaint }}>Sin datos</p>;
  }
  const computedMax = max ?? Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / data.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height}>
        {data.map((d, i) => {
          const barH = (d.value / computedMax) * (height - 24);
          return (
            <rect key={i}
              x={i * barWidth + barWidth * 0.15}
              y={height - 16 - barH}
              width={barWidth * 0.7}
              height={Math.max(barH, 1)}
              rx={2}
              fill={d.color || COLORS.primary} />
          );
        })}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] font-semibold" style={{ color: COLORS.inkFaint }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({
  data, height = 160, color = COLORS.primary, valueFormatter,
}: {
  data: { label: string; value: number }[];
  height?: number; color?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (data.length === 0) {
    return <p className="text-xs text-center py-8" style={{ color: COLORS.inkFaint }}>Sin datos</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 0.001);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const padding = 8;
  const w = 100; const h = height;

  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * (w - 2 * padding) + padding;
    const y = h - padding - ((d.value - min) / range) * (h - 2 * padding - 16);
    return { x, y, ...d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${path} L ${points[points.length - 1].x} ${h - padding} L ${points[0].x} ${h - padding} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
        <defs>
          <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#lineFill)" />
        <path d={path} stroke={color} strokeWidth="0.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.9" fill={color} />
        ))}
      </svg>
      <div className="flex justify-between mt-1 text-[9px] font-semibold" style={{ color: COLORS.inkFaint }}>
        <span>{data[0]?.label}</span>
        <span>{valueFormatter ? `${valueFormatter(min)} – ${valueFormatter(max)}` : `${min.toFixed(2)} – ${max.toFixed(2)}`}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function DonutChart({
  data, size = 180,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return <p className="text-xs text-center py-8" style={{ color: COLORS.inkFaint }}>Sin datos</p>;
  }
  const r = size / 2 - 14;
  const cx = size / 2; const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={COLORS.bgSoft} strokeWidth="14" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * circumference;
          const elem = (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke={d.color} strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="round" />
          );
          offset += dash;
          return elem;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="22" fontWeight="900" fill={COLORS.ink}>
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="9" fill={COLORS.inkFaint} fontWeight="700">
          MUESTRAS
        </text>
      </svg>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 w-full">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ color: COLORS.inkSoft }}>{d.label}</span>
            <span className="ml-auto font-bold" style={{ color: COLORS.ink }}>
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
export default function ReportsPanel({ token }: Props) {
  /* ── Rango de fechas ── */
  const [startDate, setStartDate] = useState<string>(daysAgo(30));
  const [endDate,   setEndDate]   = useState<string>(toISODate(new Date()));
  const [activeRange, setActiveRange] = useState<ReportDateRange>({
    start_date: daysAgo(30),
    end_date:   toISODate(new Date()),
  });

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  /* ── Datos ── */
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [sessionsTime, setSessionsTime] = useState<{ date: string; count: number }[]>([]);
  const [emotions, setEmotions] = useState<{ emotion: string; count: number }[]>([]);
  const [attention, setAttention] = useState<{ date: string; avg: number }[]>([]);
  const [crisisSum, setCrisisSum] = useState<CrisisSummaryReport | null>(null);
  const [topAct, setTopAct] = useState<TopActivity[]>([]);
  const [byGrade, setByGrade] = useState<{ grade_name: string; level: number; count: number }[]>([]);
  const [bySubject, setBySubject] = useState<UsageBySubject[]>([]);
  const [stimming, setStimming] = useState<{ rate: number; total_samples: number } | null>(null);

  /* ── Carga ── */
  const loadAll = useCallback(async (range: ReportDateRange) => {
    if (!token) return;
    setLoading(true);
    try {
      const [ov, st, em, at, cs, ta, sg, us, sm] = await Promise.all([
        api.getReportOverview(token, range).catch(() => null),
        api.getReportSessionsOverTime(token, range).catch(() => []),
        api.getReportEmotionsDistribution(token, range).catch(() => []),
        api.getReportAttentionTrend(token, range).catch(() => []),
        api.getReportCrisisSummary(token, range).catch(() => null),
        api.getReportTopActivities(token, 8, range).catch(() => []),
        api.getReportStudentsByGrade(token).catch(() => []),
        api.getReportUsageBySubject(token, range).catch(() => []),
        api.getReportStimmingRate(token, range).catch(() => null),
      ]);
      setOverview(ov); setSessionsTime(st); setEmotions(em); setAttention(at);
      setCrisisSum(cs); setTopAct(ta); setByGrade(sg); setBySubject(us); setStimming(sm);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll(activeRange);
  }, [activeRange, loadAll]);

  /* ── Presets ── */
  const applyPreset = (days: number) => {
    const s = daysAgo(days);
    const e = toISODate(new Date());
    setStartDate(s); setEndDate(e);
    setActiveRange({ start_date: s, end_date: e });
  };

  const applyCustomRange = () => {
    if (!startDate || !endDate) return;
    if (new Date(startDate) > new Date(endDate)) {
      alert("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }
    setActiveRange({ start_date: startDate, end_date: endDate });
  };

  /* ════════════════════════════════════════════════════════════ */
  /* Exportar a PDF — documento nativo con tipografía y tablas    */
  /* ════════════════════════════════════════════════════════════ */
  const exportToPDF = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // Dynamic imports — solo se cargan al exportar
      const jsPDFModule        = await import("jspdf");
      const autoTableModule    = await import("jspdf-autotable");
      const JsPDF              = jsPDFModule.default;
      const autoTable          = autoTableModule.default;

      const doc = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW  = doc.internal.pageSize.getWidth();
      const pageH  = doc.internal.pageSize.getHeight();
      const margin = 16;

      /* ── Colores corporativos en RGB ── */
      const C = {
        primary:    [127, 179, 213] as [number, number, number],
        primaryDark:[ 69, 135, 169] as [number, number, number],
        accent:     [255, 179, 123] as [number, number, number],
        ink:        [ 52,  73,  94] as [number, number, number],
        inkSoft:    [127, 140, 141] as [number, number, number],
        inkFaint:   [160, 174, 192] as [number, number, number],
        bgSoft:     [240, 247, 251] as [number, number, number],
        border:     [213, 219, 219] as [number, number, number],
        ok:         [ 22, 163,  74] as [number, number, number],
        warn:       [202, 138,   4] as [number, number, number],
        err:        [220,  38,  38] as [number, number, number],
      };

      const setFill   = (rgb: [number, number, number]) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      const setStroke = (rgb: [number, number, number]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
      const setText   = (rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

      /* ════════ PÁGINA 1: Portada ════════ */
      // Banner superior
      setFill(C.primary);
      doc.rect(0, 0, pageW, 60, "F");

      // Decoración: círculos sutiles
      setFill(C.primaryDark);
      doc.circle(pageW - 20, 14, 10, "F");
      doc.circle(pageW - 5, 30, 5, "F");
      doc.circle(pageW - 35, 8, 4, "F");

      // Título principal
      setText([255, 255, 255]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(28);
      doc.text("Aula Global", margin, 28);

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text("Reportes generales de la plataforma", margin, 38);

      doc.setFontSize(9);
      doc.text("Plataforma educativa adaptativa · TDAH / TEA", margin, 48);

      // Bloque de información del reporte
      let y = 80;
      setText(C.ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("PERIODO DEL REPORTE", margin, y);

      setText(C.primaryDark);
      doc.setFontSize(13);
      doc.text(
        `${formatNiceDate(startDate)}  —  ${formatNiceDate(endDate)}`,
        margin, y + 7,
      );

      y += 20;
      setText(C.ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("GENERADO", margin, y);

      setText(C.inkSoft);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(
        new Date().toLocaleString("es-CO", {
          dateStyle: "long",
          timeStyle: "short",
        }),
        margin, y + 7,
      );

      // Tabla de resumen ejecutivo en la portada
      y += 25;
      setText(C.ink);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Resumen ejecutivo", margin, y);

      setStroke(C.primary);
      doc.setLineWidth(0.8);
      doc.line(margin, y + 2, margin + 50, y + 2);

      y += 8;
      const kpis: Array<[string, string]> = [
        ["Usuarios totales",       `${overview?.users.total ?? 0}`],
        ["Estudiantes activos",    `${overview?.users.students ?? 0}`],
        ["Tutores",                `${overview?.users.tutors ?? 0}`],
        ["Profesionales internos", `${overview?.users.professionals ?? 0}`],
        ["Sesiones en el periodo", `${overview?.sessions.total ?? 0}`],
        ["Duración media",         `${overview?.sessions.avg_minutes ?? 0} min`],
        ["Atención promedio",      `${Math.round(((overview?.wellbeing.avg_attention_30d ?? 0) * 100))}%`],
        ["Crisis sin resolver",    `${overview?.crisis.unresolved ?? 0} de ${overview?.crisis.total ?? 0}`],
        ["Stimming detectado",     `${Math.round((stimming?.rate ?? 0) * 100)}%`],
        ["Actividades publicadas", `${overview?.content.activities ?? 0}`],
      ];

      autoTable(doc, {
        startY: y,
        head: [["Indicador", "Valor"]],
        body: kpis,
        theme: "grid",
        margin: { left: margin, right: margin },
        styles: {
          font: "helvetica", fontSize: 10,
          cellPadding: 3, textColor: C.ink, lineColor: C.border, lineWidth: 0.1,
        },
        headStyles: {
          fillColor: C.primary, textColor: [255, 255, 255],
          fontStyle: "bold", halign: "left",
        },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "right", textColor: C.primaryDark, fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      /* ════════ PÁGINA 2+: Detalle ════════ */
      doc.addPage();

      // Helper: cabecera de sección
      const sectionHeader = (title: string, currentY: number): number => {
        if (currentY > pageH - 40) {
          doc.addPage();
          currentY = margin;
        }
        setText(C.ink);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(title, margin, currentY);

        setStroke(C.accent);
        doc.setLineWidth(0.6);
        doc.line(margin, currentY + 2, margin + 35, currentY + 2);

        return currentY + 9;
      };

      const sectionSubtitle = (txt: string, currentY: number): number => {
        setText(C.inkSoft);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.text(txt, margin, currentY);
        return currentY + 6;
      };

      // ── Sección: Sesiones por día ──
      let cy = margin;
      cy = sectionHeader("1. Actividad de la plataforma", cy);
      cy = sectionSubtitle("Sesiones registradas cada día del periodo seleccionado", cy);

      if (sessionsTime.length === 0) {
        setText(C.inkFaint);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("Sin sesiones registradas en este periodo.", margin, cy);
        cy += 10;
      } else {
        const maxSessions = Math.max(...sessionsTime.map((s) => s.count), 1);
        autoTable(doc, {
          startY: cy,
          head: [["Fecha", "Sesiones", "Tendencia"]],
          body: sessionsTime.map((s) => [
            new Date(s.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" }),
            String(s.count),
            "█".repeat(Math.max(1, Math.round((s.count / maxSessions) * 25))),
          ]),
          theme: "striped",
          margin: { left: margin, right: margin },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 2, textColor: C.ink },
          headStyles: { fillColor: C.primary, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { halign: "right", cellWidth: 25, fontStyle: "bold", textColor: C.primaryDark },
            2: { textColor: C.primary, font: "courier" },
          },
        });
        // @ts-expect-error — autoTable agrega lastAutoTable al doc
        cy = doc.lastAutoTable.finalY + 10;
      }

      // ── Sección: Atención promedio ──
      cy = sectionHeader("2. Atención y bienestar", cy);
      cy = sectionSubtitle("Nivel de atención detectado mediante el monitoreo de cámara", cy);

      if (attention.length === 0) {
        setText(C.inkFaint);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("Sin datos de atención en este periodo.", margin, cy);
        cy += 10;
      } else {
        autoTable(doc, {
          startY: cy,
          head: [["Fecha", "Atención promedio", "Nivel"]],
          body: attention.map((a) => {
            const pct = Math.round(a.avg * 100);
            const nivel = pct >= 70 ? "Alta" : pct >= 40 ? "Media" : "Baja";
            return [
              new Date(a.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" }),
              `${pct}%`,
              nivel,
            ];
          }),
          theme: "striped",
          margin: { left: margin, right: margin },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 2, textColor: C.ink },
          headStyles: { fillColor: C.primary, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 35 },
            1: { halign: "right", cellWidth: 35, fontStyle: "bold", textColor: C.primaryDark },
            2: { halign: "center", cellWidth: 30 },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 2) {
              const txt = String(data.cell.text[0] || "");
              if (txt === "Alta")  data.cell.styles.textColor = C.ok;
              if (txt === "Media") data.cell.styles.textColor = C.warn;
              if (txt === "Baja")  data.cell.styles.textColor = C.err;
              data.cell.styles.fontStyle = "bold";
            }
          },
        });
        // @ts-expect-error
        cy = doc.lastAutoTable.finalY + 10;
      }

      // Insight de stimming
      if (stimming && stimming.total_samples > 0) {
        setFill(C.bgSoft);
        doc.roundedRect(margin, cy, pageW - 2 * margin, 14, 2, 2, "F");
        setText(C.primaryDark);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text("Indicador de stimming", margin + 3, cy + 6);
        setText(C.ink);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(
          `Se detectó stimming en el ${Math.round(stimming.rate * 100)}% de ${stimming.total_samples} muestras analizadas durante el periodo.`,
          margin + 3, cy + 11,
        );
        cy += 20;
      }

      // ── Sección: Distribución emocional ──
      cy = sectionHeader("3. Distribución emocional", cy);
      cy = sectionSubtitle("Frecuencia de emociones detectadas en los estudiantes", cy);

      if (emotions.length === 0) {
        setText(C.inkFaint);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("Sin datos emocionales en este periodo.", margin, cy);
        cy += 10;
      } else {
        const totalEmo = emotions.reduce((s, e) => s + e.count, 0);
        autoTable(doc, {
          startY: cy,
          head: [["Emoción", "Cantidad", "Porcentaje", "Distribución"]],
          body: emotions.map((e) => {
            const pct = totalEmo > 0 ? (e.count / totalEmo) * 100 : 0;
            const bars = "█".repeat(Math.max(1, Math.round(pct / 4)));
            return [
              EMOTION_INFO[e.emotion]?.label ?? e.emotion,
              String(e.count),
              `${pct.toFixed(1)}%`,
              bars,
            ];
          }),
          theme: "striped",
          margin: { left: margin, right: margin },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 2, textColor: C.ink },
          headStyles: { fillColor: C.primary, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { fontStyle: "bold", cellWidth: 40 },
            1: { halign: "right", cellWidth: 25 },
            2: { halign: "right", cellWidth: 25, textColor: C.primaryDark, fontStyle: "bold" },
            3: { textColor: C.accent, font: "courier" },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 0) {
              const txt = String(data.cell.text[0] || "").toLowerCase();
              const key = Object.keys(EMOTION_INFO).find(
                (k) => EMOTION_INFO[k].label.toLowerCase() === txt,
              );
              if (key) {
                const hex = EMOTION_INFO[key].color;
                const r = parseInt(hex.substring(1, 3), 16);
                const g = parseInt(hex.substring(3, 5), 16);
                const b = parseInt(hex.substring(5, 7), 16);
                data.cell.styles.textColor = [r, g, b];
              }
            }
          },
        });
        // @ts-expect-error
        cy = doc.lastAutoTable.finalY + 10;
      }

      // ── Sección: Crisis ──
      cy = sectionHeader("4. Eventos de crisis", cy);
      cy = sectionSubtitle("Resumen de episodios detectados y su atención", cy);

      const crisisRows: Array<[string, string]> = [
        ["Crisis leves",            `${crisisSum?.by_severity.leve ?? 0}`],
        ["Crisis moderadas",        `${crisisSum?.by_severity.moderada ?? 0}`],
        ["Crisis graves",           `${crisisSum?.by_severity.grave ?? 0}`],
        ["Resueltas",               `${crisisSum?.by_status.resolved ?? 0}`],
        ["Pendientes",              `${crisisSum?.by_status.unresolved ?? 0}`],
        ["Tiempo medio resolución", `${crisisSum?.avg_resolution_minutes ?? 0} min`],
      ];
      autoTable(doc, {
        startY: cy,
        head: [["Métrica", "Valor"]],
        body: crisisRows,
        theme: "grid",
        margin: { left: margin, right: margin },
        styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: C.ink },
        headStyles: { fillColor: C.primary, textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "right", cellWidth: 50, fontStyle: "bold" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 1) {
            const label = String(data.row.cells[0].text[0] || "").toLowerCase();
            if (label.includes("graves"))       data.cell.styles.textColor = C.err;
            else if (label.includes("moderadas")) data.cell.styles.textColor = [249, 115, 22];
            else if (label.includes("leves"))    data.cell.styles.textColor = C.warn;
            else if (label.includes("resueltas")) data.cell.styles.textColor = C.ok;
            else if (label.includes("pendientes")) data.cell.styles.textColor = C.err;
            else data.cell.styles.textColor = C.primaryDark;
          }
        },
      });
      // @ts-expect-error
      cy = doc.lastAutoTable.finalY + 10;

      // ── Sección: Estudiantes por grado ──
      cy = sectionHeader("5. Demografía estudiantil", cy);
      cy = sectionSubtitle("Estudiantes activos por grado escolar", cy);

      autoTable(doc, {
        startY: cy,
        head: [["Grado", "Estudiantes"]],
        body: byGrade.map((g) => [g.grade_name, String(g.count)]),
        theme: "striped",
        margin: { left: margin, right: margin },
        styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: C.ink },
        headStyles: { fillColor: C.primary, textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "right", cellWidth: 50, fontStyle: "bold", textColor: C.primaryDark },
        },
      });
      // @ts-expect-error
      cy = doc.lastAutoTable.finalY + 10;

      // ── Sección: Uso por materia ──
      cy = sectionHeader("6. Uso académico", cy);
      cy = sectionSubtitle("Actividad por materia en el periodo seleccionado", cy);

      if (bySubject.length === 0) {
        setText(C.inkFaint);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("Sin uso registrado en este periodo.", margin, cy);
        cy += 10;
      } else {
        autoTable(doc, {
          startY: cy,
          head: [["Materia", "Ejecuciones", "Completadas", "Score promedio"]],
          body: bySubject.map((s) => [
            s.subject,
            String(s.runs),
            String(s.completed),
            s.avg_score != null ? s.avg_score.toFixed(1) : "—",
          ]),
          theme: "striped",
          margin: { left: margin, right: margin },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: C.ink },
          headStyles: { fillColor: C.primary, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { fontStyle: "bold" },
            1: { halign: "right", cellWidth: 30, textColor: C.primaryDark, fontStyle: "bold" },
            2: { halign: "right", cellWidth: 30 },
            3: { halign: "right", cellWidth: 30, fontStyle: "bold" },
          },
        });
        // @ts-expect-error
        cy = doc.lastAutoTable.finalY + 10;
      }

      // ── Sección: Top de actividades ──
      cy = sectionHeader("7. Actividades más utilizadas", cy);
      cy = sectionSubtitle("Ranking por número de ejecuciones", cy);

      if (topAct.length === 0) {
        setText(C.inkFaint);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("Aún no hay actividades ejecutadas en este periodo.", margin, cy);
        cy += 10;
      } else {
        autoTable(doc, {
          startY: cy,
          head: [["#", "Actividad", "Materia", "Ejec.", "Score", "Completitud"]],
          body: topAct.map((a, i) => [
            String(i + 1),
            a.title,
            a.subject,
            String(a.total_runs),
            a.avg_score != null ? a.avg_score.toFixed(1) : "—",
            `${Math.round(a.completion_rate * 100)}%`,
          ]),
          theme: "striped",
          margin: { left: margin, right: margin },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: C.ink },
          headStyles: { fillColor: C.primary, textColor: [255, 255, 255], fontStyle: "bold" },
          columnStyles: {
            0: { halign: "center", cellWidth: 10, fontStyle: "bold", textColor: C.inkFaint },
            1: { fontStyle: "bold", cellWidth: 55 },
            2: { cellWidth: 35, textColor: C.inkSoft },
            3: { halign: "right", cellWidth: 18, fontStyle: "bold", textColor: C.primaryDark },
            4: { halign: "right", cellWidth: 18 },
            5: { halign: "right", cellWidth: 25, fontStyle: "bold" },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 5) {
              const txt = String(data.cell.text[0] || "");
              const pct = parseInt(txt.replace("%", ""), 10);
              if (pct >= 70) data.cell.styles.textColor = C.ok;
              else if (pct >= 40) data.cell.styles.textColor = C.warn;
              else data.cell.styles.textColor = C.err;
            }
          },
        });
      }

      /* ── Pie de página en todas las páginas ── */
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        setStroke(C.border);
        doc.setLineWidth(0.3);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);

        setText(C.inkFaint);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text("Aula Global · Documento confidencial", margin, pageH - 7);
        doc.text(`Página ${i} de ${pageCount}`, pageW - margin - 22, pageH - 7);
      }

      const fname = `aulaglobal-reportes-${startDate}_a_${endDate}.pdf`;
      doc.save(fname);
    } catch (err) {
      console.error("Error al exportar PDF:", err);
      alert("No se pudo generar el PDF. Revisa la consola.");
    } finally {
      setExporting(false);
    }
  };

  /* ════════════════════════════════════════════════════════════ */
  const formatDateShort = (iso: string) => {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
    <div className="space-y-6">

      {/* ═══════════ Barra de control (rango + export) ═══════════ */}
      <div
        className="rounded-[1.25rem] p-4 flex flex-wrap items-end gap-4"
        style={{
          background: "white",
          border: `1.5px solid ${COLORS.border}`,
          boxShadow: "0 2px 12px rgba(127,179,213,0.09)",
        }}
      >
        {/* Presets */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.inkFaint }}>
            Rápido
          </label>
          <div className="flex gap-1.5">
            {[
              { d: 7,   l: "7 d" },
              { d: 30,  l: "30 d" },
              { d: 90,  l: "90 d" },
              { d: 365, l: "1 año" },
            ].map((p) => (
              <button key={p.d} onClick={() => applyPreset(p.d)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                style={{
                  background: COLORS.bgSoft,
                  color: COLORS.primaryDark,
                  border: `1px solid ${COLORS.border}`,
                }}>
                {p.l}
              </button>
            ))}
          </div>
        </div>

        {/* Date pickers */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.inkFaint }}>
            Desde
          </label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} max={endDate}
            style={{
              border: `1.5px solid ${COLORS.border}`, borderRadius: "0.75rem",
              padding: "0.5rem 0.75rem", fontSize: "0.875rem",
              color: COLORS.ink, background: "white", outline: "none",
            }} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold uppercase tracking-wide" style={{ color: COLORS.inkFaint }}>
            Hasta
          </label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            min={startDate} max={toISODate(new Date())}
            style={{
              border: `1.5px solid ${COLORS.border}`, borderRadius: "0.75rem",
              padding: "0.5rem 0.75rem", fontSize: "0.875rem",
              color: COLORS.ink, background: "white", outline: "none",
            }} />
        </div>

        <button onClick={applyCustomRange}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
          style={{ background: COLORS.primary, boxShadow: "0 2px 8px rgba(127,179,213,0.35)" }}>
          <Calendar className="w-4 h-4" />
          Aplicar
        </button>

        <div className="flex-1" />

        {/* Export PDF */}
        <button onClick={exportToPDF} disabled={exporting || loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all"
          style={{
            background: (exporting || loading) ? "#f0c89a" : `linear-gradient(135deg,${COLORS.accent},${COLORS.accentDark})`,
            boxShadow: (exporting || loading) ? "none" : "0 3px 14px rgba(255,148,80,0.38)",
            cursor: (exporting || loading) ? "not-allowed" : "pointer",
          }}>
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generando PDF…
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4" />
              Exportar PDF
            </>
          )}
        </button>
      </div>

      {/* Periodo activo */}
      <div className="text-xs flex items-center gap-2" style={{ color: COLORS.inkSoft }}>
        <Calendar className="w-3.5 h-3.5" />
        Mostrando datos del <strong style={{ color: COLORS.ink }}>{formatNiceDate(activeRange.start_date!)}</strong>
        &nbsp;al&nbsp; <strong style={{ color: COLORS.ink }}>{formatNiceDate(activeRange.end_date!)}</strong>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-10 h-10 animate-spin" style={{ color: COLORS.primary }} />
        </div>
      ) : (
        <div className="space-y-6">

          {/* ═══════════ KPIs ═══════════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard label="Usuarios totales" value={overview?.users.total ?? 0}
              sub={`${overview?.users.students ?? 0} estudiantes · ${overview?.users.tutors ?? 0} tutores`}
              icon={<Users className="w-5 h-5" />} color={COLORS.primaryDark} />
            <KpiCard label="Sesiones del periodo" value={overview?.sessions.total ?? 0}
              sub={`${overview?.sessions.active_students_7d ?? 0} estudiantes activos`}
              icon={<Activity className="w-5 h-5" />} color={COLORS.accentDark} />
            <KpiCard label="Atención promedio"
              value={`${Math.round(((overview?.wellbeing.avg_attention_30d ?? 0) * 100))}%`}
              sub="en el periodo seleccionado"
              icon={<Brain className="w-5 h-5" />} color="#a855f7" />
            <KpiCard label="Crisis sin resolver" value={overview?.crisis.unresolved ?? 0}
              sub={`de ${overview?.crisis.total ?? 0} en el periodo`}
              icon={<AlertTriangle className="w-5 h-5" />}
              color={(overview?.crisis.unresolved ?? 0) > 0 ? COLORS.err : COLORS.ok} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard label="Actividades publicadas" value={overview?.content.activities ?? 0}
              icon={<BookOpen className="w-5 h-5" />} color={COLORS.primaryDark} />
            <KpiCard label="Duración media sesión" value={`${overview?.sessions.avg_minutes ?? 0} min`}
              sub="en el periodo"
              icon={<TrendingUp className="w-5 h-5" />} color={COLORS.accentDark} />
            <KpiCard label="Stimming detectado"
              value={`${Math.round((stimming?.rate ?? 0) * 100)}%`}
              sub={`${stimming?.total_samples ?? 0} muestras`}
              icon={<Heart className="w-5 h-5" />} color="#ec4899" />
          </div>

          {/* ═══════════ Charts ═══════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card title="Sesiones por día" subtitle="Distribución temporal"
              icon={<Activity className="w-4 h-4" />}>
              <BarChart data={sessionsTime.map((d) => ({
                label: formatDateShort(d.date), value: d.count,
              }))} />
            </Card>

            <Card title="Tendencia de atención" subtitle="Promedio diario"
              icon={<Brain className="w-4 h-4" />}>
              <LineChart data={attention.map((d) => ({ label: formatDateShort(d.date), value: d.avg }))}
                color="#a855f7" valueFormatter={(v) => `${Math.round(v * 100)}%`} />
            </Card>

            <Card title="Distribución emocional" subtitle="Emociones detectadas"
              icon={<Smile className="w-4 h-4" />}>
              <DonutChart data={emotions.map((e) => ({
                label: EMOTION_INFO[e.emotion]?.label ?? e.emotion,
                value: e.count,
                color: EMOTION_INFO[e.emotion]?.color ?? COLORS.inkFaint,
              }))} />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card title="Estudiantes por grado" subtitle="Total activos"
              icon={<Users className="w-4 h-4" />}>
              <BarChart data={byGrade.map((g) => ({
                label: g.grade_name.substring(0, 3), value: g.count, color: COLORS.primary,
              }))} height={180} />
              <div className="mt-3 space-y-1.5">
                {byGrade.map((g) => (
                  <div key={g.level} className="flex items-center justify-between text-xs">
                    <span style={{ color: COLORS.inkSoft }}>{g.grade_name}</span>
                    <span className="font-bold" style={{ color: COLORS.ink }}>{g.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Resumen de crisis" subtitle="En el periodo"
              icon={<AlertTriangle className="w-4 h-4" />}>
              <DonutChart data={[
                { label: "Leve",     value: crisisSum?.by_severity.leve     ?? 0, color: "#fbbf24" },
                { label: "Moderada", value: crisisSum?.by_severity.moderada ?? 0, color: "#f97316" },
                { label: "Grave",    value: crisisSum?.by_severity.grave    ?? 0, color: "#ef4444" },
              ]} size={170} />
              <div className="mt-3 pt-3 border-t" style={{ borderColor: COLORS.border }}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: COLORS.inkSoft }}>✓ Resueltas</span>
                  <span className="font-bold" style={{ color: COLORS.ok }}>{crisisSum?.by_status.resolved ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: COLORS.inkSoft }}>⏳ Pendientes</span>
                  <span className="font-bold" style={{ color: COLORS.err }}>{crisisSum?.by_status.unresolved ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: COLORS.inkSoft }}>⏱ Tiempo medio</span>
                  <span className="font-bold" style={{ color: COLORS.ink }}>{crisisSum?.avg_resolution_minutes ?? 0} min</span>
                </div>
              </div>
            </Card>

            <Card title="Uso por materia" subtitle="Ejecuciones en el periodo"
              icon={<BookOpen className="w-4 h-4" />}>
              {bySubject.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: COLORS.inkFaint }}>Sin datos</p>
              ) : (
                <div className="space-y-2">
                  {bySubject.slice(0, 7).map((s, i) => {
                    const max = Math.max(...bySubject.map((x) => x.runs), 1);
                    const pct = (s.runs / max) * 100;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold truncate" style={{ color: COLORS.ink, maxWidth: "70%" }}>{s.subject}</span>
                          <span className="font-bold" style={{ color: COLORS.primaryDark }}>{s.runs}</span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: COLORS.bgSoft }}>
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, background: COLORS.primary }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ═══════════ Top de actividades ═══════════ */}
          <Card title="Actividades más usadas" subtitle="Ranking por número de ejecuciones"
            icon={<Award className="w-4 h-4" />}>
            {topAct.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: COLORS.inkFaint }}>
                Aún no hay actividades ejecutadas en este periodo
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 600 }}>
                  <thead>
                    <tr style={{ color: COLORS.inkFaint, fontSize: 11, textTransform: "uppercase" }}>
                      <th className="text-left pb-2 font-bold">#</th>
                      <th className="text-left pb-2 font-bold">Actividad</th>
                      <th className="text-left pb-2 font-bold">Materia</th>
                      <th className="text-right pb-2 font-bold">Ejecuciones</th>
                      <th className="text-right pb-2 font-bold">Score</th>
                      <th className="text-right pb-2 font-bold">Completitud</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAct.map((a, i) => (
                      <tr key={a.id_activity} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                        <td className="py-3 font-bold" style={{ color: COLORS.inkFaint }}>{i + 1}</td>
                        <td className="py-3 font-semibold" style={{ color: COLORS.ink }}>{a.title}</td>
                        <td className="py-3" style={{ color: COLORS.inkSoft }}>{a.subject}</td>
                        <td className="py-3 text-right font-bold" style={{ color: COLORS.primaryDark }}>{a.total_runs}</td>
                        <td className="py-3 text-right" style={{ color: COLORS.ink }}>
                          {a.avg_score != null ? a.avg_score.toFixed(1) : "—"}
                        </td>
                        <td className="py-3 text-right">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                            style={{
                              background: a.completion_rate >= 0.7 ? "#dcfce7" : a.completion_rate >= 0.4 ? "#fef9c3" : "#fee2e2",
                              color:      a.completion_rate >= 0.7 ? COLORS.ok : a.completion_rate >= 0.4 ? COLORS.warn : COLORS.err,
                            }}>
                            {Math.round(a.completion_rate * 100)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

        </div>
      )}
    </div>
  );
}
