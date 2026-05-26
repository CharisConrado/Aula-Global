"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/store/sessionStore";
import {
  api,
  type StudentResponse,
  type TutorResponse,
  type ProfessionalResponse,
} from "@/lib/api";
import {
  Users,
  BookOpen,
  UserCog,
  LogOut,
  Plus,
  Loader2,
  Check,
  X,
  Heart,
  Stethoscope,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Lock,
  BarChart3,
  Search,
  Menu,
} from "lucide-react";
import Image from "next/image";
import ReportsPanel from "@/components/admin/ReportsPanel";
import ActivityCreatorForm from "@/components/admin/ActivityCreatorForm";

/* ── Tipos locales ─────────────────────────────────────────────── */
type NavTab = "reportes" | "actividades" | "tutores" | "profesionales" | "estudiantes" | "admins";

interface SubjectLocal {
  id_subject: string;
  id_degree: string;
  subject_name: string;
}

interface DegreeLocal {
  id_degree: string;
  grade_name: string;
  level: number;
}

interface ActivityTypeLocal {
  id_type_activity: string;
  name: string;
  description: string;
}

interface NewAdminState {
  full_name: string;
  email: string;
}

interface NewTutorState {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  relationship_type: string;
}

interface NewProfessionalState {
  full_name: string;
  email: string;
  password: string;
  speciality: string;
  license_number: string;
  phone: string;
}

interface NewStudentState {
  tutor_id: string;
  full_name: string;
  birth_date: string;
  id_degree: string;
  identity_document: string;
}

/* ── Helpers ───────────────────────────────────────────────────── */
function buildDisplayId(
  name: string,
  doc: string | null | undefined,
  createdAt: string | null | undefined
): string {
  const namePart = name.replace(/\s+/g, "").substring(0, 4).toUpperCase();
  const docPart = doc ? doc : "----";
  const yearPart = createdAt
    ? new Date(createdAt).getFullYear().toString().slice(-2)
    : new Date().getFullYear().toString().slice(-2);
  return `${namePart}-${docPart}-${yearPart}`;
}

function SidebarLogo() {
  return (
    <Image
      src="/logo.png"
      alt="Aula Global"
      width={44}
      height={44}
      style={{ objectFit: "contain" }}
      priority
    />
  );
}

/* ── Inputs reutilizables ──────────────────────────────────────── */
function StyledInput({
  label,
  required,
  icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" style={{ color: "#34495E" }}>
        {label}
        {required && <span style={{ color: "#FFB37B" }}> *</span>}
      </label>
      <div style={{ position: "relative" }}>
        {icon && (
          <span style={{
            position: "absolute", left: "0.75rem", top: "50%",
            transform: "translateY(-50%)", color: "#a0aec0", pointerEvents: "none",
          }}>
            {icon}
          </span>
        )}
        <input
          {...props}
          style={{
            border: "1.5px solid #D5DBDB",
            borderRadius: "0.75rem",
            padding: icon ? "0.75rem 1rem 0.75rem 2.5rem" : "0.75rem 1rem",
            fontSize: "0.875rem",
            outline: "none",
            color: "#34495E",
            background: "white",
            width: "100%",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#7FB3D5"; props.onFocus?.(e); }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = "#D5DBDB"; props.onBlur?.(e); }}
        />
      </div>
    </div>
  );
}

function StyledTextarea({
  label,
  required,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" style={{ color: "#34495E" }}>
        {label}
        {required && <span style={{ color: "#FFB37B" }}> *</span>}
      </label>
      <textarea
        {...props}
        style={{
          border: "1.5px solid #D5DBDB",
          borderRadius: "0.75rem",
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          outline: "none",
          color: "#34495E",
          background: "white",
          width: "100%",
          resize: "vertical",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "#7FB3D5"; props.onFocus?.(e); }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = "#D5DBDB"; props.onBlur?.(e); }}
      />
    </div>
  );
}

function StyledSelect({
  label,
  required,
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  required?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold" style={{ color: "#34495E" }}>
        {label}
        {required && <span style={{ color: "#FFB37B" }}> *</span>}
      </label>
      <select
        {...props}
        style={{
          border: "1.5px solid #D5DBDB",
          borderRadius: "0.75rem",
          padding: "0.75rem 1rem",
          fontSize: "0.875rem",
          outline: "none",
          color: "#34495E",
          background: "white",
          width: "100%",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Modal genérico ────────────────────────────────────────────── */
function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(52, 73, 94, 0.45)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "1.25rem",
          width: "100%",
          maxWidth,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1.5px solid #D5DBDB",
            position: "sticky", top: 0, background: "white", zIndex: 1,
          }}
        >
          <h3 className="text-base font-extrabold" style={{ color: "#34495E" }}>{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg"
            style={{ color: "#a0aec0" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div style={{ padding: "1.5rem" }}>{children}</div>
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
export default function AdminPage() {
  const router = useRouter();
  const { token, user, logout } = useSessionStore();

  /* ── Nav state ── */
  const [tab, setTab]               = useState<NavTab>("reportes");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ── Datos comunes ── */
  const [subjects, setSubjects] = useState<SubjectLocal[]>([]);
  const [degrees, setDegrees] = useState<DegreeLocal[]>([]);

  /* ── Tab: actividades ── */
  const [activityTypes, setActivityTypes] = useState<ActivityTypeLocal[]>([]);
  const [activities, setActivities] = useState<
    { id_activity: string; title: string; difficulty_level: string; id_subject: string; activity_type?: string }[]
  >([]);

  /* ── Tab: tutores ── */
  const [tutors, setTutors] = useState<TutorResponse[]>([]);
  const [tutorsLoading, setTutorsLoading] = useState(false);
  const [tutorsLoaded, setTutorsLoaded] = useState(false);
  const [showTutorModal, setShowTutorModal] = useState(false);
  const [editingTutor, setEditingTutor] = useState<TutorResponse | null>(null);
  const [newTutor, setNewTutor] = useState<NewTutorState>({
    full_name: "", email: "", password: "", phone: "", relationship_type: "familiar",
  });
  const [tutorBanner, setTutorBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [tutorSubmitting, setTutorSubmitting] = useState(false);

  /* ── Tab: profesionales ── */
  const [professionals, setProfessionals] = useState<ProfessionalResponse[]>([]);
  const [profsLoading, setProfsLoading] = useState(false);
  const [profsLoaded, setProfsLoaded] = useState(false);
  const [showProfModal, setShowProfModal] = useState(false);
  const [editingProf, setEditingProf] = useState<ProfessionalResponse | null>(null);
  const [newProf, setNewProf] = useState<NewProfessionalState>({
    full_name: "", email: "", password: "", speciality: "", license_number: "", phone: "",
  });
  const [profBanner, setProfBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [profSubmitting, setProfSubmitting] = useState(false);

  /* ── Tab: estudiantes ── */
  const [students, setStudents] = useState<StudentResponse[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [selectedDegree, setSelectedDegree] = useState<string>("todos");
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentResponse | null>(null);
  const [newStudent, setNewStudent] = useState<NewStudentState>({
    tutor_id: "", full_name: "", birth_date: "", id_degree: "", identity_document: "",
  });
  const [studentBanner, setStudentBanner] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [studentSubmitting, setStudentSubmitting] = useState(false);
  const [createdAccessCode, setCreatedAccessCode] = useState<string | null>(null);

  /* ── Búsqueda ── */
  const [searchQuery, setSearchQuery] = useState("");

  /* ── Filtros de actividades ── */
  const [selectedActivityDegree, setSelectedActivityDegree] = useState<string>("todos");
  const [selectedActivitySubject, setSelectedActivitySubject] = useState<string>("todos");

  /* ── Tab: admins ── */
  const [newAdmin, setNewAdmin] = useState<NewAdminState>({ full_name: "", email: "" });
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSuccess, setAdminSuccess] = useState("");
  const [adminError, setAdminError] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  /* ── Carga inicial ── */
  const loadInitial = useCallback(async () => {
    if (!token) return;
    try {
      const [degs, subs, acts, types] = await Promise.all([
        api.getDegrees(),
        api.getSubjects({}),
        api.getActivities(token),
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/activities/types`).then(r => r.json()),
      ]);
      setDegrees(degs as DegreeLocal[]);
      setSubjects(subs as SubjectLocal[]);
      setActivities(acts as { id_activity: string; title: string; difficulty_level: string; id_subject: string; activity_type?: string }[]);
      const types_arr = Array.isArray(types) ? (types as ActivityTypeLocal[]) : [];
      setActivityTypes(types_arr);
    } catch (err) {
      console.error("Error cargando datos admin:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user || user.rol !== "admin") {
      router.replace("/login");
      return;
    }
    loadInitial();
  }, [token, user, router, loadInitial]);

  /* ── Cargas lazy por tab ── */
  useEffect(() => {
    if (!token) return;
    if (tab === "estudiantes" && !studentsLoaded) {
      setStudentsLoading(true);
      api.getStudents(token)
        .then((d) => { setStudents(d); setStudentsLoaded(true); })
        .catch((e) => console.error("Error cargando estudiantes:", e))
        .finally(() => setStudentsLoading(false));
    }
    if (tab === "tutores" && !tutorsLoaded) {
      setTutorsLoading(true);
      api.getTutors(token)
        .then((d) => { setTutors(d); setTutorsLoaded(true); })
        .catch((e) => console.error("Error cargando tutores:", e))
        .finally(() => setTutorsLoading(false));
    }
    if (tab === "profesionales" && !profsLoaded) {
      setProfsLoading(true);
      api.getProfessionals(token)
        .then((d) => { setProfessionals(d); setProfsLoaded(true); })
        .catch((e) => console.error("Error cargando profesionales:", e))
        .finally(() => setProfsLoading(false));
    }
    // Pre-cargar tutores cuando se abre estudiantes (para asignar)
    if (tab === "estudiantes" && !tutorsLoaded) {
      api.getTutors(token).then((d) => { setTutors(d); setTutorsLoaded(true); }).catch(() => {});
    }
  }, [tab, token, studentsLoaded, tutorsLoaded, profsLoaded]);

  /* ════════════════════════════════════════════════════════════════ */
  /* CRUD: Tutor                                                      */
  /* ════════════════════════════════════════════════════════════════ */
  const openCreateTutor = () => {
    setEditingTutor(null);
    setNewTutor({ full_name: "", email: "", password: "", phone: "", relationship_type: "familiar" });
    setTutorBanner(null);
    setShowTutorModal(true);
  };

  const openEditTutor = (t: TutorResponse) => {
    setEditingTutor(t);
    setNewTutor({
      full_name: t.full_name, email: t.email, password: "",
      phone: t.phone || "", relationship_type: t.relationship_type,
    });
    setTutorBanner(null);
    setShowTutorModal(true);
  };

  const handleTutorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setTutorSubmitting(true); setTutorBanner(null);
    try {
      if (editingTutor) {
        const updated = await api.updateTutor(token, editingTutor.id_tutor, {
          full_name: newTutor.full_name,
          phone: newTutor.phone || undefined,
          relationship_type: newTutor.relationship_type,
        });
        setTutors((prev) => prev.map((t) => t.id_tutor === updated.id_tutor ? updated : t));
        setTutorBanner({ type: "ok", msg: "Tutor actualizado correctamente" });
      } else {
        const created = await api.adminCreateTutor(token, {
          full_name: newTutor.full_name,
          email: newTutor.email,
          password: newTutor.password,
          phone: newTutor.phone || undefined,
          relationship_type: newTutor.relationship_type,
        });
        setTutors((prev) => [created, ...prev]);
        setTutorBanner({ type: "ok", msg: "Tutor creado correctamente" });
      }
      setTimeout(() => setShowTutorModal(false), 800);
    } catch (err) {
      setTutorBanner({ type: "err", msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setTutorSubmitting(false);
    }
  };

  const handleDeleteTutor = async (t: TutorResponse) => {
    if (!token) return;
    if (!confirm(`¿Eliminar al tutor "${t.full_name}"? Esta acción desactiva su cuenta.`)) return;
    try {
      await api.deleteTutor(token, t.id_tutor);
      setTutors((prev) => prev.filter((x) => x.id_tutor !== t.id_tutor));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  /* ════════════════════════════════════════════════════════════════ */
  /* CRUD: Profesional                                                */
  /* ════════════════════════════════════════════════════════════════ */
  const openCreateProf = () => {
    setEditingProf(null);
    setNewProf({ full_name: "", email: "", password: "", speciality: "", license_number: "", phone: "" });
    setProfBanner(null);
    setShowProfModal(true);
  };

  const openEditProf = (p: ProfessionalResponse) => {
    setEditingProf(p);
    setNewProf({
      full_name: p.full_name, email: p.email, password: "",
      speciality: p.speciality, license_number: p.license_number,
      phone: p.phone || "",
    });
    setProfBanner(null);
    setShowProfModal(true);
  };

  const handleProfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setProfSubmitting(true); setProfBanner(null);
    try {
      if (editingProf) {
        const updated = await api.updateProfessional(token, editingProf.id_professional, {
          full_name: newProf.full_name,
          speciality: newProf.speciality || undefined,
          license_number: newProf.license_number || undefined,
          phone: newProf.phone || undefined,
        });
        setProfessionals((prev) => prev.map((p) => p.id_professional === updated.id_professional ? updated : p));
        setProfBanner({ type: "ok", msg: "Profesional actualizado" });
      } else {
        const created = await api.adminCreateProfessional(token, {
          full_name: newProf.full_name,
          email: newProf.email,
          password: newProf.password,
          speciality: newProf.speciality || undefined,
          license_number: newProf.license_number || undefined,
          phone: newProf.phone || undefined,
        });
        setProfessionals((prev) => [created, ...prev]);
        setProfBanner({ type: "ok", msg: "Profesional creado correctamente" });
      }
      setTimeout(() => setShowProfModal(false), 800);
    } catch (err) {
      setProfBanner({ type: "err", msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setProfSubmitting(false);
    }
  };

  const handleDeleteProf = async (p: ProfessionalResponse) => {
    if (!token) return;
    if (!confirm(`¿Eliminar al profesional "${p.full_name}"?`)) return;
    try {
      await api.deleteProfessional(token, p.id_professional);
      setProfessionals((prev) => prev.filter((x) => x.id_professional !== p.id_professional));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  /* ════════════════════════════════════════════════════════════════ */
  /* CRUD: Estudiante                                                 */
  /* ════════════════════════════════════════════════════════════════ */
  const openCreateStudent = () => {
    setEditingStudent(null);
    setNewStudent({ tutor_id: "", full_name: "", birth_date: "", id_degree: "", identity_document: "" });
    setStudentBanner(null);
    setCreatedAccessCode(null);
    setShowStudentModal(true);
  };

  const openEditStudent = (s: StudentResponse) => {
    setEditingStudent(s);
    setNewStudent({
      tutor_id: "", full_name: s.full_name, birth_date: s.birth_date,
      id_degree: s.id_degree, identity_document: s.identity_document || "",
    });
    setStudentBanner(null); setCreatedAccessCode(null);
    setShowStudentModal(true);
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setStudentSubmitting(true); setStudentBanner(null);
    try {
      if (editingStudent) {
        const updated = await api.updateStudent(token, editingStudent.id_student, {
          full_name: newStudent.full_name,
          birth_date: newStudent.birth_date,
          id_degree: newStudent.id_degree,
          identity_document: newStudent.identity_document,
        });
        setStudents((prev) => prev.map((x) => x.id_student === updated.id_student ? updated : x));
        setStudentBanner({ type: "ok", msg: "Estudiante actualizado" });
        setTimeout(() => setShowStudentModal(false), 800);
      } else {
        if (!newStudent.tutor_id) throw new Error("Selecciona el tutor responsable");
        const created = await api.adminCreateStudent(token, newStudent.tutor_id, {
          full_name: newStudent.full_name,
          birth_date: newStudent.birth_date,
          id_degree: newStudent.id_degree,
          identity_document: newStudent.identity_document,
        });
        setStudents((prev) => [created, ...prev]);
        setCreatedAccessCode(created.access_code || null);
        setStudentBanner({ type: "ok", msg: "Estudiante creado y asignado al tutor" });
      }
    } catch (err) {
      setStudentBanner({ type: "err", msg: err instanceof Error ? err.message : "Error" });
    } finally {
      setStudentSubmitting(false);
    }
  };

  const handleDeleteStudent = async (s: StudentResponse) => {
    if (!token) return;
    if (!confirm(`¿Suspender al estudiante "${s.full_name}"?`)) return;
    try {
      await api.deleteStudent(token, s.id_student);
      setStudents((prev) => prev.map((x) =>
        x.id_student === s.id_student ? { ...x, account_status: "suspendido" } : x
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  /* ════════════════════════════════════════════════════════════════ */
  /* CRUD: Admin                                                      */
  /* ════════════════════════════════════════════════════════════════ */
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setAdminLoading(true);
    setAdminError(""); setAdminSuccess(""); setGeneratedCode(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/auth/register/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: newAdmin.full_name,
          email: newAdmin.email,
          master_key: "aulaglobal-admin-2026",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const code: string = data.access_code || "";
        setGeneratedCode(code || null);
        setAdminSuccess(`Administrador "${newAdmin.full_name}" creado correctamente.`);
        setNewAdmin({ full_name: "", email: "" });
      } else {
        const err = await res.json().catch(() => ({ detail: "Error desconocido" }));
        setAdminError(err.detail || `Error ${res.status}`);
      }
    } catch {
      setAdminError("Error de conexión con el servidor");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleLogout = () => { logout(); router.replace("/login"); };

  /* ── Loading global ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FDF8F2" }}>
        <motion.div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="w-14 h-14 rounded-full border-4 mx-auto"
            style={{ borderColor: "#D5DBDB", borderTopColor: "#7FB3D5" }}
          />
          <p className="font-bold text-base" style={{ color: "#7FB3D5" }}>Cargando panel…</p>
        </motion.div>
      </div>
    );
  }

  const navItems: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: "reportes",      label: "Reportes",        icon: <BarChart3 className="w-5 h-5" /> },
    { id: "actividades",   label: "Actividades",     icon: <BookOpen className="w-5 h-5" /> },
    { id: "tutores",       label: "Tutores",         icon: <Heart className="w-5 h-5" /> },
    { id: "profesionales", label: "Profesionales",   icon: <Stethoscope className="w-5 h-5" /> },
    { id: "estudiantes",   label: "Estudiantes",     icon: <Users className="w-5 h-5" /> },
    { id: "admins",        label: "Administradores", icon: <UserCog className="w-5 h-5" /> },
  ];

  const difficultyBadge = (d: string) => {
    if (d === "facil")   return { bg: "#dcfce7", color: "#16a34a", label: "Fácil" };
    if (d === "dificil") return { bg: "#fee2e2", color: "#dc2626", label: "Difícil" };
    return { bg: "#fef9c3", color: "#ca8a04", label: "Medio" };
  };

  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#FDF8F2" }}>

      {/* Overlay móvil */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside
        className={`fixed top-0 left-0 h-full flex flex-col z-30 transition-transform duration-300
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ width: 256, background: "white", borderRight: "1.5px solid #D5DBDB", boxShadow: "4px 0 24px rgba(127,179,213,0.10)" }}
      >
        <div className="flex items-center gap-3 px-5 py-6" style={{ borderBottom: "1.5px solid #D5DBDB" }}>
          <SidebarLogo />
          <div>
            <p className="text-base font-extrabold leading-tight" style={{ color: "#4587a9" }}>Aula Global</p>
            <p className="text-xs font-medium" style={{ color: "#a0aec0" }}>Panel Administrativo</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setTab(item.id); setSearchQuery(""); setSelectedActivityDegree("todos"); setSelectedActivitySubject("todos"); setSidebarOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200"
                style={active ? { background: "#E1EFFF", color: "#4587a9" } : { color: "#7f8c8d" }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f8f9fa"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ color: active ? "#7FB3D5" : "#a0aec0" }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4" style={{ borderTop: "1.5px solid #D5DBDB" }}>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #FFB37B, #ff9450)" }}
            >
              {user?.email?.charAt(0).toUpperCase() ?? "A"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate" style={{ color: "#34495E" }}>Admin</p>
              <p className="text-xs truncate" style={{ color: "#a0aec0" }}>{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{ color: "#a0aec0" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.color = "#ef4444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#a0aec0"; }}
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ══════════════════ MAIN CONTENT ══════════════════ */}
      <div className="flex-1 flex flex-col lg:ml-[256px]">

        {/* Header sticky */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-4 md:px-8 py-4"
          style={{ background: "rgba(253,248,242,0.92)", backdropFilter: "blur(8px)", borderBottom: "1.5px solid #D5DBDB" }}
        >
          <div className="flex items-center gap-3">
            {/* Hamburguesa — solo móvil */}
            <button
              className="lg:hidden p-2 rounded-xl transition-colors"
              style={{ color: "#7f8c8d" }}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
            <h1 className="text-lg md:text-xl font-extrabold" style={{ color: "#34495E" }}>
              {tab === "reportes"      && "Reportes generales"}
              {tab === "actividades"   && "Gestionar Actividades"}
              {tab === "tutores"       && "Tutores"}
              {tab === "profesionales" && "Profesionales internos"}
              {tab === "estudiantes"   && "Estudiantes"}
              {tab === "admins"        && "Administradores"}
            </h1>
            <p className="text-xs mt-0.5 hidden sm:block" style={{ color: "#a0aec0" }}>
              {tab === "reportes"      && "Uso y comportamiento de la plataforma"}
              {tab === "actividades"   && `${activities.length} actividad${activities.length !== 1 ? "es" : ""} en el sistema`}
              {tab === "tutores"       && (tutorsLoaded ? `${tutors.length} tutor${tutors.length !== 1 ? "es" : ""} registrado${tutors.length !== 1 ? "s" : ""}` : "Cargando...")}
              {tab === "profesionales" && (profsLoaded ? `${professionals.length} profesional${professionals.length !== 1 ? "es" : ""}` : "Cargando...")}
              {tab === "estudiantes"   && (studentsLoaded ? `${students.length} estudiante${students.length !== 1 ? "s" : ""}` : "Cargando...")}
              {tab === "admins"        && "Crear y gestionar cuentas de administrador"}
            </p>
            </div>
          </div>

          {/* Botón "Crear" en header para Tutores / Profesionales / Estudiantes */}
          {(tab === "tutores" || tab === "profesionales" || tab === "estudiantes") && (
            <button
              onClick={() => {
                if (tab === "tutores")     openCreateTutor();
                if (tab === "profesionales") openCreateProf();
                if (tab === "estudiantes") openCreateStudent();
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: "0 3px 14px rgba(255,148,80,0.38)" }}
            >
              <Plus className="w-4 h-4" />
              {tab === "tutores"     && "Nuevo tutor"}
              {tab === "profesionales" && "Nuevo profesional"}
              {tab === "estudiantes" && "Nuevo estudiante"}
            </button>
          )}
        </header>

        {/* Content */}
        <main className="flex-1 px-4 md:px-8 py-4 md:py-8">
          <AnimatePresence mode="wait">

            {/* ══════════════════ REPORTES ══════════════════ */}
            {tab === "reportes" && token && (
              <motion.div
                key="reportes"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <ReportsPanel token={token} />
              </motion.div>
            )}

            {/* ══════════════════ ACTIVIDADES ══════════════════ */}
            {tab === "actividades" && (
              <motion.div
                key="actividades"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex gap-8 items-start">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-extrabold mb-3" style={{ color: "#34495E" }}>Actividades recientes</h2>

                    {/* Filtro por grado */}
                    {activities.length > 0 && (
                      <>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <button onClick={() => { setSelectedActivityDegree("todos"); setSelectedActivitySubject("todos"); }}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                          style={selectedActivityDegree === "todos"
                            ? { background: "#7FB3D5", color: "white", boxShadow: "0 2px 8px rgba(127,179,213,0.35)" }
                            : { background: "white", border: "1.5px solid #D5DBDB", color: "#7f8c8d" }}>
                          Todos los grados
                        </button>
                        {degrees.map((deg) => (
                          <button key={deg.id_degree}
                            onClick={() => { setSelectedActivityDegree(deg.id_degree); setSelectedActivitySubject("todos"); }}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                            style={selectedActivityDegree === deg.id_degree
                              ? { background: "#7FB3D5", color: "white", boxShadow: "0 2px 8px rgba(127,179,213,0.35)" }
                              : { background: "white", border: "1.5px solid #D5DBDB", color: "#7f8c8d" }}>
                            {deg.grade_name}
                          </button>
                        ))}
                      </div>

                      {/* Filtro por materia — solo visible cuando hay un grado seleccionado */}
                      {selectedActivityDegree !== "todos" && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        <button onClick={() => setSelectedActivitySubject("todos")}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                          style={selectedActivitySubject === "todos"
                            ? { background: "#FFB37B", color: "white", boxShadow: "0 2px 8px rgba(255,179,123,0.35)" }
                            : { background: "white", border: "1.5px solid #D5DBDB", color: "#7f8c8d" }}>
                          Todas las materias
                        </button>
                        {subjects.filter((s) => s.id_degree === selectedActivityDegree).map((sub) => (
                          <button key={sub.id_subject}
                            onClick={() => setSelectedActivitySubject(sub.id_subject)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                            style={selectedActivitySubject === sub.id_subject
                              ? { background: "#FFB37B", color: "white", boxShadow: "0 2px 8px rgba(255,179,123,0.35)" }
                              : { background: "white", border: "1.5px solid #D5DBDB", color: "#7f8c8d" }}>
                            {sub.subject_name}
                          </button>
                        ))}
                      </div>
                      )}
                      </>
                    )}

                    {activities.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#E1EFFF" }}>
                          <BookOpen className="w-8 h-8" style={{ color: "#7FB3D5" }} />
                        </div>
                        <p className="text-sm font-semibold" style={{ color: "#7f8c8d" }}>Aún no hay actividades</p>
                      </div>
                    ) : (() => {
                      const filtered = activities.filter((act) => {
                        const sub = subjects.find((s) => s.id_subject === act.id_subject);
                        const matchesDegree = selectedActivityDegree === "todos" || sub?.id_degree === selectedActivityDegree;
                        const matchesSubject = selectedActivitySubject === "todos" || act.id_subject === selectedActivitySubject;
                        return matchesDegree && matchesSubject;
                      });
                      if (filtered.length === 0) {
                        return (
                          <p className="text-sm font-semibold py-12 text-center" style={{ color: "#a0aec0" }}>
                            Sin actividades para el filtro seleccionado
                          </p>
                        );
                      }
                      return (
                        <div className="space-y-3">
                          {filtered.map((act, i) => {
                            const sub = subjects.find((s) => s.id_subject === act.id_subject);
                            const deg = sub ? degrees.find((d) => d.id_degree === sub.id_degree) : null;
                            const diff = difficultyBadge(act.difficulty_level);
                            return (
                              <motion.div
                                key={act.id_activity}
                                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                className="flex items-center gap-4 p-4 rounded-[1.25rem]"
                                style={{ background: "white", border: "1.5px solid #D5DBDB", boxShadow: "0 2px 8px rgba(127,179,213,0.07)" }}
                              >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: "#E1EFFF" }}>📖</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold truncate" style={{ color: "#34495E" }}>{act.title}</p>
                                  <p className="text-xs truncate mt-0.5" style={{ color: "#a0aec0" }}>
                                    {sub?.subject_name || "Materia desconocida"}{deg ? ` — ${deg.grade_name}` : ""}
                                  </p>
                                </div>
                                <span className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0" style={{ background: diff.bg, color: diff.color }}>{diff.label}</span>
                              </motion.div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Formulario nueva actividad */}
                  {token && (
                    <ActivityCreatorForm
                      token={token}
                      activityTypes={activityTypes}
                      degrees={degrees}
                      subjects={subjects}
                      onCreated={(created) =>
                        setActivities((prev) => [created as { id_activity: string; title: string; difficulty_level: string; id_subject: string }, ...prev])
                      }
                    />
                  )}
                </div>
              </motion.div>
            )}

            {/* ══════════════════ TUTORES ══════════════════ */}
            {tab === "tutores" && (
              <motion.div key="tutores" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                {tutorsLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#7FB3D5" }} />
                  </div>
                ) : tutors.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#FFE4D4" }}>
                      <Heart className="w-10 h-10" style={{ color: "#FFB37B" }} />
                    </div>
                    <p className="text-base font-bold mb-1" style={{ color: "#7f8c8d" }}>No hay tutores registrados</p>
                    <p className="text-sm" style={{ color: "#a0aec0" }}>Crea el primero con el botón &quot;Nuevo tutor&quot;</p>
                  </div>
                ) : (
                  <>
                  <div className="mb-6" style={{ position: "relative", maxWidth: 420 }}>
                    <span style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "#a0aec0", pointerEvents: "none" }}>
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar por nombre o correo…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%", border: "1.5px solid #D5DBDB", borderRadius: "0.75rem",
                        padding: "0.65rem 1rem 0.65rem 2.4rem", fontSize: "0.875rem",
                        outline: "none", color: "#34495E", background: "white",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#7FB3D5"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#D5DBDB"; }}
                    />
                  </div>
                  {tutors.filter(t => {
                    const q = searchQuery.toLowerCase();
                    return !q || t.full_name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
                  }).length === 0 ? (
                    <p className="text-sm font-semibold py-12 text-center" style={{ color: "#a0aec0" }}>Sin resultados para &quot;{searchQuery}&quot;</p>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {tutors.filter(t => {
                      const q = searchQuery.toLowerCase();
                      return !q || t.full_name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
                    }).map((t, i) => (
                      <motion.div key={t.id_tutor} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="rounded-[1.25rem] p-5"
                        style={{ background: "white", border: "1.5px solid #D5DBDB", boxShadow: "0 2px 12px rgba(127,179,213,0.09)" }}>
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-black text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}>
                            {t.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-extrabold leading-tight" style={{ color: "#34495E" }}>{t.full_name}</h3>
                            <p className="text-xs truncate mt-0.5" style={{ color: "#a0aec0" }}>{t.email}</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1" style={{ background: "#E1EFFF", color: "#4587a9" }}>
                              {t.relationship_type}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5 mb-3">
                          {t.phone && (
                            <div className="flex items-center gap-2 text-xs" style={{ color: "#7f8c8d" }}>
                              <Phone className="w-3 h-3" />{t.phone}
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs" style={{ color: "#7f8c8d" }}>
                            <span style={{ color: "#a0aec0" }}>Registrado:</span>
                            {new Date(t.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        </div>
                        <div className="flex gap-2 pt-3" style={{ borderTop: "1.5px dashed #D5DBDB" }}>
                          <button onClick={() => openEditTutor(t)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors"
                            style={{ background: "#E1EFFF", color: "#4587a9" }}>
                            <Pencil className="w-3.5 h-3.5" />Editar
                          </button>
                          <button onClick={() => handleDeleteTutor(t)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors"
                            style={{ background: "#fee2e2", color: "#dc2626" }}>
                            <Trash2 className="w-3.5 h-3.5" />Eliminar
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  )}
                  </>
                )}
              </motion.div>
            )}

            {/* ══════════════════ PROFESIONALES ══════════════════ */}
            {tab === "profesionales" && (
              <motion.div key="profesionales" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                {profsLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#7FB3D5" }} />
                  </div>
                ) : professionals.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#E1EFFF" }}>
                      <Stethoscope className="w-10 h-10" style={{ color: "#7FB3D5" }} />
                    </div>
                    <p className="text-base font-bold mb-1" style={{ color: "#7f8c8d" }}>No hay profesionales internos</p>
                    <p className="text-sm" style={{ color: "#a0aec0" }}>Invita psicólogos, terapeutas o pedagogos al sistema</p>
                  </div>
                ) : (
                  <>
                  <div className="mb-6" style={{ position: "relative", maxWidth: 420 }}>
                    <span style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "#a0aec0", pointerEvents: "none" }}>
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar por nombre o número de licencia…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%", border: "1.5px solid #D5DBDB", borderRadius: "0.75rem",
                        padding: "0.65rem 1rem 0.65rem 2.4rem", fontSize: "0.875rem",
                        outline: "none", color: "#34495E", background: "white",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#7FB3D5"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#D5DBDB"; }}
                    />
                  </div>
                  {professionals.filter(p => {
                    const q = searchQuery.toLowerCase();
                    return !q || p.full_name.toLowerCase().includes(q) || (p.license_number?.toLowerCase().includes(q) ?? false);
                  }).length === 0 ? (
                    <p className="text-sm font-semibold py-12 text-center" style={{ color: "#a0aec0" }}>Sin resultados para &quot;{searchQuery}&quot;</p>
                  ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {professionals.filter(p => {
                      const q = searchQuery.toLowerCase();
                      return !q || p.full_name.toLowerCase().includes(q) || (p.license_number?.toLowerCase().includes(q) ?? false);
                    }).map((p, i) => (
                      <motion.div key={p.id_professional} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        className="rounded-[1.25rem] p-5"
                        style={{ background: "white", border: "1.5px solid #D5DBDB", boxShadow: "0 2px 12px rgba(127,179,213,0.09)" }}>
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-black text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#7FB3D5,#5a9ec2)" }}>
                            {p.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-extrabold leading-tight" style={{ color: "#34495E" }}>{p.full_name}</h3>
                            <p className="text-xs truncate mt-0.5" style={{ color: "#a0aec0" }}>{p.email}</p>
                            {p.speciality && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1" style={{ background: "#FFE4D4", color: "#c9591e" }}>
                                {p.speciality}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1.5 mb-3">
                          {p.license_number && (
                            <div className="flex items-center justify-between text-xs">
                              <span style={{ color: "#a0aec0" }}>Licencia</span>
                              <span className="font-mono font-bold" style={{ color: "#34495E" }}>{p.license_number}</span>
                            </div>
                          )}
                          {p.phone && (
                            <div className="flex items-center gap-2 text-xs" style={{ color: "#7f8c8d" }}>
                              <Phone className="w-3 h-3" />{p.phone}
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: "#a0aec0" }}>Estado</span>
                            <span className="font-bold px-2 py-0.5 rounded-full" style={
                              p.verification_status === "aprobado" ? { background: "#dcfce7", color: "#16a34a" } :
                              p.verification_status === "rechazado" ? { background: "#fee2e2", color: "#dc2626" } :
                              { background: "#fef9c3", color: "#ca8a04" }
                            }>{p.verification_status}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-3" style={{ borderTop: "1.5px dashed #D5DBDB" }}>
                          <button onClick={() => openEditProf(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold"
                            style={{ background: "#E1EFFF", color: "#4587a9" }}>
                            <Pencil className="w-3.5 h-3.5" />Editar
                          </button>
                          <button onClick={() => handleDeleteProf(p)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold"
                            style={{ background: "#fee2e2", color: "#dc2626" }}>
                            <Trash2 className="w-3.5 h-3.5" />Eliminar
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  )}
                  </>
                )}
              </motion.div>
            )}

            {/* ══════════════════ ESTUDIANTES ══════════════════ */}
            {tab === "estudiantes" && (
              <motion.div key="estudiantes" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                {!studentsLoading && studentsLoaded && (
                  <>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button onClick={() => setSelectedDegree("todos")} className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                      style={selectedDegree === "todos"
                        ? { background: "#7FB3D5", color: "white", boxShadow: "0 2px 8px rgba(127,179,213,0.35)" }
                        : { background: "white", border: "1.5px solid #D5DBDB", color: "#7f8c8d" }}>
                      Todos los grados
                    </button>
                    {degrees.map((deg) => (
                      <button key={deg.id_degree} onClick={() => setSelectedDegree(deg.id_degree)}
                        className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                        style={selectedDegree === deg.id_degree
                          ? { background: "#7FB3D5", color: "white", boxShadow: "0 2px 8px rgba(127,179,213,0.35)" }
                          : { background: "white", border: "1.5px solid #D5DBDB", color: "#7f8c8d" }}>
                        {deg.grade_name}
                      </button>
                    ))}
                  </div>
                  <div className="mb-6" style={{ position: "relative", maxWidth: 420 }}>
                    <span style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "#a0aec0", pointerEvents: "none" }}>
                      <Search className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      placeholder="Buscar por nombre o documento…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: "100%", border: "1.5px solid #D5DBDB", borderRadius: "0.75rem",
                        padding: "0.65rem 1rem 0.65rem 2.4rem", fontSize: "0.875rem",
                        outline: "none", color: "#34495E", background: "white",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "#7FB3D5"; }}
                      onBlur={(e)  => { e.currentTarget.style.borderColor = "#D5DBDB"; }}
                    />
                  </div>
                  </>
                )}

                {studentsLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin" style={{ color: "#7FB3D5" }} />
                  </div>
                ) : students.length === 0 ? (
                  <div className="text-center py-24">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#E1EFFF" }}>
                      <Users className="w-10 h-10" style={{ color: "#7FB3D5" }} />
                    </div>
                    <p className="text-base font-bold mb-1" style={{ color: "#7f8c8d" }}>No hay estudiantes registrados</p>
                  </div>
                ) : students.filter(s => {
                    const q = searchQuery.toLowerCase();
                    const matchesDegree = selectedDegree === "todos" || s.id_degree === selectedDegree;
                    const matchesQuery = !q || s.full_name.toLowerCase().includes(q) || (s.identity_document?.toLowerCase().includes(q) ?? false);
                    return matchesDegree && matchesQuery;
                  }).length === 0 ? (
                  <p className="text-sm font-semibold py-12 text-center" style={{ color: "#a0aec0" }}>Sin resultados para &quot;{searchQuery}&quot;</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {students.filter(s => {
                      const q = searchQuery.toLowerCase();
                      const matchesDegree = selectedDegree === "todos" || s.id_degree === selectedDegree;
                      const matchesQuery = !q || s.full_name.toLowerCase().includes(q) || (s.identity_document?.toLowerCase().includes(q) ?? false);
                      return matchesDegree && matchesQuery;
                    }).map((student, index) => (
                      <motion.div key={student.id_student} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
                        className="rounded-[1.25rem] p-5 flex flex-col"
                        style={{ background: "white", border: "1.5px solid #D5DBDB", boxShadow: "0 2px 12px rgba(127,179,213,0.09)" }}>
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-base font-black text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg,#7FB3D5,#5a9ec2)" }}>
                            {student.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-extrabold leading-tight truncate" style={{ color: "#34495E" }}>{student.full_name}</h3>
                            <p className="text-[10px] font-mono mt-0.5" style={{ color: "#a0aec0" }}>
                              {buildDisplayId(student.full_name, student.identity_document, student.created_at)}
                            </p>
                            {student.id_degree && (
                              <p className="text-[10px] font-semibold mt-0.5" style={{ color: "#7FB3D5" }}>
                                {degrees.find(d => d.id_degree === student.id_degree)?.grade_name ?? ""}
                              </p>
                            )}
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1"
                              style={student.account_status === "activo" ? { background: "#dcfce7", color: "#16a34a" } : { background: "#fee2e2", color: "#dc2626" }}>
                              {student.account_status}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2 flex-1 mb-3">
                          {student.identity_document && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#a0aec0" }}>Documento</span>
                              <span className="text-xs font-bold font-mono" style={{ color: "#34495E" }}>{student.identity_document}</span>
                            </div>
                          )}
                          {student.access_code && (
                            <div className="flex items-center justify-between px-3 py-2 rounded-xl"
                              style={{ background: "#E1EFFF", border: "1px solid rgba(127,179,213,0.3)" }}>
                              <span className="text-xs font-semibold" style={{ color: "#4587a9" }}>Código</span>
                              <span className="text-xs font-bold font-mono" style={{ color: "#4587a9" }}>{student.access_code}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-3" style={{ borderTop: "1.5px dashed #D5DBDB" }}>
                          <button onClick={() => openEditStudent(student)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold"
                            style={{ background: "#E1EFFF", color: "#4587a9" }}>
                            <Pencil className="w-3.5 h-3.5" />Editar
                          </button>
                          <button onClick={() => handleDeleteStudent(student)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold"
                            style={{ background: "#fee2e2", color: "#dc2626" }}>
                            <Trash2 className="w-3.5 h-3.5" />Suspender
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ══════════════════ ADMINS ══════════════════ */}
            {tab === "admins" && (
              <motion.div key="admins" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }} className="max-w-lg">
                <div className="rounded-[1.25rem] p-7" style={{ background: "white", border: "1.5px solid #D5DBDB", boxShadow: "0 4px 20px rgba(127,179,213,0.10)" }}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#FFB37B,#ff9450)" }}>
                      <UserCog className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base font-extrabold" style={{ color: "#34495E" }}>Crear administrador</h2>
                      <p className="text-xs" style={{ color: "#a0aec0" }}>Otorga acceso de administración a una nueva cuenta</p>
                    </div>
                  </div>

                  <AnimatePresence>
                    {adminSuccess && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-5 space-y-3">
                        <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold" style={{ background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d" }}>
                          <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />{adminSuccess}
                        </div>
                        {generatedCode && (
                          <div className="px-4 py-4 rounded-xl" style={{ background: "#E1EFFF", border: "2px solid #7FB3D5" }}>
                            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#4587a9" }}>Código de acceso generado</p>
                            <p className="text-2xl font-black font-mono tracking-widest mb-2" style={{ color: "#34495E" }}>{generatedCode}</p>
                            <p className="text-xs font-semibold" style={{ color: "#7FB3D5" }}>Guárdalo — no se mostrará de nuevo</p>
                          </div>
                        )}
                      </motion.div>
                    )}
                    {adminError && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-5"
                        style={{ background: "#fee2e2", border: "1.5px solid #fca5a5", color: "#dc2626" }}>
                        <X className="w-4 h-4 flex-shrink-0 mt-0.5" />{adminError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleCreateAdmin} className="space-y-4">
                    <StyledInput label="Nombre completo" required type="text" placeholder="Ej. Ana María López"
                      value={newAdmin.full_name} onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })} />
                    <StyledInput label="Correo electrónico" required type="email" placeholder="admin@aulaglobal.edu.co"
                      value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
                    <button type="submit" disabled={adminLoading}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
                      style={{ background: adminLoading ? "#f0c89a" : "linear-gradient(135deg,#FFB37B,#ff9450)", boxShadow: adminLoading ? "none" : "0 3px 14px rgba(255,148,80,0.38)" }}>
                      {adminLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />Creando…</>) : (<><UserCog className="w-4 h-4" />Crear administrador</>)}
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>

      {/* ══════════════════ MODAL: TUTOR ══════════════════ */}
      <Modal open={showTutorModal} onClose={() => setShowTutorModal(false)}
        title={editingTutor ? "Editar tutor" : "Nuevo tutor"}>
        {tutorBanner && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-4"
            style={tutorBanner.type === "ok"
              ? { background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d" }
              : { background: "#fee2e2", border: "1.5px solid #fca5a5", color: "#dc2626" }}>
            {tutorBanner.type === "ok" ? <Check className="w-4 h-4 mt-0.5" /> : <X className="w-4 h-4 mt-0.5" />}
            {tutorBanner.msg}
          </div>
        )}
        <form onSubmit={handleTutorSubmit} className="space-y-4">
          <StyledInput label="Nombre completo" required type="text" placeholder="Ej. Laura Pérez"
            value={newTutor.full_name} onChange={(e) => setNewTutor({ ...newTutor, full_name: e.target.value })} />
          <StyledInput label="Correo electrónico" required type="email" disabled={!!editingTutor}
            placeholder="tutor@correo.com" icon={<Mail className="w-4 h-4" />}
            value={newTutor.email} onChange={(e) => setNewTutor({ ...newTutor, email: e.target.value })} />
          {!editingTutor && (
            <StyledInput label="Contraseña" required type="password" placeholder="Mínimo 6 caracteres"
              icon={<Lock className="w-4 h-4" />} minLength={6}
              value={newTutor.password} onChange={(e) => setNewTutor({ ...newTutor, password: e.target.value })} />
          )}
          <StyledInput label="Teléfono" type="text" placeholder="Opcional" icon={<Phone className="w-4 h-4" />}
            value={newTutor.phone} onChange={(e) => setNewTutor({ ...newTutor, phone: e.target.value })} />
          <StyledSelect label="Relación con el estudiante" required
            value={newTutor.relationship_type}
            onChange={(e) => setNewTutor({ ...newTutor, relationship_type: e.target.value })}
            options={[
              { value: "familiar", label: "Familiar" },
              { value: "profesional_externo", label: "Profesional externo" },
              { value: "cuidador", label: "Cuidador" },
            ]} />
          <button type="submit" disabled={tutorSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: tutorSubmitting ? "#f0c89a" : "linear-gradient(135deg,#FFB37B,#ff9450)" }}>
            {tutorSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {editingTutor ? "Guardar cambios" : "Crear tutor"}
          </button>
        </form>
      </Modal>

      {/* ══════════════════ MODAL: PROFESIONAL ══════════════════ */}
      <Modal open={showProfModal} onClose={() => setShowProfModal(false)}
        title={editingProf ? "Editar profesional" : "Nuevo profesional interno"}>
        {profBanner && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-4"
            style={profBanner.type === "ok"
              ? { background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d" }
              : { background: "#fee2e2", border: "1.5px solid #fca5a5", color: "#dc2626" }}>
            {profBanner.type === "ok" ? <Check className="w-4 h-4 mt-0.5" /> : <X className="w-4 h-4 mt-0.5" />}
            {profBanner.msg}
          </div>
        )}
        <form onSubmit={handleProfSubmit} className="space-y-4">
          <StyledInput label="Nombre completo" required type="text" placeholder="Ej. Dr. Carlos Méndez"
            value={newProf.full_name} onChange={(e) => setNewProf({ ...newProf, full_name: e.target.value })} />
          <StyledInput label="Correo electrónico" required type="email" disabled={!!editingProf}
            placeholder="profesional@correo.com" icon={<Mail className="w-4 h-4" />}
            value={newProf.email} onChange={(e) => setNewProf({ ...newProf, email: e.target.value })} />
          {!editingProf && (
            <StyledInput label="Contraseña" required type="password" placeholder="Mínimo 6 caracteres"
              icon={<Lock className="w-4 h-4" />} minLength={6}
              value={newProf.password} onChange={(e) => setNewProf({ ...newProf, password: e.target.value })} />
          )}
          <StyledInput label="Especialidad" type="text" placeholder="Psicólogo / Terapeuta / Pedagogo"
            value={newProf.speciality} onChange={(e) => setNewProf({ ...newProf, speciality: e.target.value })} />
          <StyledInput label="Número de licencia" type="text" placeholder="Opcional"
            value={newProf.license_number} onChange={(e) => setNewProf({ ...newProf, license_number: e.target.value })} />
          <StyledInput label="Teléfono" type="text" placeholder="Opcional" icon={<Phone className="w-4 h-4" />}
            value={newProf.phone} onChange={(e) => setNewProf({ ...newProf, phone: e.target.value })} />
          <button type="submit" disabled={profSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: profSubmitting ? "#f0c89a" : "linear-gradient(135deg,#FFB37B,#ff9450)" }}>
            {profSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {editingProf ? "Guardar cambios" : "Crear profesional"}
          </button>
        </form>
      </Modal>

      {/* ══════════════════ MODAL: ESTUDIANTE ══════════════════ */}
      <Modal open={showStudentModal} onClose={() => setShowStudentModal(false)}
        title={editingStudent ? "Editar estudiante" : "Nuevo estudiante"}>
        {studentBanner && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-4"
            style={studentBanner.type === "ok"
              ? { background: "#dcfce7", border: "1.5px solid #86efac", color: "#15803d" }
              : { background: "#fee2e2", border: "1.5px solid #fca5a5", color: "#dc2626" }}>
            {studentBanner.type === "ok" ? <Check className="w-4 h-4 mt-0.5" /> : <X className="w-4 h-4 mt-0.5" />}
            {studentBanner.msg}
          </div>
        )}
        {createdAccessCode && (
          <div className="px-4 py-4 rounded-xl mb-4" style={{ background: "#E1EFFF", border: "2px solid #7FB3D5" }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#4587a9" }}>Código de acceso del estudiante</p>
            <p className="text-2xl font-black font-mono tracking-widest mb-2" style={{ color: "#34495E" }}>{createdAccessCode}</p>
            <p className="text-xs font-semibold" style={{ color: "#7FB3D5" }}>Compártelo con el tutor — necesario para iniciar sesión</p>
          </div>
        )}
        <form onSubmit={handleStudentSubmit} className="space-y-4">
          {!editingStudent && (
            <StyledSelect label="Tutor responsable" required
              value={newStudent.tutor_id}
              onChange={(e) => setNewStudent({ ...newStudent, tutor_id: e.target.value })}
              options={[
                { value: "", label: "Seleccionar tutor…" },
                ...tutors.map((t) => ({ value: t.id_tutor, label: `${t.full_name} (${t.email})` })),
              ]} />
          )}
          <StyledInput label="Nombre completo" required type="text" placeholder="Ej. Lucía García"
            value={newStudent.full_name} onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })} />
          <StyledInput label="Fecha de nacimiento" required type="date"
            value={newStudent.birth_date} onChange={(e) => setNewStudent({ ...newStudent, birth_date: e.target.value })} />
          <StyledInput label="Documento de identidad" required type="text" placeholder="Ej. 1234567890"
            value={newStudent.identity_document} onChange={(e) => setNewStudent({ ...newStudent, identity_document: e.target.value })} />
          <StyledSelect label="Grado escolar" required
            value={newStudent.id_degree}
            onChange={(e) => setNewStudent({ ...newStudent, id_degree: e.target.value })}
            options={[
              { value: "", label: "Seleccionar grado…" },
              ...degrees.map((d) => ({ value: d.id_degree, label: d.grade_name })),
            ]} />
          <button type="submit" disabled={studentSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white"
            style={{ background: studentSubmitting ? "#f0c89a" : "linear-gradient(135deg,#FFB37B,#ff9450)" }}>
            {studentSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {editingStudent ? "Guardar cambios" : "Crear estudiante"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
