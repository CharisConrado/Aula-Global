"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import {
  MonitoringWebSocket,
  type MonitoringData,
  type MonitoringResponse,
} from "@/lib/websocket";

// ── Metadatos de emoción ───────────────────────────────────────────────────────
const EMOTION_META: Record<string, { emoji: string; color: string; label: string; bg: string }> = {
  neutro:    { emoji: "😐", color: "#94A3B8", label: "Tranquilo",  bg: "rgba(148,163,184,0.18)" },
  feliz:     { emoji: "😄", color: "#FBBF24", label: "¡Feliz!",    bg: "rgba(251,191,36,0.18)"  },
  frustrado: { emoji: "😤", color: "#F87171", label: "Frustrado",  bg: "rgba(248,113,113,0.18)" },
  ansioso:   { emoji: "😰", color: "#FB923C", label: "Ansioso",    bg: "rgba(251,146,60,0.18)"  },
  distraido: { emoji: "😶", color: "#A78BFA", label: "Distraído",  bg: "rgba(167,139,250,0.18)" },
  estresado: { emoji: "😟", color: "#F87171", label: "Estresado",  bg: "rgba(248,113,113,0.18)" },
  calmado:   { emoji: "😌", color: "#34D399", label: "Calmado",    bg: "rgba(52,211,153,0.18)"  },
};

/* Índices clave del rostro (MediaPipe FaceMesh — 468 puntos) */
const FACE_OVAL  = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const LEFT_EYE   = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33];
const RIGHT_EYE  = [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466,263];
const LIPS_OUTER = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
const LEFT_BROW  = [70,63,105,66,107,55,65,52,53,46];
const RIGHT_BROW = [336,296,334,293,300,285,295,282,283,276];

interface Props {
  active?: boolean;
}

export default function EmotionDetector({ active = false }: Props) {
  const videoRef              = useRef<HTMLVideoElement>(null);
  const canvasRef             = useRef<HTMLCanvasElement>(null);   // oculto — solo para capturar frames
  const wsRef                 = useRef<MonitoringWebSocket | null>(null);
  const monitoringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceMeshRef           = useRef<unknown>(null);
  const lastLandmarksRef      = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const streamRef             = useRef<MediaStream | null>(null);
  const mountedRef            = useRef(false);
  const clickTimestampsRef    = useRef<number[]>([]);

  const [permission,     setPermission]     = useState<"idle" | "pending" | "granted" | "denied">("idle");
  const [currentEmotion, setCurrentEmotion] = useState("neutro");
  const [wsConnected,    setWsConnected]    = useState(false);
  const [attentionPct,   setAttentionPct]   = useState(50);
  const [minimized,      setMinimized]      = useState(false);

  const {
    token, user, active_student_id, activeSession,
    setEmotionState, addCrisisAlert, setPendingActions, setShowCalmingScreen,
  } = useSessionStore();

  const meta = EMOTION_META[currentEmotion] || EMOTION_META.neutro;

  /* ── Abrir modal al activar ── */
  useEffect(() => {
    if (active && permission === "idle") setPermission("pending");
  }, [active, permission]);

  /* ── Rastrear velocidad de clics ── */
  useEffect(() => {
    const h = () => {
      const now = Date.now();
      clickTimestampsRef.current = clickTimestampsRef.current
        .filter(t => now - t < 10_000).concat(now);
    };
    document.addEventListener("click",      h);
    document.addEventListener("touchstart", h);
    return () => {
      document.removeEventListener("click",      h);
      document.removeEventListener("touchstart", h);
    };
  }, []);

  const getClickSpeed = useCallback(() =>
    clickTimestampsRef.current.filter(t => Date.now() - t < 10_000).length / 10, []);

  /* ── Análisis de landmarks ── */
  const analyzeLandmarks = useCallback((landmarks: { x: number; y: number; z: number }[]) => {
    if (!landmarks || landmarks.length < 468)
      return { emotion: "neutro", attention_level: 0.5, stimming: false };

    const mouthOpen    = Math.abs(landmarks[13].y - landmarks[14].y);
    const browDist     = (Math.abs(landmarks[70].y - landmarks[159].y) + Math.abs(landmarks[300].y - landmarks[386].y)) / 2;
    const eyeOpenAvg   = (Math.abs(landmarks[159].y - landmarks[145].y) + Math.abs(landmarks[386].y - landmarks[374].y)) / 2;
    const mouthWidth   = Math.abs(landmarks[291].x - landmarks[61].x);
    const gazeDeviation = Math.abs(landmarks[1].x - landmarks[168].x);
    const headMovement = Math.abs(landmarks[1].z);

    let emotion = "neutro";
    if      (mouthWidth > 0.15 && mouthOpen < 0.03)  emotion = "feliz";
    else if (browDist < 0.02   && mouthOpen < 0.02)  emotion = "frustrado";
    else if (eyeOpenAvg > 0.025 && mouthOpen > 0.02) emotion = "ansioso";
    else if (browDist < 0.025  && headMovement > 0.1) emotion = "estresado";
    else if (eyeOpenAvg < 0.015)
      emotion = gazeDeviation > 0.05 ? "distraido" : "calmado";

    return {
      emotion,
      attention_level: Math.round(
        Math.max(0, Math.min(1, 1 - gazeDeviation * 10)) *
        (eyeOpenAvg < 0.012 ? 0.5 : 1) * 100
      ) / 100,
      stimming: headMovement > 0.15,
    };
  }, []);

  /* ── Dibuja la malla facial sobre el canvas ── */
  const drawFaceMesh = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: { x: number; y: number }[],
    w: number, h: number,
  ) => {
    const drawPath = (idxs: number[], stroke: string, lw = 1.5) => {
      ctx.beginPath(); ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      idxs.forEach((idx, i) => {
        const p = landmarks[idx]; if (!p) return;
        const x = p.x * w, y = p.y * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    ctx.fillStyle = "rgba(0,255,136,0.55)";
    for (const p of landmarks) {
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    drawPath(FACE_OVAL,  "rgba(0,255,200,0.85)", 1.5);
    drawPath(LEFT_EYE,   "rgba(0,220,255,0.95)", 1.5);
    drawPath(RIGHT_EYE,  "rgba(0,220,255,0.95)", 1.5);
    drawPath(LIPS_OUTER, "rgba(255,100,200,0.9)", 1.5);
    drawPath(LEFT_BROW,  "rgba(255,230,100,0.85)", 1.4);
    drawPath(RIGHT_BROW, "rgba(255,230,100,0.85)", 1.4);
    const nose = landmarks[1];
    if (nose) {
      ctx.fillStyle = "rgba(255,80,80,0.95)";
      ctx.beginPath(); ctx.arc(nose.x * w, nose.y * h, 3, 0, Math.PI * 2); ctx.fill();
    }
  }, []);

  /* ── Captura frame con malla para el tutor ── */
  const captureFrameWithMesh = useCallback((): string | undefined => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const W = canvas.width, H = canvas.height;
    ctx.drawImage(video, 0, 0, W, H);
    const lm = lastLandmarksRef.current;
    if (lm && lm.length >= 468) {
      drawFaceMesh(ctx, lm, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(6, H - 22, 100, 16);
      ctx.fillStyle = "#A2F0CB";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(currentEmotion.toUpperCase(), 10, H - 10);
    }
    return canvas.toDataURL("image/jpeg", 0.55).split(",")[1];
  }, [drawFaceMesh, currentEmotion]);

  /* ── Respuesta del backend ── */
  const handleMonitoringResponse = useCallback((response: MonitoringResponse) => {
    setEmotionState({ emocion: response.emocion_actual, nivel_atencion: response.nivel_atencion });
    const actionNames = response.acciones.map(a => a.accion);
    if (actionNames.length > 0) setPendingActions(actionNames);
    if (actionNames.includes("pausa_visual")) setShowCalmingScreen(true);
    if (response.alerta_crisis) {
      addCrisisAlert({
        id: `crisis-${Date.now()}`,
        student_id: active_student_id || "",
        nivel: response.alerta_crisis,
        mensaje: response.alerta_crisis === "grave"
          ? "Se ha contactado a un profesional"
          : response.alerta_crisis === "moderada"
          ? "Se ha notificado a tu tutor"
          : "El contenido se ha adaptado para ti",
        timestamp: Date.now(),
      });
    }
  }, [active_student_id, setEmotionState, setPendingActions, setShowCalmingScreen, addCrisisAlert]);

  /* ── Detener todo ── */
  const stopAll = useCallback(() => {
    mountedRef.current = false;
    wsRef.current?.disconnect(); wsRef.current = null;
    if (monitoringIntervalRef.current) { clearInterval(monitoringIntervalRef.current); monitoringIntervalRef.current = null; }
    if (frameIntervalRef.current)      { clearInterval(frameIntervalRef.current);      frameIntervalRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    faceMeshRef.current = null;
    lastLandmarksRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => stopAll();
  }, [stopAll]);

  /* ── Iniciar cámara + WS ── */
  const startMonitoring = useCallback(async () => {
    if (!token || !user || !active_student_id) return;

    wsRef.current = new MonitoringWebSocket(
      active_student_id, token, handleMonitoringResponse,
      (connected) => { if (mountedRef.current) setWsConnected(connected); }
    );
    wsRef.current.connect();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
      });
      if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPermission("granted");

      // @ts-expect-error — MediaPipe global
      if (typeof window !== "undefined" && window.FaceMesh) {
        // @ts-expect-error — tipo externo
        const faceMesh = new window.FaceMesh({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });
        faceMesh.setOptions({
          maxNumFaces: 1, refineLandmarks: true,
          minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        faceMesh.onResults((results: { multiFaceLandmarks?: { x: number; y: number; z: number }[][] }) => {
          if (results.multiFaceLandmarks?.[0])
            lastLandmarksRef.current = results.multiFaceLandmarks[0];
        });
        faceMeshRef.current = faceMesh;
        const processFrame = async () => {
          if (!mountedRef.current) return;
          if (videoRef.current && faceMeshRef.current)
            // @ts-expect-error — tipo externo
            await faceMeshRef.current.send({ image: videoRef.current });
          if (mountedRef.current) requestAnimationFrame(processFrame);
        };
        processFrame();
      }
    } catch {
      setPermission("denied");
      return;
    }

    /* Frames con malla facial → tutor (4 fps) */
    frameIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || !wsRef.current) return;
      const frame = captureFrameWithMesh();
      if (frame) wsRef.current.sendFrame(frame);
    }, 250);

    /* Análisis de emoción → backend (cada 2 s) */
    monitoringIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || !wsRef.current || !activeSession) return;
      const lm       = lastLandmarksRef.current;
      const analysis = lm ? analyzeLandmarks(lm) : { emotion: "neutro", attention_level: 0.5, stimming: false };
      const tactile  = getClickSpeed() > 2;
      setCurrentEmotion(analysis.emotion);
      setAttentionPct(Math.round(analysis.attention_level * 100));
      setEmotionState({
        emocion: analysis.emotion, nivel_atencion: analysis.attention_level,
        stimming: analysis.stimming, tactile_pressure: tactile,
      });
      wsRef.current.send({
        id_session: activeSession.id_session,
        emotion: analysis.emotion, attention_level: analysis.attention_level,
        stimming: analysis.stimming, tactile_pressure: tactile,
      } as MonitoringData);
    }, 2000);
  }, [token, user, active_student_id, activeSession, analyzeLandmarks,
      captureFrameWithMesh, getClickSpeed, handleMonitoringResponse, setEmotionState]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Modal de permiso ── */}
      <AnimatePresence>
        {permission === "pending" && token && active_student_id && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          >
            <motion.div
              initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 30 }}
              className="rounded-[2rem] p-8 max-w-sm w-full mx-4 text-center"
              style={{ background: "white", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
            >
              <motion.div
                animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity }}
                className="text-7xl mb-4"
              >📹</motion.div>
              <h2 className="text-xl font-extrabold mb-2" style={{ color: "#34495E" }}>
                ¿Puedo ver tu carita? 😊
              </h2>
              <p className="text-sm mb-6" style={{ color: "#7f8c8d" }}>
                Usaré la cámara para saber cómo te sientes mientras aprendes.
                Tu tutor podrá ayudarte mejor. ¡Tu video <strong>nunca</strong> se guarda!
              </p>
              <div className="flex flex-col gap-3">
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={startMonitoring}
                  className="w-full py-3.5 rounded-2xl font-extrabold text-white text-base"
                  style={{ background: "linear-gradient(135deg,#A2D9A1,#7dc97c)", boxShadow: "0 4px 16px rgba(162,217,161,0.4)" }}
                >
                  ✅ Sí, acepto
                </motion.button>
                <button
                  onClick={() => setPermission("denied")}
                  className="w-full py-3 rounded-2xl font-semibold text-sm"
                  style={{ color: "#a0aec0", background: "#f3f4f6" }}
                >
                  No por ahora
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Widget de cámara + emoción (esquina inferior derecha) ── */}
      <AnimatePresence>
        {permission === "granted" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="fixed bottom-4 right-4 z-40 select-none"
            style={{ width: minimized ? "auto" : 168 }}
          >
            {minimized ? (
              /* ── Versión minimizada: solo emoji ── */
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMinimized(false)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl font-bold text-sm"
                style={{
                  background: "white",
                  border: `2px solid ${meta.color}66`,
                  boxShadow: `0 4px 16px ${meta.color}33`,
                  color: meta.color,
                }}
              >
                <motion.span
                  key={currentEmotion}
                  initial={{ scale: 0.5 }} animate={{ scale: 1 }}
                  className="text-xl"
                >{meta.emoji}</motion.span>
                <span className="text-xs font-extrabold">{meta.label}</span>
              </motion.button>
            ) : (
              /* ── Widget completo ── */
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  border: `2px solid ${meta.color}55`,
                  boxShadow: `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${meta.color}22`,
                  background: "#0F172A",
                }}
              >
                {/* Cámara en vivo */}
                <div className="relative" style={{ aspectRatio: "4/3" }}>
                  <video
                    ref={videoRef}
                    width={320} height={240}
                    playsInline muted
                    className="w-full h-full object-cover block"
                    style={{ transform: "scaleX(-1)" }}   // espejo natural
                  />

                  {/* Badge EN VIVO */}
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.85)" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[8px] font-extrabold text-white tracking-wider">EN VIVO</span>
                  </div>

                  {/* Botón minimizar */}
                  <button
                    onClick={() => setMinimized(true)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ background: "rgba(0,0,0,0.5)" }}
                  >✕</button>

                  {/* Gradiente inferior */}
                  <div className="absolute bottom-0 left-0 right-0 h-16"
                    style={{ background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, transparent 100%)" }}
                  />

                  {/* Emoción detectada */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
                    <motion.div
                      key={currentEmotion}
                      initial={{ scale: 0.5, rotate: -10 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 300 }}
                      className="text-2xl leading-none flex-shrink-0"
                    >{meta.emoji}</motion.div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold text-white/50 uppercase tracking-widest leading-none mb-0.5">
                        Cómo me siento
                      </p>
                      <motion.p
                        key={currentEmotion}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-extrabold leading-none"
                        style={{ color: meta.color }}
                      >{meta.label}</motion.p>
                    </div>
                  </div>
                </div>

                {/* Barra de atención */}
                <div className="px-2.5 py-2" style={{ background: "#111827" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: "#475569" }}>Atención</span>
                    <span className="text-[9px] font-extrabold"
                      style={{ color: attentionPct > 60 ? "#34D399" : attentionPct > 30 ? "#FBBF24" : "#F87171" }}>
                      {attentionPct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1E293B" }}>
                    <motion.div
                      className="h-full rounded-full"
                      animate={{ width: `${attentionPct}%` }}
                      transition={{ type: "spring", stiffness: 80, damping: 20 }}
                      style={{
                        background: attentionPct > 60 ? "#34D399" : attentionPct > 30 ? "#FBBF24" : "#F87171",
                      }}
                    />
                  </div>

                  {/* WS status */}
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: wsConnected ? "#22C55E" : "#475569" }} />
                    <span className="text-[8px] font-semibold"
                      style={{ color: wsConnected ? "#22C55E" : "#475569" }}>
                      {wsConnected ? "Conectado al tutor" : "Reconectando…"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Canvas oculto — solo para capturar frames con malla y enviarlos al tutor */}
      <canvas
        ref={canvasRef}
        width={320} height={240}
        style={{ display: "none" }}
        aria-hidden="true"
      />
    </>
  );
}
