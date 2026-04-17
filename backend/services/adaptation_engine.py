"""
Aula Global — Motor de adaptación en tiempo real
Aplica reglas automáticas según el estado emocional y conductual del estudiante.

IDs son UUIDs (str), tactile_pressure es float internamente (0.0 ó 1.0)
ya que el router de monitoreo convierte el bool antes de llamar a process().
"""

import time
from typing import Optional
from dataclasses import dataclass, field
from models.schemas import (
    Emocion,
    NivelCrisis,
    AccionAdaptacion,
    AdaptationAction,
    MonitoringWebSocketResponse,
)


@dataclass
class StudentState:
    """Estado acumulado del estudiante durante una sesión."""
    student_id: str   # UUID
    session_id: str   # UUID
    emocion_actual: Emocion = Emocion.neutro
    nivel_atencion: float = 0.5
    stimming: bool = False
    presion_tactil: float = 0.0

    # Timestamps para rastrear duración de estados
    frustrado_desde:    Optional[float] = None
    baja_atencion_desde: Optional[float] = None
    estresado_desde:    Optional[float] = None

    # Contadores de crisis
    crisis_detectadas:  int = 0
    ultima_crisis_nivel: Optional[NivelCrisis] = None

    # Historial reciente de emociones (últimos 30 s, ~15 muestras a 2 s)
    historial_emociones: list = field(default_factory=list)


class AdaptationEngine:
    """
    Motor de reglas de adaptación que evalúa el estado del estudiante
    y genera acciones automáticas en tiempo real.
    """

    # Umbrales configurables
    UMBRAL_FRUSTRACION_SEGUNDOS  = 30
    UMBRAL_BAJA_ATENCION_SEGUNDOS = 20
    UMBRAL_BAJA_ATENCION_VALOR   = 0.3
    UMBRAL_ESTRES_SEGUNDOS       = 15
    MAX_HISTORIAL                = 15

    def __init__(self):
        # Estado por estudiante: {student_id (str UUID): StudentState}
        self._states: dict[str, StudentState] = {}

    def get_or_create_state(self, student_id: str, session_id: str) -> StudentState:
        """Obtiene o crea el estado de un estudiante."""
        if student_id not in self._states or self._states[student_id].session_id != session_id:
            self._states[student_id] = StudentState(
                student_id=student_id,
                session_id=session_id,
            )
        return self._states[student_id]

    def clear_state(self, student_id: str):
        """Limpia el estado de un estudiante (al desconectarse)."""
        self._states.pop(student_id, None)

    def process(
        self,
        student_id: str,
        session_id: str,
        emocion: Emocion,
        nivel_atencion: float,
        stimming: bool,
        presion_tactil: float = 0.0,  # 0.0 = sin presión, 1.0 = alta presión
    ) -> MonitoringWebSocketResponse:
        """
        Procesa una muestra de monitoreo y devuelve las acciones de adaptación.

        Reglas implementadas:
        1. Frustración > 30 s         → simplificar_contenido
        2. Atención < 0.3 por > 20 s  → pausa_visual
        3. Stimming detectado         → cambiar_formato
        4. Estrés + crisis leve       → mostrar_pista + adaptar_contenido
        5. Crisis moderada            → alerta_tutor
        6. Crisis grave               → intervencion_profesional
        """
        now   = time.time()
        state = self.get_or_create_state(student_id, session_id)

        # Actualizar estado
        state.emocion_actual = emocion
        state.nivel_atencion = nivel_atencion
        state.stimming       = stimming
        state.presion_tactil = presion_tactil

        # Historial reciente
        state.historial_emociones.append({"emocion": emocion, "ts": now})
        if len(state.historial_emociones) > self.MAX_HISTORIAL:
            state.historial_emociones.pop(0)

        acciones:      list[AdaptationAction] = []
        alerta_crisis: Optional[NivelCrisis]  = None

        # ── Regla 1: Frustración prolongada ──────────────────────────
        if emocion == Emocion.frustrado:
            if state.frustrado_desde is None:
                state.frustrado_desde = now
            elif (now - state.frustrado_desde) >= self.UMBRAL_FRUSTRACION_SEGUNDOS:
                acciones.append(AdaptationAction(
                    accion=AccionAdaptacion.simplificar_contenido,
                    motivo="Frustración detectada por más de 30 segundos",
                    datos={"duracion_frustrado": round(now - state.frustrado_desde)},
                ))
                state.frustrado_desde = now  # Reiniciar para evitar spam
        else:
            state.frustrado_desde = None

        # ── Regla 2: Atención baja prolongada ────────────────────────
        if nivel_atencion < self.UMBRAL_BAJA_ATENCION_VALOR:
            if state.baja_atencion_desde is None:
                state.baja_atencion_desde = now
            elif (now - state.baja_atencion_desde) >= self.UMBRAL_BAJA_ATENCION_SEGUNDOS:
                acciones.append(AdaptationAction(
                    accion=AccionAdaptacion.pausa_visual,
                    motivo="Nivel de atención bajo por más de 20 segundos",
                    datos={"nivel_atencion": nivel_atencion, "duracion_baja": round(now - state.baja_atencion_desde)},
                ))
                state.baja_atencion_desde = now
        else:
            state.baja_atencion_desde = None

        # ── Regla 3: Stimming detectado ──────────────────────────────
        if stimming:
            acciones.append(AdaptationAction(
                accion=AccionAdaptacion.cambiar_formato,
                motivo="Comportamiento de autoestimulación detectado",
                datos={"stimming": True},
            ))

        # ── Reglas 4-6: Estrés y niveles de crisis ───────────────────
        if emocion == Emocion.estresado:
            if state.estresado_desde is None:
                state.estresado_desde = now

            duracion_estres = now - state.estresado_desde
            nivel_crisis    = self._evaluar_crisis(state, duracion_estres, presion_tactil)

            if nivel_crisis:
                alerta_crisis            = nivel_crisis
                state.ultima_crisis_nivel = nivel_crisis
                state.crisis_detectadas  += 1

                if nivel_crisis == NivelCrisis.leve:
                    acciones.append(AdaptationAction(
                        accion=AccionAdaptacion.mostrar_pista,
                        motivo="Estrés detectado — crisis leve",
                        datos={"nivel_crisis": "leve"},
                    ))
                    acciones.append(AdaptationAction(
                        accion=AccionAdaptacion.adaptar_contenido if hasattr(AccionAdaptacion, "adaptar_contenido")
                               else AccionAdaptacion.simplificar_contenido,
                        motivo="Adaptación de contenido por crisis leve",
                        datos={"nivel_crisis": "leve"},
                    ))
                elif nivel_crisis == NivelCrisis.moderada:
                    acciones.append(AdaptationAction(
                        accion=AccionAdaptacion.alerta_tutor,
                        motivo="Crisis moderada — se notifica al tutor",
                        datos={"nivel_crisis": "moderada", "duracion_estres": round(duracion_estres)},
                    ))
                elif nivel_crisis == NivelCrisis.grave:
                    acciones.append(AdaptationAction(
                        accion=AccionAdaptacion.intervencion_profesional,
                        motivo="Crisis grave — intervención profesional inmediata",
                        datos={"nivel_crisis": "grave", "duracion_estres": round(duracion_estres)},
                    ))
        else:
            state.estresado_desde = None

        # ── Regla adicional: Ansiedad + baja atención ─────────────────
        if emocion == Emocion.ansioso and nivel_atencion < 0.4:
            acciones.append(AdaptationAction(
                accion=AccionAdaptacion.pausa_visual,
                motivo="Ansiedad combinada con baja atención",
                datos={"emocion": "ansioso", "nivel_atencion": nivel_atencion},
            ))

        return MonitoringWebSocketResponse(
            status="ok",
            acciones=acciones,
            emocion_actual=emocion,
            nivel_atencion=nivel_atencion,
            alerta_crisis=alerta_crisis.value if alerta_crisis else None,
        )

    def _evaluar_crisis(
        self,
        state: StudentState,
        duracion_estres: float,
        presion_tactil: float,
    ) -> Optional[NivelCrisis]:
        """Evalúa el nivel de crisis según intensidad y duración."""

        # Crisis grave: estrés prolongado + presión táctil alta
        if duracion_estres > 60 and presion_tactil > 0.8:
            return NivelCrisis.grave

        # Crisis grave: mayoría de emociones negativas en el historial
        emociones_negativas = sum(
            1 for e in state.historial_emociones
            if e["emocion"] in (Emocion.frustrado, Emocion.estresado, Emocion.ansioso)
        )
        if emociones_negativas >= 12:  # ≥ 80 % del historial (15 muestras)
            return NivelCrisis.grave

        # Crisis moderada: estrés > 30 s o presión alta
        if duracion_estres > 30 or presion_tactil > 0.6:
            return NivelCrisis.moderada

        # Crisis leve: estrés superó el umbral mínimo
        if duracion_estres > self.UMBRAL_ESTRES_SEGUNDOS:
            return NivelCrisis.leve

        return None


# Instancia global del motor de adaptación
adaptation_engine = AdaptationEngine()
