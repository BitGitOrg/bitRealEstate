import { Link, NavLink, useLocation } from "react-router-dom";
import { useEffect } from "react";
import {
  LayoutDashboard, TrendingUp, Wallet, Building2, Map, FileText,
  Handshake, Home, ShoppingBag, Hammer, Receipt, Banknote, Calculator,
  Bot, BellRing, FolderArchive, Settings, FileBarChart, ChevronRight, Sparkles,
  LineChart, MessageCircle, Calendar, X as XIcon
} from "lucide-react";
import { useSidebar } from "../../lib/sidebarContext";

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
    { to: "/pipeline", label: "Pipeline Acquisizioni", icon: Sparkles, accent: true },
    { to: "/affitti", label: "Affitti & Locazioni", icon: Home },
    { to: "/notifiche", label: "Solleciti & Notifiche", icon: MessageCircle, accent: true },
    { to: "/vendite", label: "Vendite & Rivendite", icon: ShoppingBag },
    { to: "/lavori", label: "Lavori & Ristrutturazioni", icon: Hammer },
  ]},
  { name: "Finanza", items: [
    { to: "/costi-ricavi", label: "Costi & Ricavi", icon: Receipt },
    { to: "/mutui", label: "Mutui & Finanziamenti", icon: Banknote },
    { to: "/scadenzario", label: "Scadenzario Fiscale", icon: Calendar, accent: true },
    { to: "/forecast", label: "Simulatore & Forecast", icon: Calculator, accent: true },
  ]},
  { name: "Intelligenza", items: [
    { to: "/watchlists", label: "Watchlists", icon: BellRing },
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
  const { isOpen, close } = useSidebar();

  // Chiudi sidebar al cambio rotta su mobile
  useEffect(() => { close(); /* eslint-disable-next-line */ }, [loc.pathname]);

  return (
    <>
      {/* Backdrop mobile */}
      {isOpen && (
        <div
          onClick={close}
          className="fixed inset-0 z-30 bg-[#0F172A]/50 backdrop-blur-sm lg:hidden"
          data-testid="sidebar-backdrop"
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed lg:sticky inset-y-0 left-0 top-0 z-40
          w-72 lg:w-64 shrink-0
          border-r border-[#E2E8F0] bg-[#FFFFFF]
          h-screen overflow-y-auto
          transform transition-transform duration-200 ease-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0
        `}
        data-testid="app-sidebar"
        aria-label="Navigazione principale"
      >
        <div className="px-5 py-6 border-b border-[#E2E8F0] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="sidebar-brand" onClick={close}>
            <div className="w-9 h-9 rounded-lg bg-[#0066FF] flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="leading-tight">
              <div className="font-display font-bold text-[15px] tracking-tight text-[#0F172A]">Control Room</div>
              <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Real Estate · IT</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={close}
            className="lg:hidden p-1 -mr-1 rounded text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]"
            data-testid="sidebar-close"
            aria-label="Chiudi menu"
          >
            <XIcon size={20} />
          </button>
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
                      onClick={close}
                      data-testid={`sidebar-nav-${it.to.replace(/\//g, '') || 'dashboard'}`}
                      className={`group flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm transition-colors ${
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
    </>
  );
};
