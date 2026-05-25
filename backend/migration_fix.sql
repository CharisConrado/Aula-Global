-- ================================================================
-- Aula Global — Migración de corrección
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ================================================================

-- ── 1. Tabla TUTOR ───────────────────────────────────────────
-- Agregar updated_at si no existe
ALTER TABLE tutor
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── 2. Tabla STUDENT ────────────────────────────────────────
-- Agregar columnas de login por código
ALTER TABLE student
  ADD COLUMN IF NOT EXISTS identity_document VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS access_code       VARCHAR(20)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ  DEFAULT NOW();

-- Índice único en identity_document (solo si tiene valor)
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_identity_doc
  ON student (identity_document)
  WHERE identity_document IS NOT NULL;

-- ── 3. Tabla PROFESSIONAL ───────────────────────────────────
ALTER TABLE professional
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- FIX CRÍTICO: Eliminar unique constraint en license_number
-- El constraint actual bloquea registros sin número de licencia (vacío = duplicado).
-- Lo reemplazamos por un índice parcial que solo aplica cuando hay valor real.
ALTER TABLE professional
  DROP CONSTRAINT IF EXISTS professional_license_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_license_number
  ON professional (license_number)
  WHERE license_number IS NOT NULL AND license_number <> '';

-- También limpiar registros previos huérfanos con license_number vacío
-- (si ya intentaste registrarte y quedó un registro roto)
-- OPCIONAL: descomenta si tienes registros con license_number = '' que bloquean
-- DELETE FROM professional WHERE license_number = '' AND full_name = 'tu nombre aquí';

-- ── 4. Tabla PROFILE ────────────────────────────────────────
-- Verificar que todas las columnas del perfil existan
ALTER TABLE profile
  ADD COLUMN IF NOT EXISTS volume_level    SMALLINT     DEFAULT 5
                           CHECK (volume_level BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS visual_contrast VARCHAR(20)  DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS feedback_type   VARCHAR(20)  DEFAULT 'visual',
  ADD COLUMN IF NOT EXISTS font_size       VARCHAR(20)  DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS animation_speed VARCHAR(20)  DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS max_session_min SMALLINT     DEFAULT 30,
  ADD COLUMN IF NOT EXISTS needs_breaks    BOOLEAN      DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS break_interval  SMALLINT     DEFAULT 10,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ  DEFAULT NOW();

-- ── 5. RLS: permitir inserción desde el backend (service role) ─
-- Si usas RLS en Supabase, estas policies son necesarias.
-- Ejecuta solo si tienes RLS activado en las tablas.

-- ALTER TABLE tutor       ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE student     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE professional ENABLE ROW LEVEL SECURITY;

-- Policy permisiva para el service role (ya tiene acceso total por defecto)
-- Solo necesaria si bloqueaste el service role manualmente.

-- ── 6. Verificación ─────────────────────────────────────────
-- Ejecuta esto para confirmar que las columnas existen:
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('tutor','student','professional','profile')
  AND column_name IN (
    'updated_at','identity_document','access_code',
    'volume_level','visual_contrast','feedback_type',
    'font_size','animation_speed','max_session_min',
    'needs_breaks','break_interval'
  )
ORDER BY table_name, column_name;
