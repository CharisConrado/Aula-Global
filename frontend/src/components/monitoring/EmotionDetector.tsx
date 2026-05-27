"use client";

/**
 * EmotionDetector — Aula Global
 *
 * Muestra un widget visible (esquina inferior derecha) con:
 *  - Video en vivo del estudiante con efecto espejo
 *  - Malla facial de colores superpuesta en tiempo real
 *  - Emoji + etiqueta de emoción detectada (suavizada temporalmente)
 *  - Barra de nivel de atención
 *  - Estado de conexión WebSocket al tutor
 *  - Botón minimizar / restaurar
 *
 * Internamente:
 *  - MediaPipe FaceMesh (CDN global window.FaceMesh)
 *  - EAR / MAR / brow furrow / smile score, todos normalizados por IOD
 *  - Buffer temporal de 7 lecturas → moda (evita parpadeo de emociones)
 *  - Canvas oculto para enviar frames con malla al tutor (4 fps)
 *  - Canvas de overlay visible para la malla en el widget (~30 fps)
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import {
  MonitoringWebSocket,
  type MonitoringData,
  type MonitoringResponse,
} from "@/lib/websocket";

// ── Metadatos de emoción ─────────────────────────────────────────────────────
const EMOTION_META: Record<string, { emoji: string; color: string; label: string }> = {
  neutro:    { emoji: "😐", color: "#94A3B8", label: "Tranquilo"  },
  feliz:     { emoji: "😄", color: "#FBBF24", label: "¡Feliz!"    },
  frustrado: { emoji: "😤", color: "#F87171", label: "Frustrado"  },
  ansioso:   { emoji: "😰", color: "#FB923C", label: "Ansioso"    },
  distraido: { emoji: "😶", color: "#A78BFA", label: "Distraído"  },
  estresado: { emoji: "😟", color: "#F87171", label: "Estresado"  },
  calmado:   { emoji: "😌", color: "#34D399", label: "Calmado"    },
};

// ── Contornos de MediaPipe FaceMesh (468 puntos) ─────────────────────────────
const FACE_OVAL  = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10];
const LEFT_EYE   = [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33];
const RIGHT_EYE  = [263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466,263];
const LIPS_OUTER = [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61];
const LEFT_BROW  = [70,63,105,66,107,55,65,52,53,46];
const RIGHT_BROW = [336,296,334,293,300,285,295,282,283,276];

// ── Helper de distancia 2D ───────────────────────────────────────────────────
const dist2D = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

interface Props {
  active?: boolean;
}

export default function EmotionDetector({ active = false }: Props) {
  // ── Refs de medios ──────────────────────────────────────────────────────────
  const videoRef         = useRef<HTMLVideoElement>(null);
  const canvasRef        = useRef<HTMLCanvasElement>(null);     // oculto — frames al tutor
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);     // visible — malla sobre video
  const streamRef        = useRef<MediaStream | null>(null);

  // ── Refs de monitoreo ───────────────────────────────────────────────────────
  const wsRef                 = useRef<MonitoringWebSocket | null>(null);
  const faceMeshRef           = useRef<unknown>(null);
  const lastLandmarksRef      = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const overlayRafRef         = useRef<number>(0);               // rAF loop handle
  const monitoringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const emotionIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const emotionBufferRef      = useRef<string[]>([]);
  const currentEmotionRef     = useRef<string>("neutro"); // sin stale-closure en captureFrame
  const clickTimestampsRef    = useRef<number[]>([]);
  const mountedRef            = useRef(false);

  // ── Estado UI ───────────────────────────────────────────────────────────────
  const [permission,     setPermission]     = useState<"idle" | "pending" | "granted" | "denied">("idle");
  const [currentEmotion, setCurrentEmotion] = useState("neutro");
  const [wsConnected,    setWsConnected]    = useState(false);
  const [attentionPct,   setAttentionPct]   = useState(50);
  const [minimized,      setMinimized]      = useState(false);

  const {
    token, user, active_student_id, activeSession,
    setEmotionState, addCrisisAlert, setPendingActions, setShowCalmingScreen,
  } = useSessionStore();

  const meta = EMOTION_META[currentEmotion] ?? EMOTION_META.neutro;

  // ── Activar modal al iniciar actividad ──────────────────────────────────────
  useEffect(() => {
    if (active && permission === "idle") setPermission("pending");
  }, [active, permission]);

  // ── Rastrear velocidad de clics (indicador de estrés táctil) ───────────────
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

  // ── Análisis facial mejorado ─────────────────────────────────────────────────
  //
  // Todas las métricas se normalizan por la Distancia Inter-Ocular (IOD)
  // → invariantes a la distancia de la cámara y tamaño de cara en frame.
  //
  // Índices MediaPipe FaceMesh (468 puntos, coords normalizadas [0,1]):
  //   Ojo izq: outer=33, inner=133, top=159, bottom=145
  //   Ojo der: outer=263, inner=362, top=386, bottom=374
  //   Cejas: izq_inner=107 der_inner=336, izq_top=105 der_top=334
  //   Boca: izq=61, der=291, labio_sup=13, labio_inf=14
  //   Nariz: punta=1
  // ─────────────────────────────────────────────────────────────────────────────
  const analyzeLandmarks = useCallback((lm: { x: number; y: number; z: number }[]) => {
    if (lm.length < 468) return { emotion: "neutro", attention_level: 0.5, stimming: false };

    // Referencia de escala: distancia inter-ocular (outer corners)
    const IOD = Math.abs(lm[263].x - lm[33].x) || 0.08;

    // ── Eye Aspect Ratio (EAR) ────────────────────────────────────────────────
    // EAR = apertura vertical / ancho horizontal del ojo
    // Ojo normal abierto: ~0.20 – 0.35 | muy abierto: >0.38 | cerrado: <0.12
    const leftW  = dist2D(lm[33],  lm[133]);
    const rightW = dist2D(lm[263], lm[362]);
    const leftEAR  = leftW  > 0.001 ? Math.abs(lm[159].y - lm[145].y) / leftW  : 0;
    const rightEAR = rightW > 0.001 ? Math.abs(lm[386].y - lm[374].y) / rightW : 0;
    const ear = (leftEAR + rightEAR) / 2;

    // ── Mouth Aspect Ratio (MAR) ──────────────────────────────────────────────
    // MAR = apertura vertical / ancho horizontal de boca
    // Cerrada: ~0 | abierta: >0.25
    const mouthW = dist2D(lm[61], lm[291]);
    const mar = mouthW > 0.001 ? Math.abs(lm[13].y - lm[14].y) / mouthW : 0;

    // ── Smile score (comisuras vs. centro de boca) ────────────────────────────
    // Positivo: comisuras arriba (sonrisa) | Negativo: comisuras abajo (ceño)
    const mouthCenterY = (lm[13].y + lm[14].y) / 2;
    const avgCornerY   = (lm[61].y + lm[291].y) / 2;
    const smileScore   = (mouthCenterY - avgCornerY) / IOD;

    // ── Ceño fruncido (distancia horizontal entre cejas interiores) ───────────
    // Cejas juntas (frustración/concentración): < 0.80
    // Cejas separadas (relajado/sorprendido): > 1.20
    const browFurrow = dist2D(lm[107], lm[336]) / IOD;

    // ── Cejas levantadas (distancia ceja-ojo) ────────────────────────────────
    // Mayor = cejas más altas → sorpresa/ansiedad
    const lBrowRaise = (lm[159].y - lm[105].y) / IOD;
    const rBrowRaise = (lm[386].y - lm[334].y) / IOD;
    const browRaise  = (lBrowRaise + rBrowRaise) / 2;

    // ── Desviación de mirada ──────────────────────────────────────────────────
    // Cuánto se desvía la nariz del centro visual → indica si mira a cámara
    const midEyeX      = (lm[33].x + lm[263].x) / 2;
    const gazeDeviation = Math.abs(lm[1].x - midEyeX) / IOD;

    // ── Movimiento de cabeza (eje Z de nariz) ─────────────────────────────────
    // Inclinación/alejamiento brusco → stimming o agitación
    const headZ = Math.abs(lm[1].z);

    // ── Clasificación ─────────────────────────────────────────────────────────
    let emotion = "neutro";
    if      (smileScore > 0.06  && mar < 0.30)                     emotion = "feliz";
    else if (browFurrow < 0.80  && mar < 0.05 && browRaise < 0.18) emotion = "frustrado";
    else if (ear > 0.38         && browRaise > 0.22)               emotion = "ansioso";
    else if (browFurrow < 0.88  && headZ > 0.06)                   emotion = "estresado";
    else if (gazeDeviation > 0.18)                                  emotion = "distraido";
    else if (ear > 0.15 && ear < 0.30 && gazeDeviation < 0.10)     emotion = "calmado";

    // ── Nivel de atención (0-1) ───────────────────────────────────────────────
    const attnGaze = Math.max(0, 1 - gazeDeviation * 3.5);
    const attnEAR  = ear > 0.08 ? 1 : ear / 0.08;
    const attention_level = Math.max(0, Math.min(1, attnGaze * 0.7 + attnEAR * 0.3));

    return { emotion, attention_level, stimming: headZ > 0.12 };
  }, []);

  // ── Dibujar malla facial ──────────────────────────────────────────────────
  const drawFaceMesh = useCallback((
    ctx: CanvasRenderingContext2D,
    landmarks: { x: number; y: number }[],
    w: number,
    h: number,
  ) => {
    const drawPath = (idxs: number[], stroke: string, lw = 1.5) => {
      ctx.beginPath(); ctx.strokeStyle = stroke; ctx.lineWidth = lw;
      idxs.forEach((idx, i) => {
        const p = landmarks[idx]; if (!p) return;
        if (i === 0) ctx.moveTo(p.x * w, p.y * h); else ctx.lineTo(p.x * w, p.y * h);
      });
      ctx.stroke();
    };
    // Puntos de landmark
    ctx.fillStyle = "rgba(0,255,136,0.55)";
    for (const p of landmarks) {
      ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    // Contornos clave
    drawPath(FACE_OVAL,  "rgba(0,255,200,0.85)", 1.5);
    drawPath(LEFT_EYE,   "rgba(0,220,255,0.95)", 1.5);
    drawPath(RIGHT_EYE,  "rgba(0,220,255,0.95)", 1.5);
    drawPath(LIPS_OUTER, "rgba(255,100,200,0.9)", 1.5);
    drawPath(LEFT_BROW,  "rgba(255,230,100,0.85)", 1.4);
    drawPath(RIGHT_BROW, "rgba(255,230,100,0.85)", 1.4);
    // Punto nariz (rojo)
    const nose = landmarks[1];
    if (nose) {
      ctx.fillStyle = "rgba(255,80,80,0.95)";
      ctx.beginPath(); ctx.arc(nose.x * w, nose.y * h, 3, 0, Math.PI * 2); ctx.fill();
    }
  }, []);

  // ── Captura frame con malla → enviar al tutor ─────────────────────────────
  // Usa currentEmotionRef para no tener stale closure en la dependencia.
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
      // Etiqueta de emoción sobre el frame enviado al tutor
      ctx.fillStyle = "rgba(0,0,0,0.60)";
      ctx.fillRect(6, H - 22, 116, 16);
      ctx.fillStyle = "#A2F0CB";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(currentEmotionRef.current.toUpperCase(), 10, H - 10);
    }
    return canvas.toDataURL("image/jpeg", 0.55).split(",")[1];
  }, [drawFaceMesh]); // currentEmotionRef es un ref, no dependencia

  // ── Respuesta del backend ──────────────────────────────────────────────────
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
        mensaje:
          response.alerta_crisis === "grave"   ? "Se ha contactado a un profesional" :
          response.alerta_crisis === "moderada" ? "Se ha notificado a tu tutor" :
                                                  "El contenido se ha adaptado para ti",
        timestamp: Date.now(),
      });
    }
  }, [active_student_id, setEmotionState, setPendingActions, setShowCalmingScreen, addCrisisAlert]);

  // ── Detener todo ───────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    mountedRef.current = false;
    if (overlayRafRef.current) cancelAnimationFrame(overlayRafRef.current);
    wsRef.current?.disconnect(); wsRef.current = null;
    if (monitoringIntervalRef.current) { clearInterval(monitoringIntervalRef.current); monitoringIntervalRef.current = null; }
    if (frameIntervalRef.current)      { clearInterval(frameIntervalRef.current);      frameIntervalRef.current = null; }
    if (emotionIntervalRef.current)    { clearInterval(emotionIntervalRef.current);    emotionIntervalRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    faceMeshRef.current = null;
    lastLandmarksRef.current = null;
    emotionBufferRef.current = [];
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => stopAll();
  }, [stopAll]);

  // ── Cargar MediaPipe FaceMesh desde CDN inyectando <script> dinámicamente ──
  // Se llama ANTES de inicializar el face mesh. Resuelve cuando el script cargó
  // (o si ya estaba cargado). Nunca rechaza — si falla, funciona sin malla.
  const loadFaceMeshScript = useCallback((): Promise<void> =>
    new Promise((resolve) => {
      // @ts-expect-error — global CDN
      if (typeof window !== "undefined" && window.FaceMesh) { resolve(); return; }
      // Evitar doble inyección si ya existe el script
      if (document.querySelector('script[data-mediapipe="face_mesh"]')) {
        // Esperar a que termine de cargar si ya fue inyectado
        const wait = () => {
          // @ts-expect-error
          if (window.FaceMesh) resolve();
          else setTimeout(wait, 100);
        };
        wait(); return;
      }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
      s.setAttribute("data-mediapipe", "face_mesh");
      s.crossOrigin = "anonymous";
      s.onload  = () => resolve();
      s.onerror = () => resolve(); // degradación elegante si CDN falla
      document.head.appendChild(s);
    }), []);

  // ── Iniciar cámara + WebSocket + MediaPipe ─────────────────────────────────
  const startMonitoring = useCallback(async () => {
    if (!token || !user || !active_student_id) return;

    // WebSocket del estudiante → backend
    wsRef.current = new MonitoringWebSocket(
      active_student_id, token, handleMonitoringResponse,
      (connected) => { if (mountedRef.current) setWsConnected(connected); }
    );
    wsRef.current.connect();

    // ── Solicitar cámara ───────────────────────────────────────────────────
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
      });
    } catch {
      setPermission("denied");
      return;
    }
    if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => null);
    }
    setPermission("granted"); // ← widget aparece con video inmediatamente

    // ── rAF draw loop: canvas como pantalla principal ──────────────────────
    // En móvil, <video> dentro de position:fixed puede quedar negro aunque la
    // cámara esté activa. Solución: ocultar el video y renderizar cada frame
    // del stream en el canvas via requestAnimationFrame.
    // El canvas sí pinta correctamente en Android/iOS.
    const drawLoop = () => {
      if (!mountedRef.current) return;
      const vid     = videoRef.current;
      const oCanvas = overlayCanvasRef.current;
      if (vid && oCanvas && vid.readyState >= 2) {
        const ctx = oCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, oCanvas.width, oCanvas.height);
          ctx.drawImage(vid, 0, 0, oCanvas.width, oCanvas.height);
          const lm = lastLandmarksRef.current;
          if (lm && lm.length >= 468) drawFaceMesh(ctx, lm, oCanvas.width, oCanvas.height);
        }
      }
      overlayRafRef.current = requestAnimationFrame(drawLoop);
    };
    overlayRafRef.current = requestAnimationFrame(drawLoop);

    // ── Intervalos (funcionan incluso sin malla facial) ────────────────────

    // Actualizar emoción mostrada (500 ms) con suavizado temporal
    emotionIntervalRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      const lm = lastLandmarksRef.current;
      if (!lm) return;
      const raw = analyzeLandmarks(lm);
      emotionBufferRef.current = [...emotionBufferRef.current.slice(-6), raw.emotion];
      const counts: Record<string, number> = {};
      emotionBufferRef.current.forEach(e => { counts[e] = (counts[e] || 0) + 1; });
      const smoothed = Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0];
      currentEmotionRef.current = smoothed;
      setCurrentEmotion(smoothed);
      setAttentionPct(Math.round(raw.attention_level * 100));
    }, 500);

    // Frames con malla → tutor (4 fps)
    frameIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || !wsRef.current) return;
      const frame = captureFrameWithMesh();
      if (frame) wsRef.current.sendFrame(frame);
    }, 250);

    // Datos de monitoreo → backend (cada 2 s)
    monitoringIntervalRef.current = setInterval(() => {
      if (!mountedRef.current || !wsRef.current || !activeSession) return;
      const lm      = lastLandmarksRef.current;
      const analysis = lm
        ? analyzeLandmarks(lm)
        : { emotion: "neutro", attention_level: 0.5, stimming: false };
      const tactile = getClickSpeed() > 2;
      setEmotionState({
        emocion: currentEmotionRef.current, nivel_atencion: analysis.attention_level,
        stimming: analysis.stimming, tactile_pressure: tactile,
      });
      wsRef.current.send({
        id_session: activeSession.id_session, emotion: currentEmotionRef.current,
        attention_level: analysis.attention_level, stimming: analysis.stimming,
        tactile_pressure: tactile,
      } as MonitoringData);
    }, 2000);

    // ── Cargar MediaPipe FaceMesh (async, el video ya está corriendo) ──────
    // Inyecta el <script> dinámicamente y espera que cargue.
    // La malla facial aparece una vez que termina de descargar (~2-4 s).
    await loadFaceMeshScript();
    if (!mountedRef.current) return;

    // @ts-expect-error — global desde CDN
    if (typeof window === "undefined" || !window.FaceMesh) return; // CDN falló, continuar sin malla

    // @ts-expect-error — tipo externo
    const faceMesh = new window.FaceMesh({
      locateFile: (file: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    faceMesh.setOptions({
      maxNumFaces: 1, refineLandmarks: true,
      minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
    });

    // onResults: solo actualiza lastLandmarksRef.
    // El rAF drawLoop (iniciado arriba) ya dibuja video + malla en cada frame.
    faceMesh.onResults((results: {
      multiFaceLandmarks?: { x: number; y: number; z: number }[][];
    }) => {
      if (!mountedRef.current) return;
      lastLandmarksRef.current = results.multiFaceLandmarks?.[0] ?? null;
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
  }, [
    token, user, active_student_id, activeSession,
    loadFaceMeshScript, analyzeLandmarks, captureFrameWithMesh, drawFaceMesh,
    getClickSpeed, handleMonitoringResponse, setEmotionState,
  ]);

  // ─────────────────────────────────────────────────────────────────────────────
  // JSX
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Modal de permiso de cámara ─────────────────────────────────────── */}
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
                  style={{
                    background: "linear-gradient(135deg,#A2D9A1,#7dc97c)",
                    boxShadow: "0 4px 16px rgba(162,217,161,0.4)",
                  }}
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

      {/* ── Widget de cámara + emoción (esquina inferior derecha) ─────────── */}
      <AnimatePresence>
        {permission === "granted" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8, x: 20 }}
            transition={{ type: "spring", stiffness: 200, damping: 22 }}
            className="fixed bottom-4 right-4 z-40 select-none"
            style={{ width: minimized ? "auto" : 172 }}
          >
            {minimized ? (
              /* ── Estado minimizado: píldora emoji + etiqueta ── */
              <motion.button
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }}
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
                  boxShadow: `0 8px 28px rgba(0,0,0,0.38), 0 0 0 1px ${meta.color}22`,
                  background: "#0F172A",
                }}
              >
                {/* Video en vivo + overlay de malla facial */}
                {/* paddingTop 75% = aspecto 4:3 confiable en todos los browsers/móvil */}
                <div className="relative" style={{ paddingTop: "75%" }}>

                  {/* Video: opacidad 0 pero tamaño real → el browser sigue decodificando
                      cada frame (necesario para drawImage y readyState >= 2).
                      Con width/height de 1 px el browser móvil detiene la decodificación. */}
                  <video
                    ref={videoRef}
                    width={320} height={240}
                    playsInline muted autoPlay
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ opacity: 0, pointerEvents: "none" }}
                  />

                  {/* Canvas principal — recibe video + malla facial via rAF.
                      scaleX(-1) = efecto espejo, igual que el video original. */}
                  <canvas
                    ref={overlayCanvasRef}
                    width={320} height={240}
                    className="absolute inset-0 w-full h-full"
                    style={{ transform: "scaleX(-1)", pointerEvents: "none" }}
                    aria-hidden="true"
                  />

                  {/* Badge EN VIVO */}
                  <div
                    className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(239,68,68,0.85)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[8px] font-extrabold text-white tracking-wider">EN VIVO</span>
                  </div>

                  {/* Botón minimizar */}
                  <button
                    onClick={() => setMinimized(true)}
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ background: "rgba(0,0,0,0.55)" }}
                    aria-label="Minimizar"
                  >✕</button>

                  {/* Gradiente inferior (para legibilidad del texto) */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
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

                {/* Barra de atención + estado WS */}
                <div className="px-2.5 py-2" style={{ background: "#111827" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
                      Atención
                    </span>
                    <span
                      className="text-[9px] font-extrabold"
                      style={{ color: attentionPct > 60 ? "#34D399" : attentionPct > 30 ? "#FBBF24" : "#F87171" }}
                    >{attentionPct}%</span>
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
                  <div className="flex items-center gap-1 mt-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: wsConnected ? "#22C55E" : "#475569" }}
                    />
                    <span className="text-[8px] font-semibold" style={{ color: wsConnected ? "#22C55E" : "#475569" }}>
                      {wsConnected ? "Conectado al tutor" : "Reconectando…"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Canvas oculto — solo para captura de frames con malla y envío al tutor */}
      <canvas ref={canvasRef} width={320} height={240} style={{ display: "none" }} aria-hidden="true" />
    </>
  );
}
