/**
 * Aula Global — Cliente WebSocket para monitoreo en tiempo real
 * Gestiona la conexión, reconexión automática y envío de datos de MediaPipe.
 *
 * El `student_id` es ahora un UUID (string), no un entero.
 * Los campos coinciden exactamente con el schema del backend (MonitoringData).
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

/** Datos que el cliente envía al WebSocket del estudiante */
export interface MonitoringData {
  id_session: string;
  emotion: string;
  attention_level: number;
  stimming: boolean;
  tactile_pressure: boolean;
  video_frame?: string;   // JPEG base64 sin prefijo data:
}

export interface AdaptationAction {
  accion: string;
  motivo: string;
  datos: Record<string, unknown> | null;
}

/** Respuesta que devuelve el backend tras procesar los datos de monitoreo */
export interface MonitoringResponse {
  status: string;
  acciones: AdaptationAction[];
  emocion_actual: string;
  nivel_atencion: number;
  alerta_crisis: string | null;
}

type MessageHandler = (response: MonitoringResponse) => void;
type ConnectionHandler = (connected: boolean) => void;

/**
 * WebSocket del estudiante — envía datos de MediaPipe y recibe acciones de adaptación.
 */
export class MonitoringWebSocket {
  private ws: WebSocket | null = null;
  private studentId: string;      // UUID
  private token: string;
  private onMessage: MessageHandler;
  private onConnection: ConnectionHandler;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isClosed = false;

  constructor(
    studentId: string,
    token: string,
    onMessage: MessageHandler,
    onConnection: ConnectionHandler
  ) {
    this.studentId = studentId;
    this.token = token;
    this.onMessage = onMessage;
    this.onConnection = onConnection;
  }

  connect(): void {
    this.isClosed = false;
    const url = `${WS_URL}/api/monitoring/ws/${this.studentId}?token=${this.token}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.onConnection(true);
      };

      this.ws.onmessage = (event) => {
        try {
          const data: MonitoringResponse = JSON.parse(event.data);
          this.onMessage(data);
        } catch {
          console.error("Error al parsear mensaje WebSocket del estudiante");
        }
      };

      this.ws.onclose = () => {
        this.onConnection(false);
        if (!this.isClosed) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = () => {
        this.onConnection(false);
      };
    } catch {
      this.attemptReconnect();
    }
  }

  send(data: MonitoringData): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /** Envía solo un frame de video (alta frecuencia para efecto videollamada). */
  sendFrame(frame: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "frame", video_frame: frame }));
    }
  }

  disconnect(): void {
    this.isClosed = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close();
    this.ws = null;
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts || this.isClosed) {
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * WebSocket del tutor — observa en tiempo real el monitoreo de un estudiante.
 */
export class TutorMonitoringWebSocket {
  private ws: WebSocket | null = null;
  private studentId: string;     // UUID
  private token: string;
  private onMessage: (data: TutorMonitoringUpdate) => void;
  private onConnection: ConnectionHandler;
  private isClosed = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  constructor(
    studentId: string,
    token: string,
    onMessage: (data: TutorMonitoringUpdate) => void,
    onConnection: ConnectionHandler
  ) {
    this.studentId = studentId;
    this.token = token;
    this.onMessage = onMessage;
    this.onConnection = onConnection;
  }

  connect(): void {
    this.isClosed = false;
    const url = `${WS_URL}/api/monitoring/ws/tutor/${this.studentId}?token=${this.token}`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.onConnection(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data: TutorMonitoringUpdate = JSON.parse(event.data);
        this.onMessage(data);
      } catch {
        console.error("Error al parsear mensaje del tutor WebSocket");
      }
    };

    this.ws.onclose = () => {
      this.onConnection(false);
      if (!this.isClosed) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts++), 30000);
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = () => this.onConnection(false);
  }

  disconnect(): void {
    this.isClosed = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.ws = null;
  }
}

/** Mensaje que envía el backend al WebSocket del tutor (notificación de estado) */
export interface TutorMonitoringUpdate {
  type: "monitoring_update" | "frame_update" | string;
  student_id: string;
  // Campos opcionales — solo presentes en monitoring_update
  emocion?: string;          // campo formal
  emocion_actual?: string;   // alias que usa el backend (coincide con MonitoringResponse)
  nivel_atencion?: number;
  stimming?: boolean;
  acciones?: AdaptationAction[];
  alerta_crisis?: string | null;
  // Presente en frame_update y opcionalmente en monitoring_update
  video_frame?: string | null;
}
