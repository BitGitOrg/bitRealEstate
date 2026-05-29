import { Bell, Search, LogOut, User } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { Link, useNavigate } from "react-router-dom";
import { alerts } from "../../lib/demoData";

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
  const unread = alerts.length;

  return (
    <header className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-[#F8FAFC]/85 backdrop-blur-xl" data-testid="app-topbar">
      <div className="flex items-center gap-4 px-6 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight text-[#0F172A] truncate" data-testid="page-title">{title}</h1>
            <span className="hidden md:inline-flex items-center text-[10px] uppercase tracking-widest text-[#10B981] pulse-dot">Live</span>
          </div>
          {subtitle && <p className="text-xs text-[#475569] mt-0.5">{subtitle}</p>}
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FFFFFF] border border-[#E2E8F0] w-72">
          <Search size={14} className="text-[#64748B]" />
          <input data-testid="topbar-search" placeholder="Cerca immobile, contratto, fattura…" className="bg-transparent outline-none text-sm flex-1 placeholder:text-[#64748B]" />
          <kbd className="text-[10px] text-[#64748B] border border-[#E2E8F0] rounded px-1.5 py-0.5">⌘K</kbd>
        </div>

        {actions}

        <Link to="/alert-center" className="relative p-2 rounded-lg hover:bg-[#FFFFFF] border border-transparent hover:border-[#E2E8F0] transition-colors" data-testid="topbar-notifications">
          <Bell size={18} className="text-[#475569]" />
          {unread > 0 && <span className="absolute top-1 right-1 text-[9px] font-bold bg-[#EF4444] text-white rounded-full px-1.5 py-0.5">{unread}</span>}
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-[#E2E8F0]">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0066FF] to-[#10B981] flex items-center justify-center text-white font-semibold text-sm" data-testid="topbar-user-avatar">
            {user?.name?.charAt(0) || <User size={14} />}
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="text-xs font-medium text-[#0F172A]">{user?.name || "Ospite"}</div>
            <div className="text-[10px] uppercase tracking-wider text-[#64748B]">{ROLE_LABEL[user?.role] || "—"}</div>
          </div>
          <button
            onClick={() => { logout(); nav("/login"); }}
            data-testid="topbar-logout"
            className="ml-1 p-2 rounded-lg hover:bg-[#FFFFFF] border border-transparent hover:border-[#E2E8F0] text-[#475569] hover:text-[#DC2626] transition-colors"
            title="Esci"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};
