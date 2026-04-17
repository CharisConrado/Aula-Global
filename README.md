# Aula Global

Plataforma educativa adaptativa para niños con neurodivergencia (TDAH y TEA) que cursan primaria de 1° a 5° grado. Adapta el contenido educativo en tiempo real según el estado emocional del estudiante, detectado mediante reconocimiento facial con MediaPipe (todo en el navegador, sin enviar video al servidor).

---

## Estructura del proyecto

```
aula-global/
├── backend/          # FastAPI + Python
│   ├── main.py
│   ├── database.py
│   ├── models/schemas.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── students.py
│   │   ├── tutors.py
│   │   ├── sessions.py
│   │   ├── activities.py
│   │   ├── monitoring.py   ← WebSocket principal
│   │   ├── crisis.py
│   │   └── interventions.py
│   ├── services/
│   │   ├── auth_service.py
│   │   └── adaptation_engine.py
│   └── requirements.txt
│
└── frontend/         # Next.js 14 + TypeScript
    └── src/
        ├── app/
        │   ├── page.tsx                          ← Raíz (redirección por rol)
        │   ├── (auth)/login/page.tsx
        │   ├── (auth)/register/page.tsx
        │   ├── estudiante/page.tsx               ← Interfaz del niño
        │   ├── estudiante/actividad/[id]/page.tsx
        │   ├── tutor/page.tsx                    ← Dashboard tutor
        │   ├── tutor/estudiante/[id]/page.tsx
        │   └── admin/page.tsx                    ← Panel admin/profesional
        ├── components/
        │   ├── monitoring/EmotionDetector.tsx    ← MediaPipe
        │   └── ui/CalmingScreen.tsx
        ├── lib/
        │   ├── api.ts        ← Cliente HTTP
        │   ├── supabase.ts
        │   └── websocket.ts  ← Cliente WebSocket
        └── store/sessionStore.ts  ← Zustand
```

---

## Cómo levantar el proyecto localmente

### 1. Clonar e instalar dependencias

```bash
git clone <repo>
cd aula-global
```

### 2. Configurar el Backend

```bash
cd backend

# Crear entorno virtual
python -m venv venv

# Activar (Windows)
venv\Scripts\activate

# Activar (Linux/Mac)
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Copiar y configurar variables de entorno
copy .env.example .env
# Editar .env con tus credenciales de Supabase
```

Editar `backend/.env`:
```env
SUPABASE_URL=https://agbvtlmknwdiexzbwdoh.supabase.co
SUPABASE_KEY=tu_anon_key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.agbvtlmknwdiexzbwdoh.supabase.co:5432/postgres
SECRET_KEY=una-clave-secreta-larga-y-segura
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
```

Iniciar el backend:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

El backend estará disponible en:
- API: http://localhost:8000
- Documentación Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 3. Configurar el Frontend

```bash
cd frontend

# Instalar dependencias
npm install

# Copiar y configurar variables de entorno
copy .env.local.example .env.local
# Editar .env.local con tus credenciales
```

Editar `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://agbvtlmknwdiexzbwdoh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Iniciar el frontend:
```bash
npm run dev
```

El frontend estará disponible en http://localhost:3000

---

## Deploy en producción

### Backend en Railway

1. Crear cuenta en [railway.app](https://railway.app)
2. Crear nuevo proyecto → "Deploy from GitHub repo"
3. Seleccionar la carpeta `backend/`
4. En **Variables** agregar todas las de `.env`
5. Railway detecta Python automáticamente con `requirements.txt`
6. El `Procfile` o `railway.toml` es opcional — Railway usa `uvicorn main:app`

Crear `backend/railway.toml`:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
```

### Frontend en Vercel

1. Crear cuenta en [vercel.com](https://vercel.com)
2. Importar el repositorio → seleccionar carpeta `frontend/`
3. En **Environment Variables** agregar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` → URL de Railway (ej: `https://tu-app.railway.app`)
   - `NEXT_PUBLIC_WS_URL` → `wss://tu-app.railway.app`
4. Deploy automático en cada push a `main`

> **Importante**: Actualizar el CORS en `backend/main.py` → agregar la URL de Vercel a `origins`.

---

## Roles del sistema

| Rol | Acceso | Descripción |
|-----|--------|-------------|
| `estudiante` | `/estudiante` | Niño que realiza actividades |
| `tutor` | `/tutor` | Familiar que monitorea al niño |
| `profesional` | `/admin` | Valida diagnósticos, atiende crisis graves |
| `admin` | `/admin` | Gestiona contenido y usuarios |

---

## API Endpoints principales

### Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registrar tutor o profesional |
| POST | `/api/auth/login` | Login con email y contraseña |
| GET  | `/api/auth/me` | Datos del usuario autenticado |

### Estudiantes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET  | `/api/students` | Listar estudiantes |
| POST | `/api/students` | Crear estudiante (solo tutores/admins) |
| GET  | `/api/students/{id}` | Ver estudiante |
| PUT  | `/api/students/{id}` | Actualizar |
| POST | `/api/students/{id}/profile` | Crear perfil de adaptación |
| PUT  | `/api/students/{id}/profile` | Actualizar perfil (guarda historial) |
| POST | `/api/students/{id}/diagnosis` | Registrar diagnóstico |
| POST | `/api/students/{id}/validation` | Validar diagnóstico (solo profesionales) |

### Sesiones
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/sessions` | Crear nueva sesión |
| GET  | `/api/sessions` | Listar sesiones |
| PUT  | `/api/sessions/{id}/close` | Cerrar sesión |
| POST | `/api/sessions/{id}/activities` | Iniciar actividad en sesión |
| PUT  | `/api/sessions/{id}/activities/{rid}` | Actualizar resultado actividad |

### Monitoreo (WebSocket)
| Endpoint | Descripción |
|----------|-------------|
| `WS /api/monitoring/ws/{student_id}?token=...` | Stream del estudiante (MediaPipe → acciones) |
| `WS /api/monitoring/ws/tutor/{student_id}?token=...` | Tutor observa en tiempo real |
| GET `/api/monitoring/history/{session_id}` | Historial de monitoreo |
| GET `/api/monitoring/status/{student_id}` | Estado actual del estudiante |

### Crisis e Intervenciones
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET  | `/api/crisis/active` | Crisis sin resolver |
| PUT  | `/api/crisis/{id}/resolve` | Resolver crisis |
| POST | `/api/interventions` | Crear intervención |
| POST | `/api/interventions/request-external` | Solicitar consulta externa |

---

## Motor de adaptación

El `adaptation_engine.py` aplica estas reglas en tiempo real cada vez que recibe datos del WebSocket:

| Condición | Acción |
|-----------|--------|
| Frustración > 30 seg | `simplificar_contenido` |
| Atención < 30% por > 20 seg | `pausa_visual` (pantalla calmante) |
| Stimming detectado | `cambiar_formato` |
| Estrés + crisis leve | `mostrar_pista` + `adaptar_contenido` |
| Crisis moderada | `alerta_tutor` (notificación WebSocket) |
| Crisis grave | `intervencion_profesional` (alerta inmediata) |

---

## Privacidad y seguridad

- **El video nunca sale del dispositivo**: MediaPipe procesa los frames 100% en el navegador
- Solo se envían al servidor los datos procesados (emoción inferida, nivel de atención, boolean de stimming)
- El consentimiento de uso de cámara se registra en `approved_validation.accepts_camera`
- Contraseñas hasheadas con bcrypt
- Autenticación con JWT (expiración configurable, default 8 horas)
- CORS configurado para permitir solo orígenes autorizados

---

## Base de datos (20 tablas)

| Tabla | Descripción |
|-------|-------------|
| `degree` | Grados (1° a 5° primaria) |
| `type_diagnosis` | Tipos de diagnóstico (TDAH, TEA, etc.) |
| `type_activity` | Tipos de actividad (quiz, arrastrar, etc.) |
| `type_crisis` | Tipos de crisis |
| `action_rto` | Acciones tomadas en tiempo real |
| `professional` | Profesionales internos de Aula Global |
| `tutor` | Tutores/familiares |
| `student` | Estudiantes |
| `initial_diagnosis` | Diagnóstico inicial presentado por el tutor |
| `approved_validation` | Validación del diagnóstico por profesional |
| `responsible_principal` | Asignación tutor-estudiante |
| `profile` | Perfil de adaptación del estudiante |
| `profile_history` | Historial de cambios al perfil |
| `subject` | Materias por grado |
| `activity` | Actividades con contenido JSON |
| `session` | Sesiones de trabajo |
| `student_activity` | Actividades realizadas en cada sesión |
| `monitoring` | Datos de monitoreo por timestamp |
| `crisis` | Crisis registradas |
| `intervention` | Intervenciones realizadas |

---

## Stack tecnológico

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Zustand, MediaPipe
- **Backend**: FastAPI, SQLAlchemy, python-jose, passlib/bcrypt
- **Base de datos**: Supabase (PostgreSQL)
- **Infraestructura**: Vercel (frontend) + Railway (backend) + Supabase (DB)
