"""
Aula Global — Seed Currículo Primaria
Extrae contenido de 120 PPTXs, los sube a Supabase Storage
y genera actividades evaluativas basadas en el contenido real.

Uso:
    cd backend
    pip install python-pptx supabase psycopg2-binary python-dotenv
    python seed_curriculum.py
"""
import os
import json
import sys
import random
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DATABASE_URL         = os.getenv("DATABASE_URL", "")

TEMAS_DIR = Path(r"D:\Users\TRABAJO\Downloads\Curriculo_Primaria_120_Temas_1\temas")
BUCKET    = "presentations"

random.seed(7)  # reproducible

# ── Mapeos ────────────────────────────────────────────────────────────────────

GRADE_FOLDER_TO_LEVEL = {
    "1-primero-de-primaria": 1,
    "2-segundo-de-primaria": 2,
    "3-tercero-de-primaria": 3,
    "4-cuarto-de-primaria":  4,
    "5-quinto-de-primaria":  5,
}

SUBJECT_KEY_MAP = {
    "arte":               ("Arte",               "🎨", "#FF6B6B"),
    "ciencias-naturales": ("Ciencias Naturales", "🌿", "#43A047"),
    "ciencias-sociales":  ("Ciencias Sociales",  "🌍", "#FF9800"),
    "ingles":             ("Inglés",             "🇺🇸", "#2196F3"),
    "lenguaje":           ("Lenguaje",           "📚", "#9C27B0"),
    "matematicas":        ("Matemáticas",        "🔢", "#E53935"),
}

# 9 tipos de actividad que rotamos
TYPES_ROTATION = [
    "quiz", "ejercicio", "memoria", "asociar", "arrastrar",
    "completar", "dibujo", "lectura", "video",
]

DIFFICULTY_ROTATION = ["facil", "medio", "dificil"]

STOP_WORDS = {
    "y", "e", "o", "u", "a", "de", "del", "la", "el", "los",
    "las", "un", "una", "con", "en", "al",
}

# ── Texto ─────────────────────────────────────────────────────────────────────

def slug_to_title(slug: str) -> str:
    words = slug.replace("-", " ").split()
    return " ".join(
        w.capitalize() if i == 0 or w not in STOP_WORDS else w
        for i, w in enumerate(words)
    )

def parse_filename(name: str):
    stem  = Path(name).stem
    parts = stem.split("_", 2)
    if len(parts) < 3:
        return None, stem
    return parts[1], slug_to_title(parts[2])

# ── Extracción PPTX ───────────────────────────────────────────────────────────

TITLE_PH_TYPES = {1, 3}   # PP_PLACEHOLDER.TITLE=1, CENTER_TITLE=3

def extract_slides(pptx_path: Path):
    """
    Lee el PPTX y devuelve (slides_list, full_text).

    slides_list: [{"num": int, "titulo": str, "puntos": [str]}]
    full_text:   todo el texto concatenado (para generar actividades)
    """
    try:
        from pptx import Presentation
    except ImportError:
        return [], ""

    try:
        prs = Presentation(str(pptx_path))
    except Exception as e:
        print(f"    ! No se pudo leer PPTX: {e}")
        return [], ""

    slides_data = []
    all_parts   = []

    for slide_idx, slide in enumerate(prs.slides):
        titulo = ""
        puntos = []

        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            text = shape.text_frame.text.strip()
            if not text:
                continue

            # ¿Es placeholder de título?
            is_title = False
            try:
                ph = shape.placeholder_format
                if ph is not None and ph.type in TITLE_PH_TYPES:
                    is_title = True
            except Exception:
                pass

            if is_title:
                titulo = text
            else:
                for para in shape.text_frame.paragraphs:
                    line = para.text.strip()
                    if line and len(line) > 2:
                        puntos.append(line[:220])  # cap longitud

        if titulo or puntos:
            slides_data.append({
                "num":    slide_idx + 1,
                "titulo": titulo,
                "puntos": puntos[:8],
            })
            if titulo:
                all_parts.append(titulo)
            all_parts.extend(puntos[:3])

    return slides_data, " | ".join(all_parts)

# ── Generación de actividades ─────────────────────────────────────────────────

def _all_bullets(slides):
    out = []
    for s in slides:
        out.extend(s["puntos"])
    return out

def generate_content(type_name: str, title: str, slides: list) -> dict:
    """
    Genera contenido de actividad basado en el contenido real del PPTX.
    """
    bullets  = _all_bullets(slides)
    titles   = [s["titulo"] for s in slides if s["titulo"]]
    key_term = titles[0] if titles else title

    # ── Quiz ──────────────────────────────────────────────────────────────────
    if type_name == "quiz":
        preguntas = []
        for s in slides:
            if not s["puntos"]:
                continue
            correct = s["puntos"][0]
            # Distractores: bullets de otras diapositivas
            pool = [b for b in bullets if b != correct]
            random.shuffle(pool)
            distractors = pool[:3]
            while len(distractors) < 3:
                distractors.append("No se menciona en la presentación")

            opts = [correct] + distractors
            random.shuffle(opts)
            correct_idx = opts.index(correct)
            topic = s["titulo"] or title

            preguntas.append({
                "pregunta":          f"¿Qué es correcto sobre '{topic}'?",
                "opciones":          opts,
                "respuesta_correcta": correct_idx,
                "pista":             f"Revisa la diapositiva {s['num']}",
            })
            if len(preguntas) >= 5:
                break

        if not preguntas:
            preguntas = [{
                "pregunta":           f"¿De qué trata la presentación sobre {title}?",
                "opciones":           [title, "Otro tema diferente", "Historia antigua", "Un cuento"],
                "respuesta_correcta": 0,
            }]
        return {"preguntas": preguntas}

    # ── Ejercicio ─────────────────────────────────────────────────────────────
    elif type_name == "ejercicio":
        context = f"'{bullets[0]}'" if bullets else ""
        enunciado = (
            f"Según la presentación, explica con tus propias palabras:\n\n"
            f"¿Qué aprendiste sobre {key_term}?"
        )
        if context:
            enunciado += f"\n\nRecuerda lo que dice la presentación: {context}"
        return {"enunciado": enunciado, "solucion_url": None}

    # ── Memoria / Asociar ─────────────────────────────────────────────────────
    elif type_name in ("memoria", "asociar"):
        pares = []
        for s in slides:
            if s["titulo"] and s["puntos"]:
                pares.append({"a": s["titulo"], "b": s["puntos"][0]})
            if len(pares) >= 6:
                break
        if not pares:
            pares = [
                {"a": title,    "b": "Tema principal"},
                {"a": key_term, "b": "Concepto clave"},
            ]
        return {"pares": pares}

    # ── Arrastrar ─────────────────────────────────────────────────────────────
    elif type_name == "arrastrar":
        items = titles[:6] or bullets[:6] or [title]
        return {
            "elementos":  items,
            "categorias": ["Lo que aprendí", "Quiero saber más"],
        }

    # ── Completar ─────────────────────────────────────────────────────────────
    elif type_name == "completar":
        oraciones = []
        for bullet in bullets:
            words = bullet.split()
            if len(words) >= 4:
                blank = words[-1].rstrip(".,;:!¡¿?")
                frase = " ".join(words[:-1]) + " _____."
                oraciones.append({"texto": frase, "respuesta": blank})
            if len(oraciones) >= 5:
                break
        if not oraciones:
            oraciones = [{"texto": f"La presentación habla sobre _____.", "respuesta": title}]
        return {"oraciones": oraciones}

    # ── Dibujo ────────────────────────────────────────────────────────────────
    elif type_name == "dibujo":
        topic = titles[0] if titles else title
        instruccion = (
            f"✏️ Dibuja lo que aprendiste sobre '{topic}' "
            f"después de ver la presentación. ¡Usa todos los colores!"
        )
        return {"instruccion": instruccion, "dibujo_url": None}

    # ── Lectura ───────────────────────────────────────────────────────────────
    elif type_name == "lectura":
        partes = []
        for s in slides:
            if s["titulo"]:
                partes.append(f"📌 {s['titulo']}")
            for p in s["puntos"]:
                partes.append(f"   • {p}")
        texto = "\n".join(partes) if partes else f"Tema: {title}"
        return {
            "texto":              texto,
            "pregunta_reflexion": f"¿Cuál fue la idea más importante que aprendiste sobre {title}?",
        }

    # ── Video ─────────────────────────────────────────────────────────────────
    elif type_name == "video":
        busqueda = f"{title} para niños explicación educativa"
        return {
            "video_url":        None,
            "video_tipo":       "buscar",
            "busqueda_sugerida": busqueda,
            "instruccion":      f"🎬 Busca un video sobre '{title}' y cuéntanos qué aprendiste.",
        }

    return {}

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    try:
        from supabase import create_client
        import psycopg2
    except ImportError as e:
        print(f"Falta dependencia: {e}")
        print("Instala con:  pip install supabase psycopg2-binary python-dotenv python-pptx")
        sys.exit(1)

    try:
        from pptx import Presentation  # noqa: F401
    except ImportError:
        print("Falta python-pptx. Instala con:  pip install python-pptx")
        sys.exit(1)

    print("=" * 60)
    print("  Aula Global — Seed Currículo Primaria (con extracción PPTX)")
    print("=" * 60)

    # ── Supabase Storage ──────────────────────────────────────────────────────
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    try:
        supabase.storage.create_bucket(BUCKET, options={"public": True})
        print(f"✓ Bucket '{BUCKET}' creado")
    except Exception as e:
        msg = str(e).lower()
        if "already exists" in msg or "duplicate" in msg or "409" in msg:
            print(f"• Bucket '{BUCKET}' ya existe — OK")
        else:
            print(f"! Error creando bucket: {e}")

    # ── Base de datos ─────────────────────────────────────────────────────────
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # Grados
    cur.execute("SELECT id_degree, grade_name, level FROM degree ORDER BY level")
    rows = cur.fetchall()
    level_to_degree_id = {r[2]: str(r[0]) for r in rows}
    print(f"\nGrados en DB: {[r[1] for r in rows]}")

    if not level_to_degree_id:
        print("¡No hay grados en la DB! Crea los grados primero.")
        sys.exit(1)

    # Tipos de actividad
    cur.execute("SELECT id_type_activity, LOWER(name) FROM type_activity")
    type_map = {r[1]: str(r[0]) for r in cur.fetchall()}
    print(f"Tipos en DB : {list(type_map.keys())}")

    # ── Procesar grados ───────────────────────────────────────────────────────
    total_uploaded = 0
    total_created  = 0
    type_idx       = 0
    diff_idx       = 0

    for grade_folder, grade_level in GRADE_FOLDER_TO_LEVEL.items():
        grade_path = TEMAS_DIR / grade_folder
        if not grade_path.exists():
            print(f"\n[!] Carpeta no encontrada: {grade_path}")
            continue

        degree_id = level_to_degree_id.get(grade_level)
        if not degree_id:
            print(f"\n[!] Grado nivel {grade_level} no en DB")
            continue

        print(f"\n── Grado {grade_level} {'─'*42}")

        # Materias ya existentes para este grado
        cur.execute(
            "SELECT id_subject, subject_name FROM subject WHERE id_degree = %s::uuid",
            (degree_id,)
        )
        subject_cache = {r[1]: str(r[0]) for r in cur.fetchall()}

        pptx_files = sorted(grade_path.glob("*.pptx"))

        for pptx_file in pptx_files:
            subject_key, title = parse_filename(pptx_file.name)

            if subject_key not in SUBJECT_KEY_MAP:
                print(f"  [!] Subject key desconocido '{subject_key}' — {pptx_file.name}")
                continue

            subject_name, icon, color = SUBJECT_KEY_MAP[subject_key]

            # Crear materia si no existe
            if subject_name not in subject_cache:
                cur.execute("""
                    INSERT INTO subject (id_degree, subject_name, description, icon, color, is_active)
                    VALUES (%s::uuid, %s, %s, %s, %s, true)
                    RETURNING id_subject
                """, (degree_id, subject_name, f"Materia de {subject_name}", icon, color))
                subject_id = str(cur.fetchone()[0])
                conn.commit()
                subject_cache[subject_name] = subject_id
                print(f"  ✓ Materia creada: {subject_name}")
            else:
                subject_id = subject_cache[subject_name]

            # ── Extraer contenido del PPTX ────────────────────────────────────
            print(f"  → Extrayendo: {pptx_file.name}")
            slides, full_text = extract_slides(pptx_file)
            print(f"     {len(slides)} diapositivas con texto extraídas")

            # ── Subir PPTX a Supabase Storage ─────────────────────────────────
            storage_path = f"{grade_folder}/{pptx_file.name}"
            public_url   = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"

            try:
                with open(pptx_file, "rb") as f:
                    file_bytes = f.read()

                supabase.storage.from_(BUCKET).upload(
                    storage_path,
                    file_bytes,
                    {
                        "content-type": (
                            "application/vnd.openxmlformats-officedocument"
                            ".presentationml.presentation"
                        ),
                        "upsert": "true",
                    },
                )
                total_uploaded += 1
                print(f"     ↑ Subido a Storage")
            except Exception as e:
                msg = str(e).lower()
                if "already exists" in msg or "duplicate" in msg or "409" in msg:
                    print(f"     • Ya en Storage")
                else:
                    print(f"     [!] Error subiendo: {e}")
                    # No hacemos continue — igual creamos la actividad

            # ── Tipo y dificultad en rotación ─────────────────────────────────
            type_name  = TYPES_ROTATION[type_idx % len(TYPES_ROTATION)]
            difficulty = DIFFICULTY_ROTATION[diff_idx % len(DIFFICULTY_ROTATION)]
            type_idx  += 1
            diff_idx  += 1

            # Buscar tipo en DB
            type_id = type_map.get(type_name)
            if not type_id:
                for k, v in type_map.items():
                    if type_name in k or k in type_name:
                        type_id = v
                        break
            if not type_id:
                print(f"     [!] Tipo '{type_name}' no en DB — omitiendo")
                continue

            # ── Generar contenido basado en las diapositivas ──────────────────
            activity_content = generate_content(type_name, title, slides)

            # Agregar slides extraídas y URL del PPTX al contenido
            activity_content["slides"]           = slides
            activity_content["presentacion_url"] = public_url

            content_str = json.dumps(activity_content, ensure_ascii=False)

            # ── Crear actividad en la DB ──────────────────────────────────────
            try:
                cur.execute("""
                    INSERT INTO activity
                        (id_subject, id_type_activity, title, description,
                         difficulty_level, content, estimated_minutes, publication_status)
                    VALUES
                        (%s::uuid, %s::uuid, %s, %s,
                         %s, %s::jsonb, 20, 'publicado')
                """, (
                    subject_id, type_id,
                    title, f"Aprende sobre {title}",
                    difficulty, content_str,
                ))
                conn.commit()
                total_created += 1
                print(f"     ✓ [{type_name}/{difficulty}] {title}")
            except Exception as e:
                conn.rollback()
                print(f"     [!] Error creando actividad '{title}': {e}")

    cur.close()
    conn.close()

    print("\n" + "=" * 60)
    print(f"  ✓ Archivos subidos    : {total_uploaded}")
    print(f"  ✓ Actividades creadas : {total_created}")
    print("=" * 60)
    print("\n¡Listo! Ahora el estudiante verá las diapositivas antes de cada actividad.")

if __name__ == "__main__":
    main()
