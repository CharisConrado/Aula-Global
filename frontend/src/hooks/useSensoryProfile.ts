"use client";

/**
 * Aula Global — Hook de perfil sensorial
 * Carga el perfil del estudiante activo y aplica las preferencias visuales
 * al documento (CSS variables + data-attributes en <html>).
 *
 * Los efectos visuales se controlan vía:
 *   - data-contrast="bajo|normal|alto"   (tema de colores)
 *   - data-font-size="pequeno|normal|grande"  (escala global de texto)
 *   - data-anim-speed="lenta|normal|rapida"   (duración de animaciones)
 *   - data-needs-breaks="true|false"
 *
 * Las reglas CSS que consumen estas variables están en globals.css.
 */

import { useEffect, useState } from "react";
import { api, type ProfileResponse } from "@/lib/api";

const DEFAULTS = {
  visual_contrast: "normal",
  font_size:       "normal",
  animation_speed: "normal",
  feedback_type:   "visual",
  volume_level:    5,
  needs_breaks:    false,
  break_interval:  15,
  max_session_min: 30,
};

export function useSensoryProfile(token: string | null, studentId: string | null) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loaded,  setLoaded]  = useState(false);

  // ── Cargar perfil ──
  useEffect(() => {
    if (!token || !studentId) return;
    let cancelled = false;
    api.getStudentProfile(token, studentId)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch(() => {
        // Sin perfil → usar defaults
        if (!cancelled) setProfile(null);
      })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [token, studentId]);

  // ── Aplicar al <html> y <body> ──
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;

    const contrast    = profile?.visual_contrast || DEFAULTS.visual_contrast;
    const fontSize    = profile?.font_size       || DEFAULTS.font_size;
    const animSpeed   = profile?.animation_speed || DEFAULTS.animation_speed;
    const needsBreaks = profile?.needs_breaks ?? DEFAULTS.needs_breaks;

    // Aplicar en html (selector raíz)
    html.setAttribute("data-contrast",     contrast);
    html.setAttribute("data-font-size",    fontSize);
    html.setAttribute("data-anim-speed",   animSpeed);
    html.setAttribute("data-needs-breaks", needsBreaks ? "true" : "false");

    // Replicar en body por si algún CSS selector apunta a body
    body.setAttribute("data-contrast",     contrast);
    body.setAttribute("data-font-size",    fontSize);
    body.setAttribute("data-anim-speed",   animSpeed);

    // Aplicar color de fondo directo al body cuando alto contraste
    // (algunas hojas de estilo pueden no afectar a body por especificidad)
    const prevBg    = body.style.backgroundColor;
    const prevColor = body.style.color;
    if (contrast === "alto") {
      body.style.backgroundColor = "#0F172A";
      body.style.color           = "#FFFFFF";
    } else if (contrast === "bajo") {
      body.style.backgroundColor = "#FFFBF5";
      body.style.color           = "#5d6d7e";
    } else {
      body.style.backgroundColor = "";
      body.style.color           = "";
    }

    // Cleanup al desmontar: volver a defaults
    return () => {
      html.removeAttribute("data-contrast");
      html.removeAttribute("data-font-size");
      html.removeAttribute("data-anim-speed");
      html.removeAttribute("data-needs-breaks");
      body.removeAttribute("data-contrast");
      body.removeAttribute("data-font-size");
      body.removeAttribute("data-anim-speed");
      body.style.backgroundColor = prevBg;
      body.style.color           = prevColor;
    };
  }, [profile]);

  return {
    profile,
    loaded,
    // Helpers derivados (útiles para componentes que necesiten valores numéricos)
    fontScale:
      profile?.font_size === "pequeno" ? 0.875 :
      profile?.font_size === "grande"  ? 1.15  : 1,
    animScale:
      profile?.animation_speed === "lenta"  ? 2.2 :
      profile?.animation_speed === "rapida" ? 0.55 : 1,
    isHighContrast: profile?.visual_contrast === "alto",
    isLowContrast:  profile?.visual_contrast === "bajo",
  };
}
