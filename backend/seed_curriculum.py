"""
Aula Global — Seed Currículo Primaria
Sube 120 PPTXs a Supabase Storage y crea las actividades en la DB.

Uso:
    cd backend
    python seed_curriculum.py
"""
import os
import json
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DATABASE_URL         = os.getenv("DATABASE_URL", "")

TEMAS_DIR = Path(r"D:\Users\TRABAJO\Downloads\Curriculo_Primaria_120_Temas_1\temas")
BUCKET    = "presentations"

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

# Rotación de tipos de actividad (9 tipos)
TYPES_ROTATION = [
    "quiz", "ejercicio", "memoria", "asociar", "arrastrar",
    "completar", "dibujo", "lectura", "video",
]

DIFFICULTY_ROTATION = ["facil", "medio", "dificil"]

STOP_WORDS = {"y", "e", "o", "u", "a", "de", "del", "la", "el", "los", "las", "un", "una", "con", "en", "al"}

# ── Helpers ───────────────────────────────────────────────────────────────────

def slug_to_title(slug: str) -> str:
    words = slug.replace("-", " ").split()
    return " ".join(
        w.capitalize() if i == 0 or w not in STOP_WORDS else w
        for i, w in enumerate(words)
    )

def parse_filename(name: str):
    """
    '01_arte_lineas-y-formas.pptx'
    → (subject_key='arte', title='Líneas y formas')
    """
    stem  = Path(name).stem          # '01_arte_lineas-y-formas'
    parts = stem.split("_", 2)       # ['01', 'arte', 'lineas-y-formas']
    if len(parts) < 3:
        return None, stem
    subject_key = parts[1]
    title       = slug_to_title(parts[2])
    return subject_key, title

def placeholder_content(type_name: str, title: str) -> dict:
    """Contenido mínimo por tipo — el admin puede enriquecerlo luego."""
    base = {}
    if type_name == "quiz":
        base = {
            "preguntas": [
                {
                    "texto":      f"¿Qué aprendiste sobre {title}?",
                    "opciones":   ["Opción A", "Opción B", "Opción C", "Opción D"],
                    "correcta":   0,
                }
            ]
        }
    elif type_name == "ejercicio":
        base = {"enunciado": f"Realiza el ejercicio propuesto sobre {title}.", "solucion_url": None}
    elif type_name in ("memoria", "asociar", "arrastrar"):
        base = {"pares": [{"a": "Elemento 1", "b": "Par 1"}, {"a": "Elemento 2", "b": "Par 2"}]}
    elif type_name == "completar":
        base = {"oraciones": [{"texto": "Hoy aprendí sobre ___.", "respuesta": title}]}
    elif type_name == "dibujo":
        base = {"dibujo_url": None}
    elif type_name == "video":
        base = {"video_url": None, "video_tipo": "url"}
    # lectura → sin campos extra
    return base

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    try:
        from supabase import create_client
        import psycopg2
    except ImportError as e:
        print(f"Falta dependencia: {e}. Instala con: pip install supabase psycopg2-binary")
        sys.exit(1)

    print("=" * 55)
    print("  Aula Global — Seed Currículo Primaria")
    print("=" * 55)

    # ── Supabase Storage ──────────────────────────────────────
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

    # ── Base de datos ─────────────────────────────────────────
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor()

    # Grados
    cur.execute("SELECT id_degree, grade_name, level FROM degree ORDER BY level")
    rows = cur.fetchall()
    level_to_degree_id = {r[2]: str(r[0]) for r in rows}
    print(f"\nGrados en DB: {[r[1] for r in rows]}")

    if not level_to_degree_id:
        print("¡No hay grados en la DB! Crea al menos los 5 grados primero.")
        sys.exit(1)

    # Tipos de actividad
    cur.execute("SELECT id_type_activity, LOWER(name) FROM type_activity")
    type_rows = cur.fetchall()
    type_map  = {r[1]: str(r[0]) for r in type_rows}
    print(f"Tipos en DB: {list(type_map.keys())}")

    # ── Procesar cada grado ───────────────────────────────────
    total_uploaded  = 0
    total_created   = 0
    type_idx        = 0
    diff_idx        = 0

    for grade_folder, grade_level in GRADE_FOLDER_TO_LEVEL.items():
        grade_path = TEMAS_DIR / grade_folder
        if not grade_path.exists():
            print(f"\n[!] Carpeta no encontrada: {grade_path}")
            continue

        degree_id = level_to_degree_id.get(grade_level)
        if not degree_id:
            print(f"\n[!] Grado nivel {grade_level} no en DB")
            continue

        print(f"\n── Grado {grade_level} ({'─'*40})")

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

            # ── Subir PPTX a Supabase Storage ─────────────────
            storage_path = f"{grade_folder}/{pptx_file.name}"
            public_url   = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"

            try:
                with open(pptx_file, "rb") as f:
                    file_bytes = f.read()

                supabase.storage.from_(BUCKET).upload(
                    storage_path,
                    file_bytes,
                    {
                        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        "upsert":       "true",
                    }
                )
                total_uploaded += 1
                print(f"  ↑ Subido: {pptx_file.name}")
            except Exception as e:
                msg = str(e).lower()
                if "already exists" in msg or "duplicate" in msg or "409" in msg:
                    print(f"  • Ya en Storage: {pptx_file.name}")
                else:
                    print(f"  [!] Error subiendo {pptx_file.name}: {e}")
                    continue

            # ── Tipo y dificultad en rotación ─────────────────
            type_name  = TYPES_ROTATION[type_idx % len(TYPES_ROTATION)]
            difficulty = DIFFICULTY_ROTATION[diff_idx % len(DIFFICULTY_ROTATION)]
            type_idx  += 1
            diff_idx  += 1

            # Buscar tipo en DB (coincidencia parcial)
            type_id = type_map.get(type_name)
            if not type_id:
                for k, v in type_map.items():
                    if type_name in k or k in type_name:
                        type_id = v
                        break
            if not type_id:
                print(f"  [!] Tipo '{type_name}' no en DB — omitiendo")
                continue

            # ── Contenido ──────────────────────────────────────
            content                   = placeholder_content(type_name, title)
            content["presentacion_url"] = public_url
            content_str               = json.dumps(content, ensure_ascii=False)

            # ── Crear actividad ────────────────────────────────
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
                print(f"  ✓ [{type_name}/{difficulty}] {title}")
            except Exception as e:
                conn.rollback()
                print(f"  [!] Error creando actividad '{title}': {e}")

    cur.close()
    conn.close()

    print("\n" + "=" * 55)
    print(f"  ✓ Archivos subidos : {total_uploaded}")
    print(f"  ✓ Actividades creadas: {total_created}")
    print("=" * 55)

if __name__ == "__main__":
    main()
