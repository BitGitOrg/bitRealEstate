import { createContext, useContext, useState, useEffect } from "react";

const Ctx = createContext(null);

/**
 * Provider per la sidebar drawer responsive.
 * - Mobile (< lg): la sidebar è chiusa di default, si apre con hamburger.
 * - Desktop (≥ lg): la sidebar è sempre visibile (lo stato isOpen è ignorato).
 *
 * Si chiude automaticamente al cambio rotta su mobile.
 */
export function SidebarProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen((v) => !v);

  // Chiudi con ESC
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setIsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ isOpen, open, close, toggle }}>{children}</Ctx.Provider>
  );
}

export function useSidebar() {
  const v = useContext(Ctx);
  if (!v) return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} };
  return v;
}
