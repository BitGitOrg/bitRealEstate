import { useState } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { SeverityBadge } from "../components/StatusBadge";
import { alerts, properties } from "../lib/demoData";
import { AlertTriangle, FileWarning, Lightbulb, Bell, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const TIPI = {
  economico: { label: "Economici", icon: AlertTriangle, color: "#EF4444" },
  documentale: { label: "Documentali", icon: FileWarning, color: "#F59E0B" },
  strategico: { label: "Strategici", icon: Lightbulb, color: "#0066FF" },
};

export default function AlertCenter() {
  const [tipo, setTipo] = useState("tutti");
  const filtered = alerts.filter(a => tipo === "tutti" || a.tipo === tipo);
  const counts = Object.keys(TIPI).reduce((acc, k) => ({ ...acc, [k]: alerts.filter(a => a.tipo === k).length }), {});

  return (
    <Layout title="AI Alert Center" subtitle={`${alerts.length} notifiche · ${alerts.filter(a => a.severity === "alta").length} ad alta priorità`}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SectionCard testId="alert-tot">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#161B22] border border-[#212B36] flex items-center justify-center"><Bell size={18} className="text-[#F3F4F6]"/></div>
            <div>
              <div className="text-[10px] uppercase text-[#6B7280]">Notifiche totali</div>
              <div className="font-display text-2xl font-bold tabular">{alerts.length}</div>
            </div>
          </div>
        </SectionCard>
        {Object.entries(TIPI).map(([k, m]) => {
          const Icon = m.icon;
          return (
            <SectionCard key={k} testId={`alert-tipo-${k}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${m.color}20`, border: `1px solid ${m.color}40` }}>
                  <Icon size={18} style={{ color: m.color }} />
                </div>
                <div>
                  <div className="text-[10px] uppercase text-[#6B7280]">{m.label}</div>
                  <div className="font-display text-2xl font-bold tabular">{counts[k]}</div>
                </div>
              </div>
            </SectionCard>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-4">
        {["tutti", ...Object.keys(TIPI)].map(t => (
          <button
            key={t}
            data-testid={`filter-tipo-${t}`}
            onClick={() => setTipo(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${tipo === t ? "bg-[#0066FF] text-white border-[#0066FF]" : "bg-[#11171F] text-[#9CA3AF] border-[#212B36] hover:border-[#334155]"}`}
          >
            {t === "tutti" ? "Tutti" : TIPI[t].label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.map(a => {
          const meta = TIPI[a.tipo];
          const Icon = meta.icon;
          const p = a.immobile_id ? properties.find(x => x.id === a.immobile_id) : null;
          return (
            <div key={a.id} data-testid={`alert-${a.id}`} className="bg-[#11171F] border border-[#212B36] rounded-xl p-4 card-hover flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}40` }}>
                <Icon size={18} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <SeverityBadge severity={a.severity} />
                  <span className="text-[10px] uppercase tracking-wider text-[#6B7280]">{meta.label}</span>
                  <span className="text-[10px] text-[#6B7280] ml-auto">{a.ts}</span>
                </div>
                <div className="font-display font-semibold text-[#F3F4F6]">{a.titolo}</div>
                <div className="text-sm text-[#9CA3AF] mt-1">{a.descrizione}</div>
                {p && (
                  <Link to={`/immobile/${p.id}`} className="inline-flex items-center gap-1 text-xs text-[#60A5FA] mt-2 hover:underline">
                    Vai a {p.nome} <ChevronRight size={12} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
