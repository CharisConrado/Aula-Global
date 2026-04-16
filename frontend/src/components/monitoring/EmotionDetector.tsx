"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSessionStore } from "@/store/sessionStore";
import {
  MonitoringWebSocket,
  type MonitoringData,
  type MonitoringResponse,
} from "@/lib/websocket";

/**
 * EmotionDetector — Componente de detección de emociones con MediaPipe
 *
 * - Ejecuta FaceMesh de MediaPipe 100% en el navegador
 * - El video NUNCA sale del dispositivo — solo se envían landmarks procesados
 * - Analiza landmarks faciales para inferir emoción, atención y stimming
 * - Envía datos al backend via WebSocket cada 2 segundos
 * - Si la cámara falla, el sistema continúa funcionando sin monitoreo
 */
export default function EmotionDetector() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<MonitoringWebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceMeshRef = useRef<unknown>(null);
  const lastLandmarksRef = useRef<unknown>(null);
  const clickTimestampsRef = useRef<number[]>([]);

  const {
    token,
    user,
    activeSession,
    setEmotionState,
    addCrisisAlert,
    setPendingActions,
    setShowCalmingScreen,
  } = useSessionStore();

  // Rastrear clics para medir presión táctil
  useEffect(() => {
    const handleClick = () => {
      const now = Date.now();
      clickTimestampsRef.current.push(now);
      // Mantener solo los últimos 10 segundos
      clickTimestampsRef.current = clickTimestampsRef.current.filter(
        (t) => now - t < 10000
      );
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, []);

  // Calcular velocidad de clics (clics por segundo en ventana de 10s)
  const getClickSpeed = useCallback(() => {
    const now = Date.now();
    const recent = clickTimestampsRef.current.filter(
      (t) => now - t < 10000
    );
    return recent.length / 10;
  }, []);

  // Analizar landmarks para inferir emoción
  const analyzeLandmarks = useCallback(
    (landmarks: { x: number; y: number; z: number }[]) => {
      if (!landmarks || landmarks.length < 468) {
        return { emocion: "neutro", nivel_atencion: 0.5, stimming: false };
      }

      // --- Análisis de apertura de boca (sorpresa/frustración) ---
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const mouthOpen = Math.abs(upperLip.y - lowerLip.y);

      // --- Análisis de cejas (frustración/estrés) ---
      const leftBrow = landmarks[70];
      const rightBrow = landmarks[300];
      const leftEye = landmarks[159];
      const rightEye = landmarks[386];
      const browDistance =
        (Math.abs(leftBrow.y - leftEye.y) +
          Math.abs(rightBrow.y - rightEye.y)) /
        2;

      // --- Análisis de ojos (atención) ---
      const leftEyeUpper = landmarks[159];
      const leftEyeLower = landmarks[145];
      const rightEyeUpper = landmarks[386];
      const rightEyeLower = landmarks[374];
      const eyeOpenLeft = Math.abs(leftEyeUpper.y - leftEyeLower.y);
      const eyeOpenRight = Math.abs(rightEyeUpper.y - rightEyeLower.y);
      const avgEyeOpen = (eyeOpenLeft + eyeOpenRight) / 2;

      // --- Análisis de sonrisa ---
      const leftMouth = landmarks[61];
      const rightMouth = landmarks[291];
      const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);

      // --- Análisis de dirección de mirada (atención) ---
      const noseTip = landmarks[1];
      const faceCenter = landmarks[168];
      const gazeDeviation = Math.abs(noseTip.x - faceCenter.x);

      // --- Detección de movimiento repetitivo (stimming) ---
      const headMovement = Math.abs(noseTip.z);

      // --- Inferir emoción ---
      let emocion = "neutro";
      let nivel_atencion = 0.5;
      let stimming = false;

      // Sonrisa amplia = feliz
      if (mouthWidth > 0.15 && mouthOpen < 0.03) {
        emocion = "feliz";
      }
      // Cejas bajas + boca cerrada = frustrado
      else if (browDistance < 0.02 && mouthOpen < 0.02) {
        emocion = "frustrado";
      }
      // Ojos muy abiertos + boca ligeramente abierta = ansioso
      else if (avgEyeOpen > 0.025 && mouthOpen > 0.02) {
        emocion = "ansioso";
      }
      // Cejas tensas + movimiento = estresado
      else if (browDistance < 0.025 && headMovement > 0.1) {
        emocion = "estresado";
      }
      // Ojos medio cerrados = distraído/calmado
      else if (avgEyeOpen < 0.015) {
        emocion = gazeDeviation > 0.05 ? "distraido" : "calmado";
      }

      // Nivel de atención basado en dirección de mirada y apertura de ojos
      nivel_atencion = Math.max(0, Math.min(1, 1 - gazeDeviation * 10));
      if (avgEyeOpen < 0.012) nivel_atencion *= 0.5; // Ojos cerrados = baja atención

      // Detección de stimming: movimiento rápido y repetitivo de la cabeza
      stimming = headMovement > 0.15;

      return { emocion, nivel_atencion: Math.round(nivel_atencion * 100) / 100, stimming };
    },
    []
  );

  // Manejar respuesta del WebSocket
  const handleMonitoringResponse = useCallback(
    (response: MonitoringResponse) => {
      setEmotionState({
        emocion: response.emocion_actual,
        nivel_atencion: response.nivel_atencion,
      });

      // Procesar acciones de adaptación
      const actionNames = response.acciones.map((a) => a.accion);
      if (actionNames.length > 0) {
        setPendingActions(actionNames);
      }

      // Mostrar pantalla calmante si es necesario
      if (actionNames.includes("pausa_visual")) {
        setShowCalmingScreen(true);
      }

      // Alertas de crisis
      if (response.alerta_crisis) {
        addCrisisAlert({
          id: `crisis-${Date.now()}`,
          student_id: user?.user_id || 0,
          nivel: response.alerta_crisis,
          mensaje:
            response.alerta_crisis === "grave"
              ? "Se ha contactado a un profesional"
              : response.alerta_crisis === "moderada"
              ? "Se ha notificado a tu tutor"
              : "El contenido se ha adaptado para ti",
          timestamp: Date.now(),
        });
      }
    },
    [setEmotionState, setPendingActions, setShowCalmingScreen, addCrisisAlert, user]
  );

  // Inicializar MediaPipe y WebSocket
  useEffect(() => {
    if (!token || !user || !activeSession) return;

    let mounted = true;

    const init = async () => {
      // --- Iniciar WebSocket ---
      wsRef.current = new MonitoringWebSocket(
        user.user_id,
        token,
        handleMonitoringResponse,
        (connected) => {
          if (mounted) {
            console.log(
              connected
                ? "WebSocket de monitoreo conectado"
                : "WebSocket de monitoreo desconectado"
            );
          }
        }
      );
      wsRef.current.connect();

      // --- Iniciar cámara ---
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
        });

        if (videoRef.current && mounted) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // --- Iniciar MediaPipe FaceMesh ---
        // @ts-expect-error — MediaPipe se carga como script global
        if (typeof window !== "undefined" && window.FaceMesh) {
          // @ts-expect-error — Tipo externo
          const faceMesh = new window.FaceMesh({
            locateFile: (file: string) =>
              `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
          });

          faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

          faceMesh.onResults((results: { multiFaceLandmarks?: unknown[][] }) => {
            if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
              lastLandmarksRef.current = results.multiFaceLandmarks[0];
            }
          });

          faceMeshRef.current = faceMesh;

          // Procesar frames
          const processFrame = async () => {
            if (videoRef.current && faceMeshRef.current && mounted) {
              // @ts-expect-error — Tipo externo
              await faceMeshRef.current.send({ image: videoRef.current });
            }
            if (mounted) requestAnimationFrame(processFrame);
          };
          processFrame();
        }
      } catch (err) {
        console.warn(
          "No se pudo acceder a la cámara. El monitoreo continuará sin detección facial:",
          err
        );
      }

      // --- Enviar datos cada 2 segundos ---
      intervalRef.current = setInterval(() => {
        if (!wsRef.current || !activeSession || !mounted) return;

        const landmarks = lastLandmarksRef.current as
          | { x: number; y: number; z: number }[]
          | null;
        const analysis = landmarks
          ? analyzeLandmarks(landmarks)
          : { emocion: "neutro", nivel_atencion: 0.5, stimming: false };

        const clickSpeed = getClickSpeed();
        const presionTactil = Math.min(1, clickSpeed / 3); // Normalizar a 0-1

        const data: MonitoringData = {
          session_id: activeSession.id,
          student_id: activeSession.student_id,
          emocion: analysis.emocion,
          nivel_atencion: analysis.nivel_atencion,
          stimming: analysis.stimming,
          presion_tactil: presionTactil,
          velocidad_clics: clickSpeed,
        };

        wsRef.current.send(data);

        setEmotionState({
          emocion: analysis.emocion,
          nivel_atencion: analysis.nivel_atencion,
          stimming: analysis.stimming,
          presion_tactil: presionTactil,
        });
      }, 2000);
    };

    init();

    return () => {
      mounted = false;
      wsRef.current?.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);

      // Detener cámara
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, [
    token,
    user,
    activeSession,
    analyzeLandmarks,
    getClickSpeed,
    handleMonitoringResponse,
    setEmotionState,
  ]);

  // El componente es invisible — solo procesa datos
  return (
    <div className="fixed top-0 left-0 w-0 h-0 overflow-hidden" aria-hidden="true">
      <video
        ref={videoRef}
        width={320}
        height={240}
        playsInline
        muted
        style={{ position: "absolute", opacity: 0 }}
      />
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        style={{ position: "absolute", opacity: 0 }}
      />
    </div>
  );
}
