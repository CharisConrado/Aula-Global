"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Check, Loader2, Upload, Trash2, Link2 } from "lucide-react";

// ── Tipos locales ─────────────────────────────────────────────────────
interface ActivityTypeLocal { id_type_activity: string; name: string; description: string; }
interface SubjectLocal      { id_subject: string; id_degree: string; subject_name: string; }
interface DegreeLocal       { id_degree: string; grade_name: string; level: number; }
interface QuizPregunta      { texto: string; opciones: [string, string, string, string]; correcta: number; }
interface Par               { a: string; b: string; }
interface Oracion           { texto: string; respuesta: string; }

export interface ActivityCreatorFormProps {
  token:         string;
  activityTypes: ActivityTypeLocal[];
  degrees:       DegreeLocal[];
  subjects:      SubjectLocal[];
  onCreated:     (activity: unknown) => void;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Opciones de tipo evaluativo (lo que el ESTUDIANTE hace) ────────────
const TIPO_EVAL_OPTIONS = [
  { value: "quiz",              emoji: "🧠", label: "Quiz",         desc: "Selección múltiple" },
  { value: "emparejar",         emoji: "🔗", label: "Emparejar",    desc: "Unir conceptos" },
  { value: "completar",         emoji: "✏️", label: "Completar",    desc: "Rellenar huecos" },
  { value: "dibujo",            emoji: "🎨", label: "Dibujar",      desc: "Canvas libre" },
  { value: "video_upload",      emoji: "🎥", label: "Video",        desc: "Grabar y entregar" },
  { value: "ejercicio_archivo", emoji: "📐", label: "Ejercicio",    desc: "Resolver y subir" },
  { value: "lectura",           emoji: "📖", label: "Lectura",      desc: "Leer y resumir" },
] as const;

type TipoEval = typeof TIPO_EVAL_OPTIONS[number]["value"];

// Mapa tipoEval → nombre del tipo en la BD (para buscar el id_type_activity)
const TIPO_EVAL_TO_DB: Record<TipoEval, string> = {
  quiz:              "quiz",
  emparejar:         "asociar",
  completar:         "completar",
  dibujo:            "dibujo",
  video_upload:      "video",
  ejercicio_archivo: "ejercicio",
  lectura:           "lectura",
};

const QUIZ_COLORS = [
  { bg: "#e53935", light: "#ffebee" },
  { bg: "#1e88e5", light: "#e3f2fd" },
  { bg: "#f9a825", light: "#fffde7" },
  { bg: "#43a047", light: "#e8f5e9" },
] as const;

const LABELS = ["A", "B", "C", "D"];

// ── Estilos base ──────────────────────────────────────────────────────
const inputBase: React.CSSProperties = {
  border: "1.5px solid #D5DBDB",
  borderRadius: "0.75rem",
  padding: "0.65rem 1rem",
  fontSize: "0.875rem",
  outline: "none",
  color: "#34495E",
  background: "white",
  width: "100%",
  transition: "border-color 0.15s",
};

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "#7FB3D5";
}
function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "#D5DBDB";
}

// ── Helpers de layout ─────────────────────────────────────────────────
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" style={{ color: "#34495E" }}>
        {label}{required && <span style={{ color: "#FFB37B" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pt-3 space-y-3" style={{ borderTop: "1.5px dashed #D5DBDB" }}>
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#FFB37B" }}>{label}</p>
      {children}
    </div>
  );
}

// ── FileUploadBtn ─────────────────────────────────────────────────────
function FileUploadBtn({
  label, accept, uploading, url, onUpload, onClear,
}: {
  label: string; accept: string; uploading: boolean; url: string | null;
  onUpload: (f: File) => void; onClear: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" style={{ color: "#7f8c8d" }}>{label}</p>
      {url ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "#dcfce7", border: "1.5px solid #86efac" }}>
          <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#16a34a" }} />
          <span className="text-xs font-semibold flex-1 truncate" style={{ color: "#15803d" }}>
            Archivo subido correctamente
          </span>
          <button type="button" onClick={onClear}>
            <X className="w-3.5 h-3.5" style={{ color: "#16a34a" }} />
          </button>
        </div>
      ) : (
        <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer"
          style={{ border: "1.5px dashed #D5DBDB", background: uploading ? "#f8f9fa" : "white" }}>
          {uploading
            ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "#7FB3D5" }} />
            : <Upload className="w-4 h-4 flex-shrink-0" style={{ color: "#a0aec0" }} />}
          <span className="text-xs font-semibold" style={{ color: "#a0aec0" }}>
            {uploading ? "Subiendo…" : "Seleccionar archivo"}
          </span>
          <input type="file" accept={accept} className="hidden" disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { onUpload(f); e.target.value = ""; }
            }} />
        </label>
      )}
    </div>
  );
}

// ── SimpleList (lista de strings) ─────────────────────────────────────
function SimpleList({ items, placeholder, singularLabel, onChange }: {
  items: string[]; placeholder: string; singularLabel: string;
  onChange: (items: string[]) => void;
}) {
  const add    = () => onChange([...items, ""]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i: number, v: string) => {
    const n = [...items]; n[i] = v; onChange(n);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: "#7f8c8d" }}>
          {items.length} {singularLabel}{items.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={add}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: "#E1EFFF", color: "#4587a9" }}>
          <Plus className="w-3 h-3" />Agregar
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
            style={{ background: "#7FB3D5" }}>{i + 1}</span>
          <input
            type="text"
            placeholder={placeholder}
            value={item}
            onChange={(e) => update(i, e.target.value)}
            onFocus={focusBorder} onBlur={blurBorder}
            style={{ ...inputBase, flex: 1, width: "auto", padding: "0.5rem 0.75rem" }}
          />
          {items.length > 1 && (
            <button type="button" onClick={() => remove(i)}>
              <Trash2 className="w-3.5 h-3.5" style={{ color: "#a0aec0" }} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── QuizBuilder ───────────────────────────────────────────────────────
function QuizBuilder({ preguntas, onChange }: { preguntas: QuizPregunta[]; onChange: (p: QuizPregunta[]) => void }) {
  const add = () =>
    onChange([...preguntas, { texto: "", opciones: ["", "", "", ""], correcta: 0 }]);

  const remove = (i: number) => onChange(preguntas.filter((_, idx) => idx !== i));

  const setTexto = (i: number, v: string) => {
    const n = [...preguntas]; n[i] = { ...n[i], texto: v }; onChange(n);
  };

  const setOpcion = (pi: number, oi: number, v: string) => {
    const n = [...preguntas];
    const opts = [...n[pi].opciones] as [string, string, string, string];
    opts[oi] = v; n[pi] = { ...n[pi], opciones: opts }; onChange(n);
  };

  const setCorrecta = (pi: number, oi: number) => {
    const n = [...preguntas]; n[pi] = { ...n[pi], correcta: oi }; onChange(n);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: "#7f8c8d" }}>
          {preguntas.length} pregunta{preguntas.length !== 1 ? "s" : ""}
        </span>
        <button type="button" onClick={add}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: "#E1EFFF", color: "#4587a9" }}>
          <Plus className="w-3 h-3" />Agregar pregunta
        </button>
      </div>

      {preguntas.map((p, pi) => (
        <div key={pi} className="p-3 rounded-xl space-y-2.5"
          style={{ background: "#f8f9fa", border: "1.5px solid #D5DBDB" }}>
          {/* Encabezado pregunta */}
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
              style={{ background: "#7FB3D5" }}>{pi + 1}</span>
            <input
              type="text"
              placeholder="Escribe la pregunta…"
              value={p.texto}
              onChange={(e) => setTexto(pi, e.target.value)}
              className="flex-1 text-sm font-semibold bg-transparent outline-none"
              style={{ color: "#34495E" }}
            />
            {preguntas.length > 1 && (
              <button type="button" onClick={() => remove(pi)}>
                <Trash2 className="w-3.5 h-3.5" style={{ color: "#a0aec0" }} />
              </button>
            )}
          </div>

          {/* Opciones estilo Kahoot */}
          <div className="grid grid-cols-2 gap-1.5">
            {QUIZ_COLORS.map((c, oi) => {
              const isOk = p.correcta === oi;
              return (
                <div key={oi}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg"
                  style={{
                    background: isOk ? c.light : "white",
                    border: `1.5px solid ${isOk ? c.bg : "#E5E7EB"}`,
                    transition: "all 0.15s",
                  }}>
                  {/* Radio correcto */}
                  <button type="button" onClick={() => setCorrecta(pi, oi)}
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: c.bg, background: isOk ? c.bg : "white", transition: "all 0.15s" }}>
                    {isOk && <Check className="w-2.5 h-2.5 text-white" />}
                  </button>
                  <span className="text-[10px] font-black flex-shrink-0" style={{ color: c.bg }}>
                    {LABELS[oi]}
                  </span>
                  <input
                    type="text"
                    placeholder={`Opción ${oi + 1}`}
                    value={p.opciones[oi]}
                    onChange={(e) => setOpcion(pi, oi, e.target.value)}
                    className="flex-1 min-w-0 text-xs bg-transparent outline-none"
                    style={{ color: "#34495E" }}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[10px] font-semibold" style={{ color: "#a0aec0" }}>
            Haz clic en el círculo de color para marcar la respuesta correcta
          </p>
        </div>
      ))}
    </div>
  );
}

// ── ParesList (Emparejar / Asociar) ───────────────────────────────────
function ParesList({ pares, labelA, labelB, onAdd, onUpdate, onRemove }: {
  pares: Par[]; labelA: string; labelB: string;
  onAdd: () => void;
  onUpdate: (i: number, side: "a" | "b", v: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: "#7f8c8d" }}>
          {pares.length} par{pares.length !== 1 ? "es" : ""}
        </span>
        <button type="button" onClick={onAdd}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: "#E1EFFF", color: "#4587a9" }}>
          <Plus className="w-3 h-3" />Agregar par
        </button>
      </div>

      {pares.map((par, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text" placeholder={labelA} value={par.a}
            onChange={(e) => onUpdate(i, "a", e.target.value)}
            onFocus={focusBorder} onBlur={blurBorder}
            style={{ ...inputBase, padding: "0.5rem 0.75rem", flex: 1, width: "auto" }}
          />
          <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a0aec0" }} />
          <input
            type="text" placeholder={labelB} value={par.b}
            onChange={(e) => onUpdate(i, "b", e.target.value)}
            onFocus={focusBorder} onBlur={blurBorder}
            style={{ ...inputBase, padding: "0.5rem 0.75rem", flex: 1, width: "auto" }}
          />
          {pares.length > 1 && (
            <button type="button" onClick={() => onRemove(i)}>
              <Trash2 className="w-3.5 h-3.5" style={{ color: "#a0aec0" }} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── CompletarBuilder ──────────────────────────────────────────────────
function CompletarBuilder({
  oraciones, onChange,
}: {
  oraciones: Oracion[];
  onChange: (o: Oracion[]) => void;
}) {
  const add    = () => onChange([...oraciones, { texto: "", respuesta: "" }]);
  const remove = (i: number) => onChange(oraciones.filter((_, idx) => idx !== i));
  const update = (i: number, field: keyof Oracion, val: string) => {
    const n = [...oraciones]; n[i] = { ...n[i], [field]: val }; onChange(n);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold" style={{ color: "#7f8c8d" }}>
          {oraciones.length} oración{oraciones.length !== 1 ? "es" : ""}
        </span>
        <button type="button" onClick={add}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ background: "#E1EFFF", color: "#4587a9" }}>
          <Plus className="w-3 h-3" />Agregar oración
        </button>
      </div>

      {oraciones.map((o, i) => (
        <div key={i} className="p-3 rounded-xl space-y-2"
          style={{ background: "#f8f9fa", border: "1.5px solid #D5DBDB" }}>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
              style={{ background: "#7FB3D5" }}>{i + 1}</span>
            <span className="text-xs font-semibold flex-1" style={{ color: "#7f8c8d" }}>
              Usa ___ para marcar el espacio en blanco
            </span>
            {oraciones.length > 1 && (
              <button type="button" onClick={() => remove(i)}>
                <Trash2 className="w-3.5 h-3.5" style={{ color: "#a0aec0" }} />
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder='Ej: "El cielo es de color ___"'
            value={o.texto}
            onChange={(e) => update(i, "texto", e.target.value)}
            style={{ ...inputBase, fontSize: "0.8rem" }}
            onFocus={focusBorder} onBlur={blurBorder}
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold flex-shrink-0 px-2 py-1 rounded-lg"
              style={{ background: "#dcfce7", color: "#16a34a" }}>
              Respuesta:
            </span>
            <input
              type="text"
              placeholder="Respuesta correcta"
              value={o.respuesta}
              onChange={(e) => update(i, "respuesta", e.target.value)}
              style={{ ...inputBase, fontSize: "0.8rem" }}
              onFocus={focusBorder} onBlur={blurBorder}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────
export default function ActivityCreatorForm({
  token, activityTypes, degrees, subjects, onCreated,
}: ActivityCreatorFormProps) {
  /* ── Estado común ── */
  const [title,            setTitle]            = useState("");
  const [description,      setDescription]      = useState("");
  const [subjectId,        setSubjectId]        = useState("");
  const [tipoEval,         setTipoEval]         = useState<TipoEval>("quiz");
  const [difficulty,       setDifficulty]       = useState<"facil" | "medio" | "dificil">("facil");
  const [estimatedMinutes, setEstimatedMinutes] = useState(20);
  const [instruction,      setInstruction]      = useState("");

  /* ── Presentación (todas las actividades) ── */
  const [presentacionUrl,       setPresentacionUrl]       = useState<string | null>(null);
  const [presentacionUploading, setPresentacionUploading] = useState(false);

  /* ── Quiz ── */
  const [preguntas, setPreguntas] = useState<QuizPregunta[]>([
    { texto: "", opciones: ["", "", "", ""], correcta: 0 },
  ]);

  /* ── Emparejar ── */
  const [pares, setPares] = useState<Par[]>([{ a: "", b: "" }]);

  /* ── Completar ── */
  const [oraciones, setOraciones] = useState<Oracion[]>([{ texto: "", respuesta: "" }]);

  /* ── Video upload: puntos clave que el estudiante debe cubrir ── */
  const [puntosClave, setPuntosClave] = useState<string[]>([""]);

  /* ── Ejercicio archivo: lista de ejercicios a resolver ── */
  const [ejerciciosList, setEjerciciosList] = useState<string[]>([""]);

  /* ── Submit ── */
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  /* ── Helpers ── */
  const uploadFile = async (file: File, fileType: string): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("file_type", fileType);
    const res = await fetch(`${API}/api/activities/upload-file`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ detail: "Error subiendo archivo" }));
      throw new Error((e as { detail: string }).detail || "Error");
    }
    return ((await res.json()) as { url: string }).url;
  };

  const handleUpload = async (
    file: File, ft: string,
    setLoading: (v: boolean) => void,
    setUrl: (u: string) => void,
  ) => {
    setLoading(true);
    try { setUrl(await uploadFile(file, ft)); }
    catch (e) { setBanner({ type: "err", msg: e instanceof Error ? e.message : "Error subiendo archivo" }); }
    finally  { setLoading(false); }
  };

  const updatePar = (i: number, side: "a" | "b", val: string) => {
    const n = [...pares]; n[i] = { ...n[i], [side]: val }; setPares(n);
  };

  const reset = () => {
    setTitle(""); setDescription(""); setSubjectId(""); setInstruction(""); setEstimatedMinutes(20);
    setTipoEval("quiz"); setPresentacionUrl(null);
    setPreguntas([{ texto: "", opciones: ["", "", "", ""], correcta: 0 }]);
    setPares([{ a: "", b: "" }]);
    setOraciones([{ texto: "", respuesta: "" }]);
    setPuntosClave([""]);
    setEjerciciosList([""]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) { setBanner({ type: "err", msg: "Selecciona una materia" }); return; }

    // Encontrar el id_type_activity correspondiente en la BD
    const dbTypeName  = TIPO_EVAL_TO_DB[tipoEval];
    const matchedType = activityTypes.find((t) =>
      t.name.toLowerCase().includes(dbTypeName)
    );
    const computedTypeId = matchedType?.id_type_activity ?? activityTypes[0]?.id_type_activity ?? "";

    // Construir content
    const content: Record<string, unknown> = {
      tipo_evaluacion:  tipoEval,
      instruccion:      instruction,
      presentacion_url: presentacionUrl,
    };

    if (tipoEval === "quiz")              content.preguntas    = preguntas;
    if (tipoEval === "emparejar")         content.pares        = pares;
    if (tipoEval === "completar")         content.oraciones    = oraciones;
    if (tipoEval === "video_upload")      content.puntos_clave = puntosClave.filter((p) => p.trim());
    if (tipoEval === "ejercicio_archivo") content.ejercicios   = ejerciciosList.filter((e) => e.trim());

    setSubmitting(true); setBanner(null);
    try {
      const res = await fetch(`${API}/api/activities/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id_subject:         subjectId,
          id_type_activity:   computedTypeId,
          title,
          description:        description || null,
          difficulty_level:   difficulty,
          publication_status: "publicado",
          estimated_minutes:  estimatedMinutes,
          content,
          thumbnail_url:      null,
        }),
      });

      if (res.ok) {
        onCreated(await res.json());
        setBanner({ type: "ok", msg: "Actividad creada exitosamente" });
        reset();
        setTimeout(() => setBanner(null), 5000);
      } else {
        const err = await res.json().catch(() => ({ detail: "Error desconocido" }));
        setBanner({ type: "err", msg: (err as { detail: string }).detail || `Error ${res.status}` });
      }
    } catch {
      setBanner({ type: "err", msg: "Error de conexión con el servidor" });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ── */
  return (
    <div
      className="flex-shrink-0 rounded-[1.25rem] p-6 overflow-y-auto"
      style={{
        width: 430, background: "white", border: "1.5px solid #D5DBDB",
        boxShadow: "0 4px 20px rgba(127,179,213,0.10)",
        maxHeight: "calc(100vh - 160px)",
      }}
    >
      {/* Cabecera */}
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}>
          <Plus className="w-4 h-4 text-white" />
        </div>
        <h2 className="text-base font-extrabold" style={{ color: "#34495E" }}>Nueva actividad</h2>
      </div>

      {/* Banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-4"
            style={banner.type === "ok"
              ? { background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d" }
              : { background: "#fee2e2", border: "1.5px solid #fca5a5", color: "#dc2626" }}>
            {banner.type === "ok"
              ? <Check className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <X     className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            {banner.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Título */}
        <Field label="Título" required>
          <input required type="text" placeholder="Nombre de la actividad"
            value={title} onChange={(e) => setTitle(e.target.value)}
            style={inputBase} onFocus={focusBorder} onBlur={blurBorder} />
        </Field>

        {/* Descripción */}
        <Field label="Descripción">
          <textarea rows={2} placeholder="Breve descripción (opcional)"
            value={description} onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputBase, resize: "vertical" }}
            onFocus={focusBorder} onBlur={blurBorder} />
        </Field>

        {/* Materia */}
        <Field label="Materia" required>
          <select required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}
            style={{ ...inputBase, color: subjectId ? "#34495E" : "#a0aec0" }}>
            <option value="">Seleccionar materia…</option>
            {degrees.map((deg) => (
              <optgroup key={deg.id_degree} label={deg.grade_name}>
                {subjects.filter((s) => s.id_degree === deg.id_degree).map((s) => (
                  <option key={s.id_subject} value={s.id_subject}>{s.subject_name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {/* ══ Tipo de actividad evaluativa ══ */}
        <Field label="¿Qué hace el estudiante?" required>
          <div className="grid grid-cols-4 gap-1.5">
            {TIPO_EVAL_OPTIONS.map((opt) => {
              const sel = tipoEval === opt.value;
              return (
                <button key={opt.value} type="button"
                  onClick={() => setTipoEval(opt.value)}
                  className="flex flex-col items-center py-2.5 px-1 rounded-xl transition-all gap-0.5"
                  style={sel
                    ? { background: "#E1EFFF", border: "1.5px solid #7FB3D5", color: "#4587a9" }
                    : { background: "#f8f9fa", border: "1.5px solid transparent", color: "#7f8c8d" }}>
                  <span className="text-lg leading-none">{opt.emoji}</span>
                  <span className="text-[10px] font-bold leading-tight text-center">{opt.label}</span>
                  <span className="text-[9px] leading-tight text-center opacity-70">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {/* Dificultad */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold" style={{ color: "#34495E" }}>
            Dificultad <span style={{ color: "#FFB37B" }}>*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "facil",   label: "Fácil",   bg: "#dcfce7", border: "#86efac", color: "#16a34a" },
              { value: "medio",   label: "Medio",   bg: "#fef9c3", border: "#fde047", color: "#ca8a04" },
              { value: "dificil", label: "Difícil", bg: "#fee2e2", border: "#fca5a5", color: "#dc2626" },
            ] as const).map((opt) => {
              const sel = difficulty === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => setDifficulty(opt.value)}
                  className="py-2 rounded-xl text-xs font-bold transition-all"
                  style={sel
                    ? { background: opt.bg, border: `1.5px solid ${opt.border}`, color: opt.color }
                    : { background: "#f8f9fa", border: "1.5px solid #D5DBDB", color: "#7f8c8d" }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Instrucción */}
        <Field label="Instrucción para el estudiante">
          <textarea rows={2} placeholder="Consigna corta de la actividad…"
            value={instruction} onChange={(e) => setInstruction(e.target.value)}
            style={{ ...inputBase, resize: "vertical" }}
            onFocus={focusBorder} onBlur={blurBorder} />
        </Field>

        {/* ══ Presentación (PPTX / PDF / imagen) ══ */}
        <Section label="Presentación del tema">
          <FileUploadBtn
            label="PPTX, PDF o imagen que el estudiante verá antes de la actividad"
            accept=".pptx,.ppt,.pdf,.jpg,.jpeg,.png,.webp"
            uploading={presentacionUploading}
            url={presentacionUrl}
            onUpload={(f) => handleUpload(f, "presentacion", setPresentacionUploading, setPresentacionUrl)}
            onClear={() => setPresentacionUrl(null)}
          />
          {presentacionUrl && (
            <p className="text-[11px] flex items-center gap-1.5 font-semibold" style={{ color: "#7FB3D5" }}>
              <span>💡</span> Los archivos .pptx se mostrarán tal como están usando el visor de Office
            </p>
          )}
        </Section>

        {/* ══ QUIZ ══ */}
        {tipoEval === "quiz" && (
          <Section label="Preguntas del Quiz — estilo Kahoot">
            <QuizBuilder preguntas={preguntas} onChange={setPreguntas} />
          </Section>
        )}

        {/* ══ EMPAREJAR ══ */}
        {tipoEval === "emparejar" && (
          <Section label="Pares para emparejar">
            <p className="text-xs" style={{ color: "#a0aec0" }}>
              El estudiante unirá cada concepto (izquierda) con su par correcto (derecha).
            </p>
            <ParesList
              pares={pares} labelA="Concepto" labelB="Definición / Par"
              onAdd={() => setPares([...pares, { a: "", b: "" }])}
              onUpdate={updatePar}
              onRemove={(i) => setPares(pares.filter((_, idx) => idx !== i))}
            />
          </Section>
        )}

        {/* ══ COMPLETAR ══ */}
        {tipoEval === "completar" && (
          <Section label="Oraciones para completar">
            <p className="text-xs" style={{ color: "#a0aec0" }}>
              Escribe cada oración usando <span className="font-bold" style={{ color: "#34495E" }}>___</span> donde va el espacio en blanco, y especifica la respuesta correcta.
            </p>
            <CompletarBuilder oraciones={oraciones} onChange={setOraciones} />
          </Section>
        )}

        {/* ══ DIBUJAR ══ */}
        {tipoEval === "dibujo" && (
          <Section label="Actividad de dibujo libre">
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#FDF8F2", border: "1.5px solid #FFB37B" }}>
              <span className="text-xl flex-shrink-0">🎨</span>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: "#7f8c8d" }}>
                El estudiante verá la presentación del tema y luego tendrá un <strong style={{ color: "#34495E" }}>canvas interactivo</strong> para dibujar libremente con colores y pinceles.
              </p>
            </div>
          </Section>
        )}

        {/* ══ VIDEO UPLOAD ══ */}
        {tipoEval === "video_upload" && (
          <Section label="Puntos que el estudiante debe cubrir en su video">
            <p className="text-xs" style={{ color: "#a0aec0" }}>
              Opcional: indica los puntos clave que el estudiante debe mencionar en su video.
            </p>
            <SimpleList
              items={puntosClave}
              placeholder="Ej: Explica las causas del evento…"
              singularLabel="punto clave"
              onChange={setPuntosClave}
            />
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#FDF8F2", border: "1.5px solid #FFB37B" }}>
              <span className="text-xl flex-shrink-0">🎬</span>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: "#7f8c8d" }}>
                El estudiante verá la presentación y luego deberá <strong style={{ color: "#34495E" }}>grabar y subir un video</strong> con su respuesta o explicación.
              </p>
            </div>
          </Section>
        )}

        {/* ══ EJERCICIO ARCHIVO ══ */}
        {tipoEval === "ejercicio_archivo" && (
          <Section label="Ejercicios a resolver">
            <p className="text-xs" style={{ color: "#a0aec0" }}>
              Escribe cada ejercicio que el estudiante debe resolver en su cuaderno o hoja.
            </p>
            <SimpleList
              items={ejerciciosList}
              placeholder="Ej: Resuelve 3x + 5 = 14…"
              singularLabel="ejercicio"
              onChange={setEjerciciosList}
            />
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#FDF8F2", border: "1.5px solid #FFB37B" }}>
              <span className="text-xl flex-shrink-0">📤</span>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: "#7f8c8d" }}>
                El estudiante resolverá los ejercicios en papel y luego <strong style={{ color: "#34495E" }}>subirá una foto o PDF</strong> con sus respuestas.
              </p>
            </div>
          </Section>
        )}

        {/* ══ LECTURA ══ */}
        {tipoEval === "lectura" && (
          <Section label="Tarea de lectura y resumen">
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#FDF8F2", border: "1.5px solid #FFB37B" }}>
              <span className="text-xl flex-shrink-0">📝</span>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: "#7f8c8d" }}>
                El estudiante leerá la <strong style={{ color: "#34495E" }}>presentación del tema</strong> y luego deberá escribir y subir un resumen con sus propias palabras.
              </p>
            </div>
          </Section>
        )}

        {/* Botón crear */}
        <div className="pt-2">
          <button type="submit" disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-all"
            style={{
              background:  submitting ? "#f0c89a" : "linear-gradient(135deg,#FFB37B,#ff9450)",
              boxShadow:   submitting ? "none" : "0 3px 14px rgba(255,148,80,0.38)",
            }}>
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" />Creando…</>
              : <><Plus    className="w-4 h-4" />Crear actividad</>}
          </button>
        </div>
      </form>
    </div>
  );
}
