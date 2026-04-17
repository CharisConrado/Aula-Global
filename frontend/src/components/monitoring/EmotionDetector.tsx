"use client";

import { useEffect, useRef, useCallback } from "react";
import { useSessionStore } from "@/store/sessionStore";
import {
  MonitoringWebSocket,
  type MonitoringData,
  type MonitoringResponse,
} from "@/lib/websocket";

/**
 * EmotionDetector — Detección de emociones con MediaPipe FaceMesh
 *
 * - Ejecuta FaceMesh 100% en el navegador — el video NUNCA sale del dispositivo
 * - Solo se envían landmarks procesados al backend via WebSocket
 * - Analiza landmarks faciales para inferir emoción, atención y stimming
 * - Envía datos cada 2 segundos
 * - Si la cámara no está disponible, el sistema continúa sin monitoreo facial
 *
 * El WebSocket se abre con el `active_student_id` del store (UUID del estudiante),
 * usando el token del tutor autenticado.
 */
export default function EmotionDetector() {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wsRef      = useRef<MonitoringWebSocket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const faceMeshRef = useRef<unknown>(null);
  const lastLandmarksRef = useRef<unknown>(null);
  const clickTimestampsRef = useRef<number[]>([]);

  const {
    token,
    user,
    active_student_id,
    activeSession,
    setEmotionState,
    addCrisisAlert,
    setPendingActions,
    setShowCalmingScreen,
  } = useSessionStore();

  // Rastrear clics/toques para detectar presión táctil alta
  useEffect(() => {
    const handleInput = () => {
      const now = Date.now();
      clickTimestampsRef.current.push(now);
      // Mantener solo los últimos 10 segundos
      clickTimestampsRef.current = clickTimestampsRef.current.filter(
        (t) => now - t < 10_000
      );
    };
    document.addEventListener("click", handleInput);
    document.addEventListener("touchstart", handleInput);
    return () => {
      document.removeEventListener("click", handleInput);
      document.removeEventListener("touchstart", handleInput);
    };
  }, []);

  const getClickSpeed = useCallback(() => {
    const now = Date.now();
    const recent = clickTimestampsRef.current.filter((t) => now - t < 10_000);
    return recent.length / 10; // clics por segundo
  }, []);

  // Analizar landmarks de FaceMesh para inferir emoción, atención, stimming
  const analyzeLandmarks = useCallback(
    (landmarks: { x: number; y: number; z: number }[]) => {
      if (!landmarks || landmarks.length < 468) {
        return { emotion: "neutro", attention_level: 0.5, stimming: false };
      }

      const upperLip   = landmarks[13];
      const lowerLip   = landmarks[14];
      const mouthOpen  = Math.abs(upperLip.y - lowerLip.y);

      const leftBrow   = landmarks[70];
      const rightBrow  = landmarks[300];
      const leftEye    = landmarks[159];
      const rightEye   = landmarks[386];
      const browDist   =
        (Math.abs(leftBrow.y - leftEye.y) +
          Math.abs(rightBrow.y - rightEye.y)) /
        2;

      const leftEyeUpper  = landmarks[159];
      const leftEyeLower  = landmarks[145];
      const rightEyeUpper = landmarks[386];
      const rightEyeLower = landmarks[374];
      const eyeOpenLeft   = Math.abs(leftEyeUpper.y - leftEyeLower.y);
      const eyeOpenRight  = Math.abs(rightEyeUpper.y - rightEyeLower.y);
      const avgEyeOpen    = (eyeOpenLeft + eyeOpenRight) / 2;

      const leftMouth  = landmarks[61];
      const rightMouth = landmarks[291];
      const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);

      const noseTip      = landmarks[1];
      const faceCenter   = landmarks[168];
      const gazeDeviation = Math.abs(noseTip.x - faceCenter.x);
      const headMovement  = Math.abs(noseTip.z);

      let emotion = "neutro";
      if (mouthWidth > 0.15 && mouthOpen < 0.03) {
        emotion = "feliz";
      } else if (browDist < 0.02 && mouthOpen < 0.02) {
        emotion = "frustrado";
      } else if (avgEyeOpen > 0.025 && mouthOpen > 0.02) {
        emotion = "ansioso";
      } else if (browDist < 0.025 && headMovement > 0.1) {
        emotion = "estresado";
      } else if (avgEyeOpen < 0.015) {
        emotion = gazeDeviation > 0.05 ? "distraido" : "calmado";
      }

      let attention_level = Math.max(0, Math.min(1, 1 - gazeDeviation * 10));
      if (avgEyeOpen < 0.012) attention_level *= 0.5;

      const stimming = headMovement > 0.15;

      return {
        emotion,
        attention_level: Math.round(attention_level * 100) / 100,
        stimming,
      };
    },
    []
  );

  // Procesar respuesta del backend (acciones de adaptación)
  const handleMonitoringResponse = useCallback(
    (response: MonitoringResponse) => {
      setEmotionState({
        emocion:          response.emocion_actual,
        nivel_atencion:   response.nivel_atencion,
      });

      const actionNames = response.acciones.map((a) => a.accion);
      if (actionNames.length > 0) setPendingActions(actionNames);

      if (actionNames.includes("pausa_visual")) setShowCalmingScreen(true);

      if (response.alerta_crisis) {
        addCrisisAlert({
          id:         `crisis-${Date.now()}`,
          student_id: active_student_id || "",
          nivel:      response.alerta_crisis,
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
    [
      active_student_id,
      setEmotionState,
      setPendingActions,
      setShowCalmingScreen,
      addCrisisAlert,
    ]
  );

  // Inicializar MediaPipe y WebSocket de monitoreo
  useEffect(() => {
    if (!token || !user || !activeSession || !active_student_id) return;

    let mounted = true;

    const init = async () => {
      // WebSocket del estudiante — identificado por su UUID
      wsRef.current = new MonitoringWebSocket(
        active_student_id,
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

      // Solicitar acceso a la cámara
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: "user" },
        });
        if (videoRef.current && mounted) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Inicializar MediaPipe FaceMesh (se carga como script global en layout.tsx)
        // @ts-expect-error — MediaPipe se carga como script global
        if (typeof window !== "undefined" && window.FaceMesh) {
          // @ts-expect-error — tipo externo
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
          faceMesh.onResults(
            (results: { multiFaceLandmarks?: unknown[][] }) => {
              if (results.multiFaceLandmarks?.[0]) {
                lastLandmarksRef.current = results.multiFaceLandmarks[0];
              }
            }
          );
          faceMeshRef.current = faceMesh;

          const processFrame = async () => {
            if (videoRef.current && faceMeshRef.current && mounted) {
              // @ts-expect-error — tipo externo
              await faceMeshRef.current.send({ image: videoRef.current });
            }
            if (mounted) requestAnimationFrame(processFrame);
          };
          processFrame();
        }
      } catch {
        console.warn(
          "Cámara no disponible. El monitoreo continuará sin detección facial."
        );
      }

      // Enviar datos al backend cada 2 segundos
      intervalRef.current = setInterval(() => {
        if (!wsRef.current || !activeSession || !mounted) return;

        const landmarks = lastLandmarksRef.current as
          | { x: number; y: number; z: number }[]
          | null;
        const analysis = landmarks
          ? analyzeLandmarks(landmarks)
          : { emotion: "neutro", attention_level: 0.5, stimming: false };

        // tactile_pressure: boolean (true si hay muchos clics en los últimos 10s)
        const clickSpeed      = getClickSpeed();
        const tactilePressure = clickSpeed > 2; // más de 2 clics/s = presión alta

        const data: MonitoringData = {
          id_session:       activeSession.id_session,
          emotion:          analysis.emotion,
          attention_level:  analysis.attention_level,
          stimming:         analysis.stimming,
          tactile_pressure: tactilePressure,
        };

        wsRef.current.send(data);

        setEmotionState({
          emocion:          analysis.emotion,
          nivel_atencion:   analysis.attention_level,
          stimming:         analysis.stimming,
          tactile_pressure: tactilePressure,
        });
      }, 2000);
    };

    init();

    return () => {
      mounted = false;
      wsRef.current?.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    };
  }, [
    token,
    user,
    active_student_id,
    activeSession,
    analyzeLandmarks,
    getClickSpeed,
    handleMonitoringResponse,
    setEmotionState,
  ]);

  // Componente invisible — solo procesa datos en background
  return (
    <div
      className="fixed top-0 left-0 w-0 h-0 overflow-hidden"
      aria-hidden="true"
    >
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
