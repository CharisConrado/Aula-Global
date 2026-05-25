"""
Aula Global — Seeder de actividades
====================================
Crea al menos 5 actividades DIFERENTES por cada materia de cada grado.

Schema de `content` (coincide con frontend/src/app/estudiante/actividad/[id]/page.tsx):
    {
      "tipo": "quiz" | "lectura" | ... (informativo),
      "temario": "<texto explicativo>",    # se muestra antes de la actividad
      "instruccion": "<consigna corta>",
      "preguntas": [
        {
          "pregunta": "...",
          "opciones": ["a", "b", "c"],
          "respuesta_correcta": 1,   # índice 0-based
          "pista": "..."             # opcional
        },
        ...
      ]
    }

Idempotente: si ya existe una actividad con el mismo título dentro de la misma
materia, no la duplica. Todas se publican como 'publicado'.

Uso:
    cd backend
    python seed_activities.py
"""

import json
import logging
from sqlalchemy import text

from database import SessionLocal

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("seed_activities")


# ── Plantillas de actividades por familia de materia ──────────────────────────

ACTIVIDAD_TEMPLATES: dict[str, list[dict]] = {

    # ─── MATEMÁTICAS ──────────────────────────────────────────────────────────
    "matematicas": [
        {
            "title": "Sumas con dibujos",
            "description": "Cuenta los objetos y descubre el resultado.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "📚 Hoy aprenderemos a SUMAR.\n\n"
                    "Sumar significa juntar grupos de cosas y contar cuántas hay en total.\n\n"
                    "Ejemplo:  🍎🍎 + 🍎 = 🍎🍎🍎  →  2 + 1 = 3\n\n"
                    "Cuando tengas dudas, ¡cuenta despacio con tu dedo cada dibujo!"
                ),
                "instruccion": "Mira los dibujos y elige el número correcto.",
                "preguntas": [
                    {"pregunta": "🍎🍎 + 🍎 = ?",        "opciones": ["2", "3", "4"], "respuesta_correcta": 1, "pista": "Cuenta las manzanas una por una."},
                    {"pregunta": "⭐ + ⭐⭐ = ?",         "opciones": ["3", "4", "5"], "respuesta_correcta": 0, "pista": "Una estrella más dos estrellas."},
                    {"pregunta": "🐶🐶 + 🐶🐶 = ?",       "opciones": ["3", "4", "5"], "respuesta_correcta": 1, "pista": "Dos perritos más dos perritos."},
                    {"pregunta": "🌟🌟🌟 + 🌟 = ?",       "opciones": ["3", "4", "5"], "respuesta_correcta": 1, "pista": "Tres estrellas más una."},
                ],
            },
        },
        {
            "title": "Restas en la granja",
            "description": "Animalitos que se van: ¿cuántos quedan?",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🐔 Hoy aprenderemos a RESTAR.\n\n"
                    "Restar significa QUITAR. Si tengo cosas y se van algunas, "
                    "cuento las que quedan.\n\n"
                    "Ejemplo: Tengo 4 manzanas, me como 1, ahora tengo 3.\n"
                    "         4 - 1 = 3"
                ),
                "instruccion": "Cuenta cuántos animales quedan después de irse algunos.",
                "preguntas": [
                    {"pregunta": "Hay 5 patos y se van 2. ¿Cuántos quedan?",     "opciones": ["2", "3", "4"], "respuesta_correcta": 1, "pista": "5 menos 2."},
                    {"pregunta": "Hay 8 pollitos y se van 5. ¿Cuántos quedan?",  "opciones": ["2", "3", "4"], "respuesta_correcta": 1, "pista": "8 menos 5."},
                    {"pregunta": "Hay 6 vacas y se van 4. ¿Cuántos quedan?",     "opciones": ["1", "2", "3"], "respuesta_correcta": 1, "pista": "6 menos 4."},
                    {"pregunta": "Hay 10 ovejas y se van 3. ¿Cuántas quedan?",   "opciones": ["6", "7", "8"], "respuesta_correcta": 1, "pista": "10 menos 3."},
                ],
            },
        },
        {
            "title": "Tabla del 2 fácil",
            "description": "Multiplica de 2 en 2 con animaciones.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 12,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "✖️ La tabla del 2 es muy fácil.\n\n"
                    "Multiplicar por 2 es lo mismo que sumar el número dos veces:\n"
                    "  2 × 3 = 3 + 3 = 6\n"
                    "  2 × 4 = 4 + 4 = 8\n\n"
                    "¡Es como tener parejas! 👬👬👬"
                ),
                "instruccion": "Elige el resultado correcto de cada multiplicación.",
                "preguntas": [
                    {"pregunta": "2 × 3",  "opciones": ["4", "6", "8"],  "respuesta_correcta": 1, "pista": "3 + 3."},
                    {"pregunta": "2 × 5",  "opciones": ["10", "12", "8"], "respuesta_correcta": 0, "pista": "5 + 5."},
                    {"pregunta": "2 × 7",  "opciones": ["12", "14", "16"], "respuesta_correcta": 1, "pista": "7 + 7."},
                    {"pregunta": "2 × 9",  "opciones": ["16", "18", "20"], "respuesta_correcta": 1, "pista": "9 + 9."},
                ],
            },
        },
        {
            "title": "Figuras geométricas",
            "description": "Reconoce círculos, cuadrados y triángulos.",
            "type_hint": "lectura",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🔺🔵🟦 Las figuras geométricas están en todas partes:\n\n"
                    "• Círculo: redondo, sin esquinas — como una pelota.\n"
                    "• Cuadrado: 4 lados iguales — como una ventana.\n"
                    "• Triángulo: 3 lados — como una pizza.\n"
                    "• Rectángulo: 4 lados, dos largos y dos cortos — como una puerta."
                ),
                "instruccion": "Selecciona la figura correcta.",
                "preguntas": [
                    {"pregunta": "¿Qué figura tiene 3 lados?",   "opciones": ["Círculo", "Cuadrado", "Triángulo"], "respuesta_correcta": 2, "pista": "Como una pizza partida."},
                    {"pregunta": "¿Qué figura es redonda?",       "opciones": ["Triángulo", "Círculo", "Cuadrado"], "respuesta_correcta": 1, "pista": "Como una pelota."},
                    {"pregunta": "¿Qué figura tiene 4 lados iguales?", "opciones": ["Cuadrado", "Triángulo", "Círculo"], "respuesta_correcta": 0, "pista": "Como una ventana."},
                ],
            },
        },
        {
            "title": "Problemas de la vida diaria",
            "description": "Aplica matemáticas a situaciones reales.",
            "type_hint": "quiz",
            "difficulty": "dificil",
            "minutes": 15,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🧠 Los problemas son situaciones de la vida real donde usamos matemáticas.\n\n"
                    "Pasos para resolverlos:\n"
                    "1. Lee con calma.\n"
                    "2. Identifica los números.\n"
                    "3. Decide si sumar, restar, multiplicar o dividir.\n"
                    "4. Cuenta y revisa."
                ),
                "instruccion": "Lee con calma y elige la respuesta.",
                "preguntas": [
                    {"pregunta": "Tengo 12 caramelos y los reparto entre 4 amigos. ¿Cuántos toca a cada uno?", "opciones": ["2", "3", "4"],   "respuesta_correcta": 1, "pista": "Divide 12 entre 4."},
                    {"pregunta": "Compré 3 bolsas con 5 manzanas cada una. ¿Cuántas en total?",                "opciones": ["10", "12", "15"], "respuesta_correcta": 2, "pista": "Multiplica 3 por 5."},
                    {"pregunta": "Mi mamá hizo 20 galletas y comimos 8. ¿Cuántas quedan?",                     "opciones": ["10", "12", "14"], "respuesta_correcta": 1, "pista": "Resta 8 a 20."},
                ],
            },
        },
    ],

    # ─── LENGUAJE / COMUNICACIÓN ──────────────────────────────────────────────
    "lenguaje": [
        {
            "title": "Mi primer alfabeto",
            "description": "Conoce las letras con sonidos amigables.",
            "type_hint": "lectura",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🔤 El alfabeto tiene 27 letras.\n\n"
                    "Cada letra tiene un sonido distinto. Las vocales son: A, E, I, O, U.\n"
                    "Las demás son CONSONANTES. Las vocales siempre suenan, "
                    "y las consonantes necesitan una vocal para hablar."
                ),
                "instruccion": "Identifica la letra correcta.",
                "preguntas": [
                    {"pregunta": "¿Cuál de estas es una VOCAL?", "opciones": ["A", "B", "C"], "respuesta_correcta": 0, "pista": "A, E, I, O, U."},
                    {"pregunta": "¿Con qué letra empieza 'Mamá'?", "opciones": ["P", "M", "T"], "respuesta_correcta": 1, "pista": "Empieza con un sonido suave 'mm'."},
                    {"pregunta": "¿Cuántas vocales hay?",          "opciones": ["3", "5", "7"], "respuesta_correcta": 1, "pista": "A, E, I, O, U."},
                ],
            },
        },
        {
            "title": "Forma palabras",
            "description": "Construye palabras simples.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "✍️ Las palabras se forman juntando letras.\n\n"
                    "Por ejemplo: S + O + L = SOL ☀️\n"
                    "             C + A + S + A = CASA 🏠"
                ),
                "instruccion": "Elige la palabra correcta para cada imagen.",
                "preguntas": [
                    {"pregunta": "☀️ Esta imagen es…",   "opciones": ["SAL", "SOL", "SOS"],   "respuesta_correcta": 1, "pista": "Brilla en el cielo de día."},
                    {"pregunta": "🌙 Esta imagen es…",   "opciones": ["LUNA", "LANA", "LIMA"], "respuesta_correcta": 0, "pista": "Sale de noche."},
                    {"pregunta": "🐶 Esta imagen es…",   "opciones": ["PATO", "PERRO", "PIÑA"], "respuesta_correcta": 1, "pista": "Hace 'guau'."},
                ],
            },
        },
        {
            "title": "Cuento corto: El zorro",
            "description": "Lectura guiada con preguntas.",
            "type_hint": "lectura",
            "difficulty": "medio",
            "minutes": 12,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "📖 EL ZORRO CURIOSO\n\n"
                    "Había una vez un zorro pequeño que vivía en un bosque mágico. "
                    "Todos los días salía a explorar. Un día encontró una colmena llena de miel, "
                    "pero las abejas no querían compartir. El zorro, en lugar de robar, "
                    "decidió plantar flores cerca de la colmena. Las abejas, contentas, "
                    "le regalaron miel todos los días.\n\n"
                    "✨ Moraleja: ser amable trae buenos amigos."
                ),
                "instruccion": "Responde sobre el cuento.",
                "preguntas": [
                    {"pregunta": "¿Dónde vivía el zorro?", "opciones": ["Mar", "Bosque", "Ciudad"], "respuesta_correcta": 1, "pista": "Donde hay árboles."},
                    {"pregunta": "¿Qué encontró el zorro?", "opciones": ["Una colmena", "Un río", "Un castillo"], "respuesta_correcta": 0, "pista": "Algo con miel."},
                    {"pregunta": "¿Qué hizo el zorro para conseguir miel?", "opciones": ["Robar", "Plantar flores", "Pelear"], "respuesta_correcta": 1, "pista": "Algo bonito y útil."},
                ],
            },
        },
        {
            "title": "Sinónimos y antónimos",
            "description": "Aprende palabras opuestas y similares.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "📘 SINÓNIMOS y ANTÓNIMOS:\n\n"
                    "• SINÓNIMOS: palabras que significan lo MISMO. Ej: feliz = contento.\n"
                    "• ANTÓNIMOS: palabras que significan lo CONTRARIO. Ej: frío ≠ caliente."
                ),
                "instruccion": "Elige la palabra correcta.",
                "preguntas": [
                    {"pregunta": "Lo opuesto de FRÍO es…",   "opciones": ["Caliente", "Suave", "Largo"],  "respuesta_correcta": 0, "pista": "Es lo contrario."},
                    {"pregunta": "Sinónimo de FELIZ",         "opciones": ["Triste", "Contento", "Cansado"], "respuesta_correcta": 1, "pista": "Significa lo mismo."},
                    {"pregunta": "Lo opuesto de GRANDE",       "opciones": ["Largo", "Pequeño", "Rápido"], "respuesta_correcta": 1, "pista": "Es chico."},
                    {"pregunta": "Sinónimo de BONITO",         "opciones": ["Feo", "Hermoso", "Difícil"],   "respuesta_correcta": 1, "pista": "Algo lindo."},
                ],
            },
        },
        {
            "title": "Mayúsculas y minúsculas",
            "description": "Aprende cuándo usar cada una.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🔡 Las letras tienen dos formas:\n\n"
                    "• MAYÚSCULAS: grandes (A, B, C). Se usan al INICIO de una oración "
                    "y en los nombres propios (María, Bogotá).\n"
                    "• minúsculas: pequeñas (a, b, c). Se usan en el resto del texto."
                ),
                "instruccion": "Elige la forma correcta.",
                "preguntas": [
                    {"pregunta": "Mi nombre se escribe con…",    "opciones": ["mayúscula al inicio", "todo minúscula", "todo mayúscula"], "respuesta_correcta": 0, "pista": "Los nombres propios empiezan así."},
                    {"pregunta": "Después de un punto, la siguiente letra es…", "opciones": ["minúscula", "mayúscula", "número"], "respuesta_correcta": 1, "pista": "Empieza una oración nueva."},
                ],
            },
        },
    ],

    # ─── CIENCIAS NATURALES ───────────────────────────────────────────────────
    "ciencias": [
        {
            "title": "El cuerpo humano",
            "description": "Aprende las partes del cuerpo.",
            "type_hint": "lectura",
            "difficulty": "facil",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🧍 Nuestro cuerpo tiene muchas partes:\n\n"
                    "• Cabeza 🧠 — donde están los ojos, nariz y boca.\n"
                    "• Tronco — el pecho y el estómago.\n"
                    "• Extremidades — los brazos y las piernas.\n\n"
                    "Cuidamos nuestro cuerpo comiendo sano, durmiendo bien y haciendo ejercicio."
                ),
                "instruccion": "Identifica las partes del cuerpo.",
                "preguntas": [
                    {"pregunta": "¿Con qué parte del cuerpo VEMOS?",   "opciones": ["Boca", "Ojos", "Pies"], "respuesta_correcta": 1, "pista": "Están en la cara."},
                    {"pregunta": "¿Con qué parte CAMINAMOS?",            "opciones": ["Manos", "Piernas", "Orejas"], "respuesta_correcta": 1, "pista": "Las usamos al andar."},
                    {"pregunta": "¿Dónde están los pulmones?",           "opciones": ["Cabeza", "Pecho", "Pies"], "respuesta_correcta": 1, "pista": "Donde respiras."},
                ],
            },
        },
        {
            "title": "Los cinco sentidos",
            "description": "Vista, oído, olfato, gusto y tacto.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "👀👂👃👅✋ Los 5 sentidos son:\n\n"
                    "• VISTA: ver con los ojos.\n"
                    "• OÍDO: escuchar con los oídos.\n"
                    "• OLFATO: oler con la nariz.\n"
                    "• GUSTO: probar con la lengua.\n"
                    "• TACTO: sentir con la piel."
                ),
                "instruccion": "Elige el sentido correcto.",
                "preguntas": [
                    {"pregunta": "Con los ojos podemos…",       "opciones": ["Ver", "Oír", "Probar"],     "respuesta_correcta": 0, "pista": "Mirar."},
                    {"pregunta": "Con la lengua podemos…",       "opciones": ["Ver", "Probar", "Tocar"],   "respuesta_correcta": 1, "pista": "Sabores."},
                    {"pregunta": "Con la nariz podemos…",         "opciones": ["Oler", "Oír", "Tocar"],    "respuesta_correcta": 0, "pista": "Aromas."},
                    {"pregunta": "Con la piel sentimos…",         "opciones": ["Sonidos", "Texturas", "Colores"], "respuesta_correcta": 1, "pista": "Suave, duro, frío."},
                ],
            },
        },
        {
            "title": "Animales del mundo",
            "description": "Clasifica mamíferos, aves y peces.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 12,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🐘🦅🐠 Los animales se agrupan según sus características:\n\n"
                    "• MAMÍFEROS: tienen pelo, dan a luz crías vivas (perro, gato, vaca).\n"
                    "• AVES: tienen plumas, ponen huevos (gallina, paloma, águila).\n"
                    "• PECES: viven en el agua, tienen escamas (sardina, tiburón)."
                ),
                "instruccion": "Clasifica cada animal.",
                "preguntas": [
                    {"pregunta": "¿El perro es…?",   "opciones": ["Ave", "Mamífero", "Pez"], "respuesta_correcta": 1, "pista": "Tiene pelo."},
                    {"pregunta": "¿La paloma es…?",   "opciones": ["Ave", "Mamífero", "Pez"], "respuesta_correcta": 0, "pista": "Vuela."},
                    {"pregunta": "¿La sardina es…?",  "opciones": ["Mamífero", "Pez", "Ave"], "respuesta_correcta": 1, "pista": "Vive en el agua."},
                ],
            },
        },
        {
            "title": "El ciclo del agua",
            "description": "Lluvia, ríos y mar.",
            "type_hint": "lectura",
            "difficulty": "medio",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "💧 EL CICLO DEL AGUA tiene 4 pasos:\n\n"
                    "1. EVAPORACIÓN: el sol calienta el agua del mar y sube como vapor.\n"
                    "2. CONDENSACIÓN: el vapor forma las nubes.\n"
                    "3. PRECIPITACIÓN: las nubes sueltan agua (lluvia, nieve).\n"
                    "4. INFILTRACIÓN: el agua vuelve a los ríos y al mar.\n\n"
                    "¡Y vuelve a empezar!"
                ),
                "instruccion": "Responde sobre el ciclo del agua.",
                "preguntas": [
                    {"pregunta": "¿Qué hace el sol con el agua del mar?", "opciones": ["La congela", "La evapora", "La pinta"], "respuesta_correcta": 1, "pista": "La calienta hasta que sube."},
                    {"pregunta": "¿De qué están hechas las nubes?",        "opciones": ["Algodón", "Vapor de agua", "Polvo"],   "respuesta_correcta": 1, "pista": "Es agua en forma de gas."},
                    {"pregunta": "¿Qué cae de las nubes?",                  "opciones": ["Lluvia", "Sol", "Tierra"],            "respuesta_correcta": 0, "pista": "Es agua que cae."},
                ],
            },
        },
        {
            "title": "Plantas y semillas",
            "description": "Cómo crece una planta.",
            "type_hint": "lectura",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🌱 Las plantas crecen así:\n\n"
                    "1. Una SEMILLA se entierra.\n"
                    "2. Con agua y sol, germina y sale un tallo.\n"
                    "3. Crecen las hojas verdes.\n"
                    "4. Aparecen las flores y luego los frutos.\n\n"
                    "Las plantas necesitan: agua 💧, sol ☀️ y tierra 🌍."
                ),
                "instruccion": "Responde sobre las plantas.",
                "preguntas": [
                    {"pregunta": "¿Qué necesita una planta para crecer?", "opciones": ["Solo agua", "Agua, sol y tierra", "Música"], "respuesta_correcta": 1, "pista": "Tres cosas."},
                    {"pregunta": "¿De qué nace una planta?",                "opciones": ["De una piedra", "De una semilla", "Del aire"], "respuesta_correcta": 1, "pista": "Algo pequeño que se entierra."},
                ],
            },
        },
    ],

    # ─── CIENCIAS SOCIALES ────────────────────────────────────────────────────
    "sociales": [
        {
            "title": "Mi familia",
            "description": "Reconoce a los miembros de la familia.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "👨‍👩‍👧 Una familia es un grupo de personas que se quieren y se cuidan.\n\n"
                    "Algunos miembros típicos:\n"
                    "• Papá y Mamá.\n"
                    "• Hermanos y hermanas.\n"
                    "• Abuelos y abuelas.\n"
                    "• Tíos, tías y primos.\n\n"
                    "Cada familia es diferente y especial."
                ),
                "instruccion": "Identifica a cada miembro.",
                "preguntas": [
                    {"pregunta": "¿Cómo se llama el papá de tu papá?", "opciones": ["Tío", "Abuelo", "Primo"], "respuesta_correcta": 1, "pista": "Suele ser mayor."},
                    {"pregunta": "El hijo de tu tío es tu…",            "opciones": ["Primo", "Hermano", "Abuelo"], "respuesta_correcta": 0, "pista": "Misma generación."},
                    {"pregunta": "Una familia siempre tiene…",           "opciones": ["3 personas", "Personas que se quieren", "Solo papá"], "respuesta_correcta": 1, "pista": "Lo importante es el cariño."},
                ],
            },
        },
        {
            "title": "Mi colegio",
            "description": "Espacios y reglas de convivencia.",
            "type_hint": "lectura",
            "difficulty": "facil",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🏫 El colegio es donde aprendemos y hacemos amigos.\n\n"
                    "Reglas para una buena convivencia:\n"
                    "• Levantar la mano para hablar.\n"
                    "• Respetar a todos.\n"
                    "• Cuidar los útiles propios y los de los demás.\n"
                    "• Compartir y ayudar."
                ),
                "instruccion": "Elige la mejor opción.",
                "preguntas": [
                    {"pregunta": "Para hablar en clase debo…",   "opciones": ["Gritar", "Levantar la mano", "Hacer ruido"], "respuesta_correcta": 1, "pista": "Es la regla."},
                    {"pregunta": "Si un amigo se cae, yo…",       "opciones": ["Me río", "Lo ayudo", "Lo ignoro"],           "respuesta_correcta": 1, "pista": "Ser amable."},
                ],
            },
        },
        {
            "title": "La comunidad",
            "description": "Profesiones y servicios del barrio.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🏘️ En nuestra comunidad muchas personas trabajan para ayudarnos:\n\n"
                    "• 👮 Policía: cuida la seguridad.\n"
                    "• 🚒 Bombero: apaga incendios.\n"
                    "• 👨‍⚕️ Doctor: cura a los enfermos.\n"
                    "• 👨‍🏫 Maestro: enseña en la escuela.\n"
                    "• 🧹 Aseadores: mantienen limpia la ciudad."
                ),
                "instruccion": "Asocia cada profesión con su tarea.",
                "preguntas": [
                    {"pregunta": "¿Quién apaga incendios?",       "opciones": ["Médico", "Bombero", "Maestro"], "respuesta_correcta": 1, "pista": "Usa una manguera."},
                    {"pregunta": "¿Quién enseña en la escuela?",   "opciones": ["Doctor", "Maestro", "Policía"], "respuesta_correcta": 1, "pista": "Da clases."},
                    {"pregunta": "¿Quién cura a los enfermos?",    "opciones": ["Maestro", "Doctor", "Bombero"], "respuesta_correcta": 1, "pista": "Trabaja en un hospital."},
                ],
            },
        },
        {
            "title": "Mi país",
            "description": "Símbolos patrios.",
            "type_hint": "lectura",
            "difficulty": "medio",
            "minutes": 12,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🇨🇴 Cada país tiene 3 símbolos importantes:\n\n"
                    "• BANDERA: tela con colores y a veces dibujos.\n"
                    "• ESCUDO: dibujo que representa la historia del país.\n"
                    "• HIMNO: canción que se canta en actos importantes.\n\n"
                    "Estos símbolos nos hacen sentir parte del país."
                ),
                "instruccion": "Responde sobre los símbolos.",
                "preguntas": [
                    {"pregunta": "¿Cuál es un símbolo patrio?", "opciones": ["Bandera", "Pelota", "Lápiz"],   "respuesta_correcta": 0, "pista": "Tiene colores."},
                    {"pregunta": "El himno es…",                  "opciones": ["Un dibujo", "Una canción", "Un edificio"], "respuesta_correcta": 1, "pista": "Se canta."},
                ],
            },
        },
        {
            "title": "Cuidando el planeta",
            "description": "Reciclaje y medioambiente.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🌍 Cuidar el planeta es tarea de TODOS.\n\n"
                    "Acciones que ayudan:\n"
                    "• Cerrar la llave del agua.\n"
                    "• Apagar luces que no usamos.\n"
                    "• RECICLAR: separar la basura.\n"
                    "  ♻️ Papel (azul), plástico (amarillo), orgánico (verde).\n"
                    "• Cuidar los árboles y los animales."
                ),
                "instruccion": "Elige la acción correcta.",
                "preguntas": [
                    {"pregunta": "¿Qué color es para reciclar papel?", "opciones": ["Rojo", "Azul", "Verde"],     "respuesta_correcta": 1, "pista": "Como el cielo."},
                    {"pregunta": "Para cuidar el agua debo…",            "opciones": ["Dejar la llave abierta", "Cerrarla cuando no la uso", "Tirarla al piso"], "respuesta_correcta": 1, "pista": "No malgastar."},
                ],
            },
        },
    ],

    # ─── INGLÉS ───────────────────────────────────────────────────────────────
    "ingles": [
        {
            "title": "Greetings — Saludos",
            "description": "Hello, goodbye, good morning…",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "👋 En inglés, los saludos básicos son:\n\n"
                    "• Hello! / Hi! — ¡Hola!\n"
                    "• Good morning — Buenos días.\n"
                    "• Good afternoon — Buenas tardes.\n"
                    "• Good night — Buenas noches.\n"
                    "• Goodbye! / Bye! — ¡Adiós!\n"
                    "• Thank you — Gracias."
                ),
                "instruccion": "Traduce los saludos.",
                "preguntas": [
                    {"pregunta": "¿Cómo se dice HOLA?",    "opciones": ["Hello", "Bye", "Thank you"],     "respuesta_correcta": 0, "pista": "H."},
                    {"pregunta": "¿Cómo se dice GRACIAS?",  "opciones": ["Sorry", "Thank you", "Please"], "respuesta_correcta": 1, "pista": "T."},
                    {"pregunta": "¿Cómo se dice ADIÓS?",     "opciones": ["Hello", "Goodbye", "Yes"],     "respuesta_correcta": 1, "pista": "G."},
                ],
            },
        },
        {
            "title": "Numbers 1–10",
            "description": "Los números en inglés.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🔢 Los números del 1 al 10 en inglés:\n\n"
                    "1 one  ·  2 two  ·  3 three  ·  4 four  ·  5 five\n"
                    "6 six  ·  7 seven · 8 eight · 9 nine · 10 ten\n\n"
                    "¡Practícalos en voz alta!"
                ),
                "instruccion": "Asocia número con palabra.",
                "preguntas": [
                    {"pregunta": "¿Cómo se dice 3?",  "opciones": ["Two", "Three", "Four"],  "respuesta_correcta": 1, "pista": "Después de 2."},
                    {"pregunta": "¿Cómo se dice 7?",  "opciones": ["Six", "Seven", "Eight"], "respuesta_correcta": 1, "pista": "Después de 6."},
                    {"pregunta": "¿Qué número es FIVE?", "opciones": ["4", "5", "6"],         "respuesta_correcta": 1, "pista": "La mitad de 10."},
                ],
            },
        },
        {
            "title": "Colors!",
            "description": "Identifica colores en inglés.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🎨 Los colores en inglés:\n\n"
                    "• Red — Rojo 🔴\n"
                    "• Blue — Azul 🔵\n"
                    "• Yellow — Amarillo 🟡\n"
                    "• Green — Verde 🟢\n"
                    "• Black — Negro ⚫\n"
                    "• White — Blanco ⚪"
                ),
                "instruccion": "Asocia el color con su nombre en inglés.",
                "preguntas": [
                    {"pregunta": "Rojo en inglés es…",   "opciones": ["Red", "Blue", "Green"],   "respuesta_correcta": 0, "pista": "R."},
                    {"pregunta": "Azul en inglés es…",    "opciones": ["Yellow", "Blue", "White"], "respuesta_correcta": 1, "pista": "B."},
                    {"pregunta": "Verde en inglés es…",   "opciones": ["Green", "Black", "Red"],  "respuesta_correcta": 0, "pista": "G."},
                ],
            },
        },
        {
            "title": "Animals around us",
            "description": "Vocabulario de animales.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🐾 Animales comunes en inglés:\n\n"
                    "• Dog — Perro 🐶\n"
                    "• Cat — Gato 🐱\n"
                    "• Bird — Pájaro 🐦\n"
                    "• Fish — Pez 🐟\n"
                    "• Horse — Caballo 🐴\n"
                    "• Cow — Vaca 🐄"
                ),
                "instruccion": "Asocia animal con palabra.",
                "preguntas": [
                    {"pregunta": "Perro en inglés es…", "opciones": ["Cat", "Dog", "Fish"],   "respuesta_correcta": 1, "pista": "D."},
                    {"pregunta": "Gato en inglés es…",   "opciones": ["Cat", "Cow", "Bird"],   "respuesta_correcta": 0, "pista": "C, no Cow."},
                    {"pregunta": "Pájaro en inglés es…",  "opciones": ["Horse", "Bird", "Fish"], "respuesta_correcta": 1, "pista": "B."},
                ],
            },
        },
        {
            "title": "My body",
            "description": "Partes del cuerpo en inglés.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🧍 Partes del cuerpo en inglés:\n\n"
                    "• Head — Cabeza\n"
                    "• Hand — Mano\n"
                    "• Foot — Pie\n"
                    "• Eye — Ojo\n"
                    "• Leg — Pierna\n"
                    "• Mouth — Boca"
                ),
                "instruccion": "Traduce las partes del cuerpo.",
                "preguntas": [
                    {"pregunta": "Cabeza en inglés es…", "opciones": ["Hand", "Head", "Foot"], "respuesta_correcta": 1, "pista": "Empieza con H."},
                    {"pregunta": "Mano en inglés es…",    "opciones": ["Hand", "Leg", "Eye"],  "respuesta_correcta": 0, "pista": "H, no Head."},
                    {"pregunta": "Ojo en inglés es…",     "opciones": ["Eye", "Foot", "Mouth"], "respuesta_correcta": 0, "pista": "E."},
                ],
            },
        },
    ],

    # ─── ARTE / EDUCACIÓN ARTÍSTICA ───────────────────────────────────────────
    "arte": [
        {
            "title": "Colores primarios",
            "description": "Rojo, azul y amarillo.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🎨 Los COLORES PRIMARIOS son 3 y no se pueden formar mezclando otros:\n\n"
                    "• 🔴 ROJO\n"
                    "• 🔵 AZUL\n"
                    "• 🟡 AMARILLO\n\n"
                    "Mezclándolos formamos todos los demás colores."
                ),
                "instruccion": "Elige la opción correcta.",
                "preguntas": [
                    {"pregunta": "¿Cuántos colores primarios hay?",  "opciones": ["2", "3", "5"],     "respuesta_correcta": 1, "pista": "Rojo, azul y amarillo."},
                    {"pregunta": "¿Cuál NO es color primario?",       "opciones": ["Rojo", "Verde", "Amarillo"], "respuesta_correcta": 1, "pista": "El verde se forma mezclando."},
                ],
            },
        },
        {
            "title": "Formas y patrones",
            "description": "Combina figuras para crear arte.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🔷 Un PATRÓN es una secuencia que se repite.\n\n"
                    "Ejemplo: 🔴🔵🔴🔵🔴🔵 — rojo y azul alternados.\n\n"
                    "Los artistas usan patrones para crear obras bonitas y ordenadas."
                ),
                "instruccion": "Sigue el patrón.",
                "preguntas": [
                    {"pregunta": "¿Qué sigue? 🔴🔵🔴🔵🔴…", "opciones": ["🔴", "🔵", "🟡"], "respuesta_correcta": 1, "pista": "Se alternan."},
                    {"pregunta": "¿Qué sigue? 🔺🔵🔺🔵🔺…",  "opciones": ["🔺", "🔵", "🟡"], "respuesta_correcta": 1, "pista": "Triángulo, círculo, triángulo…"},
                ],
            },
        },
        {
            "title": "Mezcla de colores",
            "description": "Descubre colores nuevos.",
            "type_hint": "lectura",
            "difficulty": "medio",
            "minutes": 10,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🎨 Cuando mezclamos colores primarios obtenemos los SECUNDARIOS:\n\n"
                    "• 🔴 Rojo + 🟡 Amarillo = 🟠 NARANJA\n"
                    "• 🔵 Azul + 🟡 Amarillo = 🟢 VERDE\n"
                    "• 🔴 Rojo + 🔵 Azul = 🟣 MORADO"
                ),
                "instruccion": "Elige el resultado de cada mezcla.",
                "preguntas": [
                    {"pregunta": "Rojo + Amarillo = ?", "opciones": ["Verde", "Naranja", "Morado"], "respuesta_correcta": 1, "pista": "Como una mandarina."},
                    {"pregunta": "Azul + Amarillo = ?",  "opciones": ["Verde", "Naranja", "Morado"], "respuesta_correcta": 0, "pista": "Como la hierba."},
                    {"pregunta": "Rojo + Azul = ?",       "opciones": ["Naranja", "Morado", "Verde"], "respuesta_correcta": 1, "pista": "Como una uva."},
                ],
            },
        },
        {
            "title": "Dibujando emociones",
            "description": "Expresa cómo te sientes con colores.",
            "type_hint": "quiz",
            "difficulty": "medio",
            "minutes": 12,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "💛 El ARTE sirve para expresar emociones.\n\n"
                    "Los colores transmiten sentimientos:\n"
                    "• 🟡 Amarillo: alegría, energía.\n"
                    "• 🔵 Azul: calma, tranquilidad.\n"
                    "• 🔴 Rojo: pasión, enojo.\n"
                    "• ⚫ Negro: misterio, tristeza."
                ),
                "instruccion": "Elige el color que mejor representa cada emoción.",
                "preguntas": [
                    {"pregunta": "¿Qué color usarías para ALEGRÍA?",     "opciones": ["Negro", "Amarillo", "Gris"], "respuesta_correcta": 1, "pista": "Brillante como el sol."},
                    {"pregunta": "¿Qué color usarías para CALMA?",         "opciones": ["Rojo", "Azul", "Naranja"], "respuesta_correcta": 1, "pista": "Como el cielo."},
                    {"pregunta": "¿Qué color usarías para ENOJO?",          "opciones": ["Rojo", "Azul", "Blanco"],  "respuesta_correcta": 0, "pista": "Color fuerte."},
                ],
            },
        },
        {
            "title": "Música y ritmo",
            "description": "Sigue el ritmo con palmas.",
            "type_hint": "quiz",
            "difficulty": "facil",
            "minutes": 8,
            "content": {
                "tipo": "quiz",
                "temario": (
                    "🎵 La música tiene RITMO: una secuencia de sonidos cortos y largos.\n\n"
                    "👏 Practicar ritmo con palmas ayuda a la coordinación.\n\n"
                    "Ejemplo: PALMA-PALMA-pausa-PALMA  →  👏👏 _ 👏"
                ),
                "instruccion": "Responde sobre música.",
                "preguntas": [
                    {"pregunta": "¿Qué es el ritmo?",        "opciones": ["Un dibujo", "Una secuencia de sonidos", "Una comida"], "respuesta_correcta": 1, "pista": "Es musical."},
                    {"pregunta": "Con las manos se hace…",    "opciones": ["Ruido feo", "Palmas con ritmo", "Nada"],              "respuesta_correcta": 1, "pista": "Aplausos a tiempo."},
                ],
            },
        },
    ],
}

# Alias frecuentes que usan los administradores al crear materias
ALIASES: dict[str, str] = {
    "matemática":          "matematicas", "matemáticas": "matematicas",
    "matematica":          "matematicas", "math":         "matematicas",

    "lengua":              "lenguaje",   "lengua y literatura": "lenguaje",
    "comunicacion":        "lenguaje",   "comunicación":         "lenguaje",
    "español":             "lenguaje",   "espanol":              "lenguaje",

    "ciencias naturales":  "ciencias",   "naturales":  "ciencias",
    "biología":            "ciencias",   "biologia":   "ciencias",

    "ciencias sociales":   "sociales",   "historia":   "sociales",
    "geografía":           "sociales",   "geografia":  "sociales",

    "inglés":              "ingles",     "english":    "ingles",

    "artística":           "arte",       "artistica":  "arte",
    "música":              "arte",       "musica":     "arte",
    "dibujo":              "arte",
}


def _slug(name: str) -> str:
    return (
        name.strip().lower()
        .replace("á", "a").replace("é", "e").replace("í", "i")
        .replace("ó", "o").replace("ú", "u")
    )


def _resolve_template_key(subject_name: str) -> str:
    s = _slug(subject_name)
    if s in ACTIVIDAD_TEMPLATES:
        return s
    if s in ALIASES:
        return ALIASES[s]
    for k in ACTIVIDAD_TEMPLATES:
        if k in s or s in k:
            return k
    return "matematicas"


def _ensure_type_activities(db) -> dict[str, str]:
    needed = {
        "quiz":    "Preguntas de selección múltiple",
        "lectura": "Lectura guiada con apoyos visuales",
        "juego":   "Actividad lúdica con interacción",
        "video":   "Material en video con pausas",
    }
    existing = {
        r[1]: str(r[0])
        for r in db.execute(text("SELECT id_type_activity, name FROM type_activity")).fetchall()
    }
    for name, descr in needed.items():
        if name not in existing:
            row = db.execute(
                text("INSERT INTO type_activity (name, description) VALUES (:n, :d) "
                     "RETURNING id_type_activity, name"),
                {"n": name, "d": descr},
            ).fetchone()
            existing[row[1]] = str(row[0])
            log.info(f"  + tipo de actividad creado: {name}")
    return existing


def seed():
    db = SessionLocal()
    try:
        log.info("Asegurando tipos de actividad…")
        type_ids = _ensure_type_activities(db)
        db.commit()

        rows = db.execute(text("""
            SELECT s.id_subject, s.subject_name, d.id_degree, d.grade_name, d.level
            FROM subject s
            JOIN degree  d ON d.id_degree = s.id_degree
            WHERE s.is_active = true
            ORDER BY d.level, s.subject_name
        """)).fetchall()

        if not rows:
            log.warning("No hay materias activas. Crea grados y materias primero.")
            return

        total_inserted = 0
        for r in rows:
            subj_id, subj_name, _, grade_name, _ = str(r[0]), r[1], str(r[2]), r[3], r[4]
            key = _resolve_template_key(subj_name)
            templates = ACTIVIDAD_TEMPLATES[key]

            log.info(f"\n[{grade_name}] {subj_name}  →  plantilla '{key}' ({len(templates)} actividades)")

            for tpl in templates:
                exists = db.execute(
                    text("SELECT 1 FROM activity WHERE id_subject = CAST(:sid AS uuid) AND title = :t"),
                    {"sid": subj_id, "t": tpl["title"]},
                ).fetchone()
                if exists:
                    log.info(f"  · ya existe: {tpl['title']}")
                    continue

                type_act_id = type_ids.get(tpl["type_hint"]) or next(iter(type_ids.values()))
                db.execute(
                    text("""
                        INSERT INTO activity (id_subject, id_type_activity, title, description,
                            difficulty_level, content, estimated_minutes, publication_status)
                        VALUES (CAST(:sid AS uuid), CAST(:tid AS uuid), :title, :description,
                            :difficulty, CAST(:content AS jsonb), :minutes, 'publicado')
                    """),
                    {
                        "sid":        subj_id,
                        "tid":        type_act_id,
                        "title":      tpl["title"],
                        "description": tpl["description"],
                        "difficulty": tpl["difficulty"],
                        "content":    json.dumps(tpl["content"], ensure_ascii=False),
                        "minutes":    tpl["minutes"],
                    },
                )
                total_inserted += 1
                log.info(f"  + creada: {tpl['title']}  ({tpl['type_hint']}, {tpl['difficulty']})")

            db.commit()

        log.info(f"\n✔ Seed completado. Actividades nuevas insertadas: {total_inserted}")

    except Exception as e:
        db.rollback()
        log.error(f"Error en seed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
