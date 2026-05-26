"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Upload, CheckCircle, X, ImageIcon } from "lucide-react";

interface ArchivoUploadProps {
  ejercicios:  string[];
  instruccion: string;
  onComplete:  (score: number) => void;
}

export default function ArchivoUpload({ ejercicios, instruccion, onComplete }: ArchivoUploadProps) {
  const inputRef                    = useRef<HTMLInputElement>(null);
  const [file,       setFile]       = useState<File | null>(null);
  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [done,       setDone]       = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      setImgPreview(URL.createObjectURL(f));
    } else {
      setImgPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) setImgPreview(URL.createObjectURL(f));
  };

  const handleRemove = () => {
    setFile(null);
    if (imgPreview) URL.revokeObjectURL(imgPreview);
    setImgPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleSubmit = () => {
    if (!file) return;
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      setDone(true);
      setTimeout(() => onComplete(5), 800);
    }, 1400);
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Exercises display */}
      <div className="card-kid mb-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-4xl">🧮</span>
          <div>
            <h2 className="text-kid-lg font-extrabold text-gray-700">Ejercicios de matemáticas</h2>
            <p className="text-sm text-gray-400">Resuélvelos y sube tu hoja de trabajo</p>
          </div>
        </div>

        {/* Instruction */}
        <div
          className="rounded-2xl p-4 mb-5 text-sm font-semibold leading-relaxed"
          style={{ background: "#FFF8F0", color: "#34495E", border: "1.5px solid #FFD9A0" }}
        >
          📋 {instruccion}
        </div>

        {/* Exercise list */}
        {ejercicios.length > 0 && (
          <div className="space-y-3 mb-2">
            {ejercicios.map((ej, i) => (
              <div
                key={i}
                className="flex gap-3 items-start rounded-2xl p-4 border-2 border-gray-100 bg-gray-50"
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0 text-white"
                  style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}
                >
                  {i + 1}
                </span>
                <p className="text-base font-semibold text-gray-700 leading-snug">{ej}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload area */}
      <div className="card-kid mb-5">
        <p className="font-extrabold text-gray-700 mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-orange-400" />
          Sube tu hoja con las respuestas
        </p>

        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-orange-200 rounded-2xl bg-orange-50 hover:bg-orange-100 transition-colors cursor-pointer p-8 text-center"
          >
            <div className="flex justify-center gap-4 mb-3">
              <ImageIcon className="w-8 h-8 text-orange-300" />
              <FileText className="w-8 h-8 text-orange-300" />
            </div>
            <p className="font-bold text-gray-600 mb-1">Toma una foto o sube un archivo</p>
            <p className="text-sm text-gray-400 mb-4">Foto de tu hoja, imagen o PDF</p>
            <span
              className="inline-block px-5 py-2 rounded-xl font-bold text-white text-sm"
              style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}
            >
              <Upload className="w-4 h-4 inline mr-1.5" />
              Seleccionar archivo
            </span>
            <p className="text-xs text-gray-400 mt-3">JPG, PNG, PDF · máx. 20 MB</p>
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden border-2 border-green-200">
            {imgPreview ? (
              <img src={imgPreview} alt="Preview" className="w-full max-h-64 object-contain bg-white" />
            ) : (
              <div className="p-6 bg-gray-50 flex items-center gap-4">
                <FileText className="w-10 h-10 text-orange-400 flex-shrink-0" />
                <div>
                  <p className="font-bold text-gray-700">{file.name}</p>
                  <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
            )}
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          capture="environment"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {/* Submit */}
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
            ¡Tarea entregada! 🎉
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
              <>📤 Entregar tarea</>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
