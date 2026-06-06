import { Bell, Search, LogOut, User, Menu } from "lucide-react";
import { useAuth, apiClient } from "../../lib/auth";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSidebar } from "../../lib/sidebarContext";

const ROLE_LABEL = {
  admin: "Admin / CEO",
  ceo: "CEO",
  amministrazione: "Amministrazione",
  commercialista: "Commercialista",
  collaboratore: "Collaboratore",
};

export const Topbar = ({ title, subtitle, actions }) => {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { open: openSidebar } = useSidebar();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () => apiClient().get("/alerts").then(r => {
      const alerts = r.data || [];
      const active = alerts.filter(a => (a.severity === "alta" || a.severity === "media"));
      setUnread(active.length);
    }).catch(() => setUnread(0));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-[#F8FAFC]/85 backdrop-blur-xl" data-testid="app-topbar">
      <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 px-3 sm:px-4 lg:px-6 py-3 lg:py-4">
        {/* Hamburger — solo mobile/tablet */}
        <button
          type="button"
          onClick={openSidebar}
          className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-[#FFFFFF] border border-transparent hover:border-[#E2E8F0] text-[#475569]"
          data-testid="topbar-hamburger"
          aria-label="Apri menu"
        >
          <Menu size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 lg:gap-3">
            <h1 className="font-display text-base sm:text-lg md:text-xl lg:text-2xl font-bold tracking-tight text-[#0F172A] truncate" data-testid="page-title">{title}</h1>
            <span className="hidden md:inline-flex items-center text-[10px] uppercase tracking-widest text-[#10B981] pulse-dot">Live</span>
          </div>
          {subtitle && <p className="hidden sm:block text-[11px] lg:text-xs text-[#475569] mt-0.5 truncate">{subtitle}</p>}
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FFFFFF] border border-[#E2E8F0] w-56 lg:w-72">
          <Search size={14} className="text-[#64748B]" />
          <input data-testid="topbar-search" placeholder="Cerca immobile, contratto, fattura…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-[#64748B] min-w-0" />
          <kbd className="hidden lg:inline text-[10px] text-[#64748B] border border-[#E2E8F0] rounded px-1.5 py-0.5">⌘K</kbd>
        </div>

        {actions && <div className="hidden sm:flex items-center gap-2">{actions}</div>}

        <Link to="/alert-center" className="relative p-2 rounded-lg hover:bg-[#FFFFFF] border border-transparent hover:border-[#E2E8F0] transition-colors" data-testid="topbar-notifications" aria-label="Notifiche">
          <Bell size={18} className="text-[#475569]" />
          {unread > 0 && <span className="absolute top-1 right-1 text-[9px] font-bold bg-[#EF4444] text-white rounded-full px-1.5 py-0.5">{unread}</span>}
        </Link>

        <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-[#E2E8F0]">
          <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-gradient-to-br from-[#0066FF] to-[#10B981] flex items-center justify-center text-white font-semibold text-sm shrink-0" data-testid="topbar-user-avatar">
            {user?.name?.charAt(0) || <User size={14} />}
          </div>
          <div className="hidden md:block leading-tight">
            <div className="text-xs font-medium text-[#0F172A]">{user?.name || "Ospite"}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#64748B]">{ROLE_LABEL[user?.role] || "—"}</div>
          </div>
          <button
            onClick={() => { logout(); nav("/login"); }}
            data-testid="topbar-logout"
            className="ml-0.5 p-2 rounded-lg hover:bg-[#FFFFFF] border border-transparent hover:border-[#E2E8F0] text-[#475569] hover:text-[#DC2626] transition-colors"
            title="Esci"
            aria-label="Esci"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
