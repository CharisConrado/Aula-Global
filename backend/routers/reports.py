"""
Aula Global — Router de reportes administrativos
Agrega métricas de uso y comportamiento de la plataforma para el panel admin.

Todos los endpoints aceptan parámetros opcionales de rango de fechas:
  - start_date (YYYY-MM-DD)
  - end_date   (YYYY-MM-DD)

Si no se entregan, se usa el `default_days` (típicamente 30 días).
Todas las rutas son admin-only.
"""

from typing import Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from database import get_db
from models.schemas import TokenData, RolUsuario
from services.auth_service import require_role

router = APIRouter()


# ════════════════════════════════════════════════════════════════
# HELPERS
# ════════════════════════════════════════════════════════════════
def _parse_range(start_date: Optional[str], end_date: Optional[str],
                 default_days: int) -> tuple[datetime, datetime]:
    """Devuelve un par (start, end) datetime UTC ya validado."""
    try:
        if start_date and end_date:
            s = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            e = datetime.strptime(end_date,   "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)
            if e <= s:
                raise ValueError("end_date debe ser >= start_date")
            return s, e
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=f"Fechas inválidas: {ve}")

    now = datetime.now(timezone.utc)
    return now - timedelta(days=default_days), now


def _range_clause(col: str) -> str:
    """Cláusula SQL parametrizada para filtrar por rango sobre `col`."""
    return f"{col} >= :start_ts AND {col} < :end_ts"


def _range_params(start: datetime, end: datetime) -> dict:
    return {"start_ts": start, "end_ts": end}


def _days_between(start: datetime, end: datetime) -> int:
    return max(int((end - start).total_seconds() / 86400), 1)


# ════════════════════════════════════════════════════════════════
# 1) OVERVIEW — KPIs globales
# ════════════════════════════════════════════════════════════════
@router.get("/overview")
async def overview(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    """KPIs globales. Las métricas con * respetan el rango de fechas."""
    start, end = _parse_range(start_date, end_date, default_days=30)
    rp = _range_params(start, end)
    days = _days_between(start, end)

    def scalar(sql: str, params: dict | None = None) -> int:
        try:
            r = db.execute(text(sql), params or {}).fetchone()
            return int(r[0]) if r and r[0] is not None else 0
        except Exception:
            return 0

    # Totales históricos (NO dependen del rango)
    total_students      = scalar("SELECT COUNT(*) FROM student      WHERE account_status = 'activo'")
    total_tutors        = scalar("SELECT COUNT(*) FROM tutor        WHERE is_active = true")
    total_professionals = scalar("SELECT COUNT(*) FROM professional WHERE is_active = true")
    total_admins        = scalar("SELECT COUNT(*) FROM admin_user   WHERE is_active = true")
    total_activities    = scalar("SELECT COUNT(*) FROM activity     WHERE publication_status = 'publicado'")

    # Métricas dentro del rango *
    sessions_in_range = scalar(
        f"SELECT COUNT(*) FROM session WHERE {_range_clause('start_time')}", rp,
    )
    active_students_in_range = scalar(
        f"""SELECT COUNT(DISTINCT id_student) FROM session
            WHERE {_range_clause('start_time')}""", rp,
    )
    completed_in_range = scalar(
        f"""SELECT COUNT(*) FROM session
            WHERE status = 'completada' AND {_range_clause('start_time')}""", rp,
    )
    crisis_in_range = scalar(
        f"SELECT COUNT(*) FROM crisis WHERE {_range_clause('created_at')}", rp,
    )
    unresolved_in_range = scalar(
        f"""SELECT COUNT(*) FROM crisis
            WHERE resolved_at IS NULL AND {_range_clause('created_at')}""", rp,
    )
    monitoring_in_range = scalar(
        f"SELECT COUNT(*) FROM monitoring WHERE {_range_clause('detected_at')}", rp,
    )

    # Promedio de atención en rango
    avg_att = db.execute(text(f"""
        SELECT AVG(attention_level)::float
        FROM monitoring
        WHERE attention_level IS NOT NULL AND {_range_clause('detected_at')}
    """), rp).fetchone()
    avg_attention = round(float(avg_att[0]), 3) if avg_att and avg_att[0] is not None else 0.0

    # Duración promedio de sesión en rango (minutos)
    avg_dur = db.execute(text(f"""
        SELECT AVG(duration_sec)::float
        FROM session
        WHERE duration_sec IS NOT NULL AND duration_sec > 0
          AND {_range_clause('start_time')}
    """), rp).fetchone()
    avg_session_min = round(float(avg_dur[0]) / 60, 1) if avg_dur and avg_dur[0] is not None else 0.0

    return {
        "range": {
            "start": start.date().isoformat(),
            "end":   (end - timedelta(days=1)).date().isoformat(),  # inclusivo
            "days":  days,
        },
        "users": {
            "students":      total_students,
            "tutors":        total_tutors,
            "professionals": total_professionals,
            "admins":        total_admins,
            "total":         total_students + total_tutors + total_professionals + total_admins,
        },
        "content": {
            "activities":         total_activities,
            "monitoring_records": monitoring_in_range,
        },
        "sessions": {
            "total":               sessions_in_range,
            "completed":           completed_in_range,
            "last_7_days":         sessions_in_range,         # alias para compatibilidad
            "active_students_7d":  active_students_in_range,  # alias
            "avg_minutes":         avg_session_min,
        },
        "crisis": {
            "total":      crisis_in_range,
            "unresolved": unresolved_in_range,
        },
        "wellbeing": {
            "avg_attention_30d": avg_attention,  # ahora respeta el rango pero conservo nombre
        },
    }


# ════════════════════════════════════════════════════════════════
# 2) SESIONES POR DÍA
# ════════════════════════════════════════════════════════════════
@router.get("/sessions-over-time")
async def sessions_over_time(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    days:       int = 14,   # fallback legacy
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    start, end = _parse_range(start_date, end_date, default_days=days)
    rows = db.execute(text(f"""
        SELECT DATE(start_time) AS d, COUNT(*) AS c
        FROM session
        WHERE {_range_clause('start_time')}
        GROUP BY DATE(start_time)
        ORDER BY d ASC
    """), _range_params(start, end)).fetchall()
    return [{"date": r[0].isoformat(), "count": int(r[1])} for r in rows]


# ════════════════════════════════════════════════════════════════
# 3) DISTRIBUCIÓN DE EMOCIONES
# ════════════════════════════════════════════════════════════════
@router.get("/emotions-distribution")
async def emotions_distribution(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    days:       int = 30,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    start, end = _parse_range(start_date, end_date, default_days=days)
    rows = db.execute(text(f"""
        SELECT emotion, COUNT(*) AS c
        FROM monitoring
        WHERE {_range_clause('detected_at')}
        GROUP BY emotion
        ORDER BY c DESC
    """), _range_params(start, end)).fetchall()
    return [{"emotion": r[0], "count": int(r[1])} for r in rows]


# ════════════════════════════════════════════════════════════════
# 4) TENDENCIA DE ATENCIÓN
# ════════════════════════════════════════════════════════════════
@router.get("/attention-trend")
async def attention_trend(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    days:       int = 14,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    start, end = _parse_range(start_date, end_date, default_days=days)
    rows = db.execute(text(f"""
        SELECT DATE(detected_at) AS d, AVG(attention_level)::float AS avg_att
        FROM monitoring
        WHERE attention_level IS NOT NULL AND {_range_clause('detected_at')}
        GROUP BY DATE(detected_at)
        ORDER BY d ASC
    """), _range_params(start, end)).fetchall()
    return [{"date": r[0].isoformat(), "avg": round(float(r[1]), 3)} for r in rows]


# ════════════════════════════════════════════════════════════════
# 5) RESUMEN DE CRISIS
# ════════════════════════════════════════════════════════════════
@router.get("/crisis-summary")
async def crisis_summary(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    days:       int = 90,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    start, end = _parse_range(start_date, end_date, default_days=days)
    rp = _range_params(start, end)

    sev_rows = db.execute(text(f"""
        SELECT tc.severity_level, COUNT(*) AS c
        FROM crisis c
        JOIN type_crisis tc ON tc.id_type_crisis = c.id_type_crisis
        WHERE {_range_clause('c.created_at')}
        GROUP BY tc.severity_level
        ORDER BY tc.severity_level ASC
    """), rp).fetchall()
    sev_map = {1: "leve", 2: "moderada", 3: "grave"}
    by_severity = {sev_map.get(int(r[0]), str(r[0])): int(r[1]) for r in sev_rows}

    status_row = db.execute(text(f"""
        SELECT
          COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved,
          COUNT(*) FILTER (WHERE resolved_at IS NULL)     AS unresolved
        FROM crisis
        WHERE {_range_clause('created_at')}
    """), rp).fetchone()
    by_status = {
        "resolved":   int(status_row[0]) if status_row else 0,
        "unresolved": int(status_row[1]) if status_row else 0,
    }

    res_row = db.execute(text(f"""
        SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - detection_timestamp)))::float
        FROM crisis
        WHERE resolved_at IS NOT NULL AND detection_timestamp IS NOT NULL
          AND {_range_clause('created_at')}
    """), rp).fetchone()
    avg_resolution_min = round(float(res_row[0]) / 60, 1) if res_row and res_row[0] is not None else 0.0

    return {
        "by_severity":            by_severity,
        "by_status":              by_status,
        "avg_resolution_minutes": avg_resolution_min,
        "period_days":            _days_between(start, end),
        "range": {
            "start": start.date().isoformat(),
            "end":   (end - timedelta(days=1)).date().isoformat(),
        },
    }


# ════════════════════════════════════════════════════════════════
# 6) TOP ACTIVIDADES
# ════════════════════════════════════════════════════════════════
@router.get("/top-activities")
async def top_activities(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    limit:      int = 10,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    start, end = _parse_range(start_date, end_date, default_days=365)
    params = _range_params(start, end)
    params["limit"] = int(limit)

    rows = db.execute(text(f"""
        SELECT
          a.id_activity,
          a.title,
          s.subject_name,
          COUNT(sa.id_student_activity) AS total_runs,
          AVG(sa.score)::float           AS avg_score,
          (COUNT(*) FILTER (WHERE sa.is_completed = true))::float / NULLIF(COUNT(*), 0) AS completion_rate
        FROM activity a
        LEFT JOIN student_activity sa ON sa.id_activity = a.id_activity
                                       AND {_range_clause('sa.completion_date')}
        LEFT JOIN subject s           ON s.id_subject  = a.id_subject
        WHERE a.publication_status = 'publicado'
        GROUP BY a.id_activity, a.title, s.subject_name
        HAVING COUNT(sa.id_student_activity) > 0
        ORDER BY total_runs DESC
        LIMIT :limit
    """), params).fetchall()

    return [
        {
            "id_activity":     str(r[0]),
            "title":           r[1],
            "subject":         r[2] or "—",
            "total_runs":      int(r[3] or 0),
            "avg_score":       round(float(r[4]), 2) if r[4] is not None else None,
            "completion_rate": round(float(r[5]), 3) if r[5] is not None else 0.0,
        }
        for r in rows
    ]


# ════════════════════════════════════════════════════════════════
# 7) ESTUDIANTES POR GRADO  (no usa rango)
# ════════════════════════════════════════════════════════════════
@router.get("/students-by-grade")
async def students_by_grade(
    db: Session = Depends(get_db),
    cu: TokenData = Depends(require_role(RolUsuario.admin)),
):
    rows = db.execute(text("""
        SELECT d.grade_name, d.level, COUNT(s.id_student) AS c
        FROM degree d
        LEFT JOIN student s ON s.id_degree = d.id_degree AND s.account_status = 'activo'
        GROUP BY d.grade_name, d.level
        ORDER BY d.level ASC
    """)).fetchall()
    return [{"grade_name": r[0], "level": int(r[1]), "count": int(r[2])} for r in rows]


# ════════════════════════════════════════════════════════════════
# 8) USO POR MATERIA
# ════════════════════════════════════════════════════════════════
@router.get("/usage-by-subject")
async def usage_by_subject(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    days:       int = 30,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    start, end = _parse_range(start_date, end_date, default_days=days)
    rows = db.execute(text(f"""
        SELECT
          s.subject_name,
          COUNT(sa.id_student_activity)                          AS runs,
          COUNT(*) FILTER (WHERE sa.is_completed = true)         AS completed,
          AVG(sa.score)::float                                   AS avg_score
        FROM subject s
        LEFT JOIN activity a          ON a.id_subject = s.id_subject
        LEFT JOIN student_activity sa ON sa.id_activity = a.id_activity
                                       AND {_range_clause('sa.completion_date')}
        WHERE s.is_active = true
        GROUP BY s.subject_name
        ORDER BY runs DESC
    """), _range_params(start, end)).fetchall()

    return [
        {
            "subject":   r[0],
            "runs":      int(r[1] or 0),
            "completed": int(r[2] or 0),
            "avg_score": round(float(r[3]), 2) if r[3] is not None else None,
        }
        for r in rows
    ]


# ════════════════════════════════════════════════════════════════
# 9) STIMMING DETECTADO
# ════════════════════════════════════════════════════════════════
@router.get("/stimming-rate")
async def stimming_rate(
    start_date: Optional[str] = None,
    end_date:   Optional[str] = None,
    days:       int = 30,
    db:         Session = Depends(get_db),
    cu:         TokenData = Depends(require_role(RolUsuario.admin)),
):
    start, end = _parse_range(start_date, end_date, default_days=days)
    row = db.execute(text(f"""
        SELECT
          COUNT(*) FILTER (WHERE stimming = true) AS with_stim,
          COUNT(*)                                AS total
        FROM monitoring
        WHERE {_range_clause('detected_at')}
    """), _range_params(start, end)).fetchone()
    total     = int(row[1]) if row and row[1] else 0
    with_stim = int(row[0]) if row and row[0] else 0
    rate      = round(with_stim / total, 3) if total > 0 else 0.0
    return {
        "with_stimming": with_stim,
        "total_samples": total,
        "rate":          rate,
    }
