import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { properties, formatEur } from "../lib/demoData";
import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";

// Lightweight mock map: positions properties relative to a bounding box of Italy.
const ITALY_BOUNDS = { minLat: 40.5, maxLat: 46.0, minLng: 7.0, maxLng: 14.5 };

const positionPct = (lat, lng) => {
  const x = ((lng - ITALY_BOUNDS.minLng) / (ITALY_BOUNDS.maxLng - ITALY_BOUNDS.minLng)) * 100;
  const y = 100 - ((lat - ITALY_BOUNDS.minLat) / (ITALY_BOUNDS.maxLat - ITALY_BOUNDS.minLat)) * 100;
  return { left: `${Math.max(2, Math.min(98, x))}%`, top: `${Math.max(2, Math.min(98, y))}%` };
};

const markerColor = (p) => {
  if (p.stato === "sfitto" || p.portfolio_score < 40) return "#EF4444";
  if (p.stato === "in_vendita") return "#38BDF8";
  if (p.portfolio_score >= 71) return "#10B981";
  return "#F59E0B";
};

export default function Mappa() {
  return (
    <Layout title="Mappa Patrimonio" subtitle="Distribuzione geografica · click su un marker per i dettagli">
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <div className="xl:col-span-3">
          <div className="relative bg-[#0A0E14] border border-[#212B36] rounded-xl overflow-hidden grid-bg" style={{ aspectRatio: "16/11" }}>
            {/* Background: stylized italy outline using radial */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-[200px] font-display font-black text-[#11171F] select-none">IT</div>
            </div>

            {properties.map((p, idx) => {
              const pos = positionPct(p.lat, p.lng);
              const color = markerColor(p);
              return (
                <Link
                  key={p.id}
                  to={`/immobile/${p.id}`}
                  data-testid={`map-marker-${p.id}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group z-10"
                  style={pos}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 border-[#0A0E14] shadow-lg flex items-center justify-center hover:scale-150 transition-transform"
                    style={{ background: color, boxShadow: `0 0 12px ${color}80` }}
                  >
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                  <div className="absolute left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity bg-[#080C11] border border-[#212B36] rounded-lg px-3 py-2 whitespace-nowrap z-20">
                    <div className="text-xs font-medium text-[#F3F4F6]">{p.nome}</div>
                    <div className="text-[10px] text-[#9CA3AF]">{p.citta} · {p.canone_mensile ? formatEur(p.canone_mensile)+"/mese" : "Sfitto"}</div>
                  </div>
                </Link>
              );
            })}

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-[#080C11]/90 backdrop-blur border border-[#212B36] rounded-lg p-3 text-[11px] space-y-1.5 z-10">
              <div className="text-[10px] uppercase tracking-widest text-[#6B7280] mb-1">Legenda</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#10B981]"/> Rendimento alto</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#F59E0B]"/> Medio</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#EF4444]"/> Critico / sfitto</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#38BDF8]"/> In vendita</div>
            </div>
          </div>
        </div>

        <SectionCard testId="map-list" title="Elenco geografico">
          <div className="space-y-1.5 max-h-[700px] overflow-y-auto">
            {properties.map(p => (
              <Link key={p.id} to={`/immobile/${p.id}`} className="block p-2.5 rounded-lg border border-transparent hover:border-[#212B36] hover:bg-[#080C11] transition-colors">
                <div className="flex items-start gap-2">
                  <MapPin size={12} className="mt-1 shrink-0" style={{ color: markerColor(p) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#F3F4F6] truncate">{p.nome}</div>
                    <div className="text-[11px] text-[#9CA3AF] flex items-center gap-1 justify-between mt-0.5">
                      <span>{p.citta}</span>
                      <StatusBadge stato={p.stato} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </Layout>
  );
}
