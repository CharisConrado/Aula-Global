"use client";

/**
 * TutorStudentLivePanel — Aula Global
 *
 * Panel de monitoreo en vivo para el perfil de un estudiante en la vista del tutor.
 * Se conecta de forma autónoma al WebSocket del tutor para ese estudiante y
 * muestra:
 *  - Video en vivo con malla facial (recibido desde EmotionDetector del estudiante)
 *  - Emoción detectada en tiempo real
 *  - Barra de nivel de atención + sparkline
 *  - Alertas de stimming / crisis
 *  - Estado de conexión
 *
 * Uso:
 *   <TutorStudentLivePanel studentId={studentId} token={token} />
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  TutorMonitoringWebSocket,
  type TutorMonitoringUpdate,
} from "@/lib/websocket";
import TutorMonitoringPanel, { type EmotionEntry } from "./TutorMonitoringPanel";

interface Props {
  studentId: string;
  token: string;
}

export default function TutorStudentLivePanel({ studentId, token }: Props) {
  const wsRef      = useRef<TutorMonitoringWebSocket | null>(null);
  const mountedRef = useRef(true);

  const [wsOnline,   setWsOnline]   = useState(false);
  const [videoFrame, setVideoFrame] = useState<string | null>(null);
  const [emotion,    setEmotion]    = useState("neutro");
  const [attention,  setAttention]  = useState(0.5);
  const [stimming,   setStimming]   = useState(false);
  const [crisis,     setCrisis]     = useState<string | null>(null);
  const [history,    setHistory]    = useState<EmotionEntry[]>([]);

  useEffect(() => {
    mountedRef.current = true;

    const ws = new TutorMonitoringWebSocket(
      studentId,
      token,
      (data: TutorMonitoringUpdate) => {
        if (!mountedRef.current) return;

        if (data.type === "frame_update") {
          // Frame de video con malla facial
          if (data.video_frame) setVideoFrame(data.video_frame);
          // Algunos backends incluyen emoción también en frame_update
          const emo = data.emocion_actual ?? data.emocion;
          if (emo) setEmotion(emo);
        } else {
          // monitoring_update — datos emocionales
          // El backend puede usar "emocion_actual" o "emocion".
          const emo  = data.emocion_actual ?? data.emocion ?? "neutro";
          const attn = data.nivel_atencion ?? 0.5;

          setEmotion(emo);
          setAttention(attn);
          setStimming(data.stimming ?? false);
          setCrisis(data.alerta_crisis ?? null);
          setHistory(prev => [
            ...prev.slice(-19),
            { emotion: emo, attention: attn, time: Date.now() },
          ]);
        }
      },
      (connected) => {
        if (mountedRef.current) setWsOnline(connected);
      },
    );

    ws.connect();
    wsRef.current = ws;

    return () => {
      mountedRef.current = false;
      ws.disconnect();
      wsRef.current = null;
    };
  }, [studentId, token]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6"
    >
      {/* ── Encabezado ── */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-colors"
          style={{
            background: wsOnline ? "#22C55E" : "#CBD5E1",
            boxShadow:  wsOnline ? "0 0 7px #22C55E" : "none",
          }}
        />
        <h3 className="font-bold text-gray-700 text-sm">Monitoreo en vivo</h3>
        <span
          className="ml-auto text-[11px] font-semibold"
          style={{ color: wsOnline ? "#16A34A" : "#94A3B8" }}
        >
          {wsOnline ? "Estudiante conectado" : "Esperando conexión del estudiante…"}
        </span>
      </div>

      {/* ── Panel de monitoreo (video + emoción + sparkline) ── */}
      <TutorMonitoringPanel
        emotion={emotion}
        attentionLevel={attention}
        stimming={stimming}
        alerta_crisis={crisis}
        history={history}
        videoFrame={videoFrame}
      />
    </motion.div>
  );
}
