"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, Upload, CheckCircle, X } from "lucide-react";

interface VideoUploadProps {
  instruccion:   string;
  puntosClave?:  string[];
  onComplete:    (score: number) => void;
}

export default function VideoUpload({ instruccion, puntosClave = [], onComplete }: VideoUploadProps) {
  const inputRef               = useRef<HTMLInputElement>(null);
  const [file,      setFile]   = useState<File | null>(null);
  const [preview,   setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done,      setDone]   = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f || !f.type.startsWith("video/")) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleRemove = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleSubmit = () => {
    if (!file) return;
    setUploading(true);
    // Simula entrega (en producción aquí se subiría a Supabase Storage)
    setTimeout(() => {
      setUploading(false);
      setDone(true);
      setTimeout(() => onComplete(5), 800);
    }, 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="card-kid mb-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-4xl">🎥</span>
          <div>
            <h2 className="text-kid-lg font-extrabold text-gray-700">Entrega tu video</h2>
            <p className="text-sm text-gray-400">Ciencias Sociales</p>
          </div>
        </div>

        {/* Instrucción */}
        <div
          className="rounded-2xl p-4 mb-5 text-base font-semibold leading-relaxed"
          style={{ background: "#F0F7FB", color: "#34495E", border: "1.5px solid #D5DBDB" }}
        >
          🎬 {instruccion}
        </div>

        {/* Puntos clave */}
        {puntosClave.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2">
              Incluye en tu video:
            </p>
            <ul className="space-y-1.5">
              {puntosClave.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm font-medium text-gray-600">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Drop zone / preview */}
        {!preview ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer p-8 text-center"
          >
            <Video className="w-12 h-12 text-blue-300 mx-auto mb-3" />
            <p className="font-bold text-gray-600 mb-1">Arrastra tu video aquí</p>
            <p className="text-sm text-gray-400 mb-4">o haz clic para seleccionar</p>
            <span
              className="inline-block px-5 py-2 rounded-xl font-bold text-white text-sm"
              style={{ background: "linear-gradient(135deg,#60a5fa,#3b82f6)" }}
            >
              <Upload className="w-4 h-4 inline mr-1.5" />
              Seleccionar video
            </span>
            <p className="text-xs text-gray-400 mt-3">MP4, MOV, WebM · máx. 100 MB</p>
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border-2 border-green-200 bg-black">
            <video
              src={preview}
              controls
              className="w-full max-h-72 object-contain"
            />
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {file && !preview && null}

        {/* File info */}
        {file && (
          <p className="text-xs text-gray-400 text-center mt-2 font-semibold">
            📁 {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Submit button */}
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full py-4 rounded-2xl font-extrabold text-white text-base text-center"
            style={{ background: "linear-gradient(135deg,#34d399,#059669)" }}
          >
            <CheckCircle className="w-5 h-5 inline mr-2" />
            ¡Video entregado! 🎉
          </motion.div>
        ) : (
          <motion.button
            key="btn"
            whileHover={{ scale: file ? 1.02 : 1 }}
            whileTap={{ scale: file ? 0.98 : 1 }}
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="w-full py-4 rounded-2xl font-extrabold text-white text-base disabled:opacity-40 flex items-center justify-center gap-3"
            style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 4px 20px rgba(255,148,80,0.4)" }}
          >
            {uploading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                Entregando...
              </>
            ) : (
              <>🎬 Entregar mi video</>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
