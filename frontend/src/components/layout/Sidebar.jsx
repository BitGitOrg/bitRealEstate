import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, TrendingUp, Wallet, Building2, Map, FileText,
  Handshake, Home, ShoppingBag, Hammer, Receipt, Banknote, Calculator,
  Bot, BellRing, FolderArchive, Settings, FileBarChart, ChevronRight, Sparkles, Database
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
    { to: "/deal-inbox", label: "Deal Inbox", icon: Sparkles, accent: true },
    { to: "/watchlists", label: "Watchlists", icon: BellRing },
    { to: "/ai-autopilot", label: "AI Autopilot", icon: Bot, accent: true },
    { to: "/alert-center", label: "Alert Center", icon: BellRing },
    { to: "/report", label: "Report Direzionali", icon: FileBarChart },
  ]},
  { name: "Sistema", items: [
    { to: "/import", label: "Centro Import", icon: Database, accent: true },
    { to: "/documenti", label: "Documenti", icon: FolderArchive },
    { to: "/impostazioni", label: "Impostazioni", icon: Settings },
  ]},
];

export const Sidebar = () => {
  const loc = useLocation();
  return (
    <aside className="w-64 shrink-0 border-r border-[#E2E8F0] bg-[#FFFFFF] h-screen sticky top-0 overflow-y-auto" data-testid="app-sidebar">
      <div className="px-5 py-6 border-b border-[#E2E8F0]">
        <Link to="/" className="flex items-center gap-2.5" data-testid="sidebar-brand">
          <div className="w-9 h-9 rounded-lg bg-[#0066FF] flex items-center justify-center">
            <Sparkles size={18} className="text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-bold text-[15px] tracking-tight text-[#0F172A]">Control Room</div>
            <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Real Estate · IT</div>
          </div>
        </Link>
      </div>

      <nav className="px-3 py-4 space-y-6">
        {GROUPS.map((g) => (
          <div key={g.name}>
            <div className="px-3 mb-2 text-[10px] uppercase tracking-[0.14em] text-[#64748B] font-medium">{g.name}</div>
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
                        ? "bg-[#FFFFFF] text-[#0F172A] border border-[#E2E8F0]"
                        : "text-[#475569] hover:text-[#0F172A] hover:bg-[#FFFFFF]/60 border border-transparent"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-[#0066FF]" : ""} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.accent && <span className="text-[9px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-[rgba(0,102,255,0.15)] text-[#2563EB] border border-[rgba(0,102,255,0.3)]">AI</span>}
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
