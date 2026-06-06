import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Building2, Sparkles, Bot, Settings } from "lucide-react";

const ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, match: (p) => p === "/" },
  { to: "/patrimonio", label: "Patrimonio", icon: Building2, match: (p) => p.startsWith("/patrimonio") || p.startsWith("/immobile") },
  { to: "/pipeline", label: "Pipeline", icon: Sparkles, match: (p) => p.startsWith("/pipeline") },
  { to: "/ai-autopilot", label: "AI", icon: Bot, match: (p) => p.startsWith("/ai-autopilot") },
  { to: "/impostazioni", label: "Settings", icon: Settings, match: (p) => p.startsWith("/impostazioni") },
];

/**
 * Bottom Navigation Bar stile iOS/Android.
 * Visibile solo su mobile/tablet (<lg). Su desktop la sidebar copre il ruolo.
 */
export function BottomNav() {
  const loc = useLocation();
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-[#E2E8F0] app-safe-bottom"
      data-testid="bottom-nav"
      aria-label="Navigazione rapida"
    >
      <div className="grid grid-cols-5 max-w-screen-sm mx-auto">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const active = it.match(loc.pathname);
          return (
            <NavLink
              key={it.to}
              to={it.to}
              data-testid={`bottom-nav-${it.label.toLowerCase()}`}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[56px] transition-colors relative ${
                active ? "text-[#0066FF]" : "text-[#64748B]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#0066FF]"
                  aria-hidden="true"
                />
              )}
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span className={`text-[10px] tracking-tight ${active ? "font-semibold" : ""}`}>
                {it.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
