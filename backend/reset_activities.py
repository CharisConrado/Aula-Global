"""
reset_activities.py
-------------------
Borra TODAS las actividades de la base de datos para empezar desde cero.
El docente podrá crear cada actividad manualmente desde el panel de admin.

Uso:
    python reset_activities.py
"""

import os, sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌  Faltan SUPABASE_URL o SUPABASE_KEY en .env")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def reset():
    print("⚠️  Eliminando todas las actividades…")

    # Primero borrar registros de estudiantes (foreign key)
    try:
        supabase.table("student_activity").delete().neq("id_student_activity", "00000000-0000-0000-0000-000000000000").execute()
        print("   ✓ student_activity vaciada")
    except Exception as e:
        print(f"   ℹ️  student_activity: {e}")

    # Borrar actividades
    res = supabase.table("activity").delete().neq("id_activity", "00000000-0000-0000-0000-000000000000").execute()
    count = len(res.data) if res.data else "?"
    print(f"   ✓ {count} actividades eliminadas")

    print("\n✅  Base de datos limpia. Ya puedes crear actividades una por una desde el panel de admin.")

if __name__ == "__main__":
    confirm = input("¿Seguro que quieres borrar TODAS las actividades? (s/N): ").strip().lower()
    if confirm == "s":
        reset()
    else:
        print("Operación cancelada.")
