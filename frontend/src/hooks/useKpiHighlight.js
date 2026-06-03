import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Hook che applica una classe "kpi-highlight" all'elemento ref se
 * l'URL contiene ?highlight=<slug> e <slug> corrisponde allo `slug` passato.
 *
 * Slug = stringa lower-case con trattini al posto di spazi/punteggiatura.
 * Esempio: "Valore patrimonio" → "valore-patrimonio".
 *
 * Quando matcha: scrolla l'elemento al centro viewport + aggiunge classe per 3s.
 */
export function slugifyKpi(s) {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function useKpiHighlight(slug) {
  const ref = useRef(null);
  const location = useLocation();
  useEffect(() => {
    if (!slug || !ref.current) return;
    const sp = new URLSearchParams(location.search);
    const target = sp.get("highlight");
    if (!target) return;
    if (slugifyKpi(target) !== slugifyKpi(slug)) return;
    const el = ref.current;
    // attendi un breve momento perché il layout sia stabile (dati async)
    const t = setTimeout(() => {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (_) {
        el.scrollIntoView();
      }
      el.classList.add("kpi-highlight");
      setTimeout(() => el.classList.remove("kpi-highlight"), 3200);
    }, 350);
    return () => clearTimeout(t);
  }, [slug, location.search]);
  return ref;
}
