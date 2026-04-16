/**
 * Aula Global — Cliente WebSocket para monitoreo en tiempo real
 * Gestiona la conexión, reconexión automática y envío de datos de MediaPipe.
 */

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export interface MonitoringData {
  session_id: number;
  student_id: number;
  emocion: string;
  nivel_atencion: number;
  stimming: boolean;
  presion_tactil: number;
  velocidad_clics: number;
}

export interface AdaptationAction {
  accion: string;
  motivo: string;
  datos: Record<string, unknown> | null;
}

export interface MonitoringResponse {
  status: string;
  acciones: AdaptationAction[];
  emocion_actual: string;
  nivel_atencion: number;
  alerta_crisis: string | null;
}

type MessageHandler = (response: MonitoringResponse) => void;
type ConnectionHandler = (connected: boolean) => void;

export class MonitoringWebSocket {
  private ws: WebSocket | null = null;
  private studentId: number;
  private token: string;
  private onMessage: MessageHandler;
  private onConnection: ConnectionHandler;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isClosed = false;

  constructor(
    studentId: number,
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
          console.error("Error al parsear mensaje WebSocket");
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
 * WebSocket para que el tutor observe el monitoreo de un estudiante.
 */
export class TutorMonitoringWebSocket {
  private ws: WebSocket | null = null;
  private studentId: number;
  private token: string;
  private onMessage: (data: TutorMonitoringUpdate) => void;
  private onConnection: ConnectionHandler;
  private isClosed = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  constructor(
    studentId: number,
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

export interface TutorMonitoringUpdate {
  type: string;
  student_id: number;
  emocion: string;
  nivel_atencion: number;
  stimming: boolean;
  presion_tactil: number;
  acciones: AdaptationAction[];
  alerta_crisis: string | null;
}
