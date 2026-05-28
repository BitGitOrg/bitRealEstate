import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, Wallet, Building2, Map, FileText,
  Handshake, Home, ShoppingBag, Hammer, Receipt, Banknote, Calculator,
  Bot, BellRing, FolderArchive, Settings, FileBarChart, ChevronRight, Sparkles
} from "lucide-react";

const GROUPS = [
  { name: "Overview", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/kpi", label: "KPI & Rendimenti", icon: TrendingUp },
    { to: "/cash-flow", label: "Cash Flow", icon: Wallet },
  ]},
  { name: "Portfolio", items: [
    { to: "/patrimonio", label: "Patrimonio", icon: Building2 },
    { to: "/mappa", label: "Mappa", icon: Map },
  ]},
  { name: "Operazioni", items: [
    { to: "/operazioni", label: "Operazioni", icon: Handshake },
    { to: "/affitti", label: "Affitti & Locazioni", icon: Home },
    { to: "/vendite", label: "Vendite & Rivendite", icon: ShoppingBag },
    { to: "/lavori", label: "Lavori & Ristrutturazioni", icon: Hammer },
  ]},
  { name: "Finanza", items: [
    { to: "/costi-ricavi", label: "Costi & Ricavi", icon: Receipt },
    { to: "/mutui", label: "Mutui & Finanziamenti", icon: Banknote },
    { to: "/simulatore", label: "Simulatore", icon: Calculator },
  ]},
  { name: "Intelligenza", items: [
    { to: "/ai-autopilot", label: "AI Autopilot", icon: Bot, accent: true },
    { to: "/alert-center", label: "Alert Center", icon: BellRing },
    { to: "/report", label: "Report Direzionali", icon: FileBarChart },
  ]},
  { name: "Sistema", items: [
    { to: "/documenti", label: "Documenti", icon: FolderArchive },
    { to: "/impostazioni", label: "Impostazioni", icon: Settings },
  ]},
];

export const Sidebar = () => {
  const loc = useLocation();
  return (
    <aside className="w-64 shrink-0 border-r border-[#212B36] bg-[#0A0E14] h-screen sticky top-0 overflow-y-auto" data-testid="app-sidebar">
      <div className="px-5 py-6 border-b border-[#212B36]">
        <Link to="/" className="flex items-center gap-2.5" data-testid="sidebar-brand">
          <div className="w-9 h-9 rounded-lg bg-[#0066FF] flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-[15px] tracking-tight text-[#F3F4F6]">Control Room</div>
            <div className="text-[10px] uppercase tracking-widest text-[#6B7280]">Real Estate · IT</div>
          </div>
        </Link>
      </div>

      <nav className="px-3 py-4 space-y-6">
        {GROUPS.map((g) => (
          <div key={g.name}>
            <div className="px-3 mb-2 text-[10px] uppercase tracking-[0.14em] text-[#6B7280] font-medium">{g.name}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => {
                const Icon = it.icon;
                const active = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    data-testid={`sidebar-nav-${it.to.replace(/\//g, '') || 'dashboard'}`}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? "bg-[#11171F] text-[#F3F4F6] border border-[#212B36]"
                        : "text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#11171F]/60 border border-transparent"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-[#0066FF]" : ""} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.accent && <span className="text-[9px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-[rgba(0,102,255,0.15)] text-[#60A5FA] border border-[rgba(0,102,255,0.3)]">AI</span>}
                    {active && <ChevronRight size={14} className="text-[#0066FF]" />}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
};
