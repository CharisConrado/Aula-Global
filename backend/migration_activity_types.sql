-- ================================================================
-- Aula Global — Migración: tipos de actividad + limpieza
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- ── 0. Eliminar tipo Audio si existe ─────────────────────────
DELETE FROM type_activity WHERE LOWER(name) = 'audio';

-- ── 1. Limpiar actividades existentes (estructura antigua) ────
-- TRUNCATE + CASCADE elimina también registros en student_activity
TRUNCATE TABLE activity CASCADE;

-- ── 2. Agregar tipos nuevos (Arrastrar y Completar) ───────────
INSERT INTO type_activity (name, description)
SELECT 'Arrastrar', 'El estudiante arrastra cada elemento hacia su categoría o posición correcta'
WHERE NOT EXISTS (SELECT 1 FROM type_activity WHERE LOWER(name) = 'arrastrar');

INSERT INTO type_activity (name, description)
SELECT 'Completar', 'El estudiante completa los espacios en blanco de cada oración'
WHERE NOT EXISTS (SELECT 1 FROM type_activity WHERE LOWER(name) = 'completar');

-- ── 3. Verificación ──────────────────────────────────────────
SELECT name, description FROM type_activity ORDER BY name;
