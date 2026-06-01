import { useEffect, useState, useMemo } from "react";
import { Layout } from "../components/layout/Layout";
import { SectionCard } from "../components/dashboard/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/auth";
import { formatEur } from "../lib/demoData";
import { MapPin, Loader2, Sparkles, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip as LTooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const markerColor = (p) => {
  if (p.stato === "sfitto" || p.stato === "disponibile") return "#EF4444";
  if (p.stato === "in_vendita") return "#38BDF8";
  if ((p.rendimento_netto || 0) >= 5) return "#10B981";
  if ((p.rendimento_netto || 0) >= 3) return "#F59E0B";
  return "#94A3B8";
};

export default function Mappa() {
  const [props, setProps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient().get("/properties");
      setProps(r.data || []);
    } catch { toast.error("Errore caricamento"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const geocodeAll = async () => {
    setGeocoding(true);
    try {
      const r = await apiClient().post("/geo/geocode-properties");
      toast.success(`${r.data.geocoded} immobili posizionati su mappa`);
      await load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Errore geocoding"); }
    finally { setGeocoding(false); }
  };

  const propsConGeo = useMemo(() => props.filter(p => p.geo?.lat && p.geo?.lng), [props]);
  const propsSenzaGeo = useMemo(() => props.filter(p => !p.geo?.lat), [props]);

  // Centro mappa: media delle coordinate, fallback su Roma
  const center = useMemo(() => {
    if (propsConGeo.length === 0) return [41.9028, 12.4964];
    const avgLat = propsConGeo.reduce((s, p) => s + p.geo.lat, 0) / propsConGeo.length;
    const avgLng = propsConGeo.reduce((s, p) => s + p.geo.lng, 0) / propsConGeo.length;
    return [avgLat, avgLng];
  }, [propsConGeo]);

  // Zoom level: dipende dalla concentrazione
  const zoom = useMemo(() => {
    if (propsConGeo.length === 0) return 6;
    if (propsConGeo.length === 1) return 14;
    const lats = propsConGeo.map(p => p.geo.lat);
    const lngs = propsConGeo.map(p => p.geo.lng);
    const range = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    if (range < 0.05) return 14;   // stessa zona / quartiere
    if (range < 0.5) return 12;    // stessa città
    if (range < 2) return 9;       // regione
    return 6;                       // nazionale
  }, [propsConGeo]);

  return (
    <Layout
      title="Mappa Patrimonio"
      subtitle={loading ? "Caricamento…" : `${propsConGeo.length}/${props.length} immobili posizionati`}
      actions={propsSenzaGeo.length > 0 && (
        <button
          onClick={geocodeAll}
          disabled={geocoding}
          data-testid="geocode-btn"
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#2563EB] hover:opacity-90 disabled:opacity-50 text-white text-sm font-medium"
        >
          {geocoding ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
          {geocoding ? "Geocodifica in corso…" : `Posiziona ${propsSenzaGeo.length} immobili`}
        </button>
      )}
    >
      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-[#0066FF]"/></div>
      ) : (
        <>
          {propsConGeo.length === 0 && (
            <div className="mb-4 px-4 py-3 bg-[rgba(124,58,237,0.06)] border border-[rgba(124,58,237,0.25)] rounded-lg flex items-start gap-3" data-testid="mappa-empty-banner">
              <Info size={16} className="text-[#7C3AED] mt-0.5 shrink-0"/>
              <div className="text-sm text-[#475569]">
                <strong className="text-[#0F172A]">Nessun immobile posizionato.</strong> Clicca il bottone in alto a destra per geocodificare automaticamente gli indirizzi via OpenStreetMap (gratis, 1 secondo per immobile).
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <div className="xl:col-span-3 bg-[#FFFFFF] border border-[#E2E8F0] rounded-xl overflow-hidden" style={{ aspectRatio: "16/11" }} data-testid="mappa-container">
              <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
                <TileLayer
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {propsConGeo.map(p => (
                  <CircleMarker
                    key={p.id}
                    center={[p.geo.lat, p.geo.lng]}
                    radius={p.geo.approx_city ? 6 : 10}
                    fillColor={markerColor(p)}
                    color="#FFFFFF"
                    weight={2}
                    fillOpacity={p.geo.approx_city ? 0.5 : 0.85}
                    data-testid={`map-marker-${p.id}`}
                  >
                    <LTooltip direction="top" offset={[0, -6]} opacity={0.95}>
                      <strong>{p.nome}</strong>
                    </LTooltip>
                    <Popup>
                      <div className="min-w-[180px] text-xs">
                        <Link to={`/immobile/${p.id}`} className="font-semibold text-[#2563EB] hover:underline">{p.nome}</Link>
                        <div className="text-[#475569] mt-1">{p.indirizzo}, {p.citta}</div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-[#64748B]">Canone:</span>
                          <span className="tabular font-medium">{p.canone_mensile ? formatEur(p.canone_mensile)+"/m" : "Sfitto"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="text-[#64748B]">Netto:</span>
                          <span className="tabular font-medium text-[#059669]">{p.rendimento_netto ? p.rendimento_netto+"%" : "—"}</span>
                        </div>
                        {p.geo.approx_city && <div className="mt-1 text-[9px] text-[#B45309] italic">Posizione approssimata sulla città</div>}
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            <div className="space-y-4">
              <SectionCard testId="map-legend" title="Legenda">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#10B981]"/> Rendimento ≥ 5%</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#F59E0B]"/> Rendimento 3–5%</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#94A3B8]"/> Rendimento &lt; 3%</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#EF4444]"/> Sfitto</div>
                  <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#38BDF8]"/> In vendita</div>
                </div>
              </SectionCard>

              <SectionCard testId="map-list" title="Elenco geografico" subtitle={`${props.length} immobili`}>
                <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
                  {props.map(p => (
                    <Link key={p.id} to={`/immobile/${p.id}`} className="block p-2.5 rounded-lg border border-transparent hover:border-[#E2E8F0] hover:bg-[#F8FAFC] transition-colors">
                      <div className="flex items-start gap-2">
                        <MapPin size={12} className="mt-1 shrink-0" style={{ color: markerColor(p) }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-[#0F172A] truncate">{p.nome}</div>
                          <div className="text-[11px] text-[#475569] flex items-center gap-1 justify-between mt-0.5">
                            <span>{p.citta}</span>
                            <StatusBadge stato={p.stato} />
                          </div>
                          {!p.geo?.lat && <div className="text-[10px] text-[#94A3B8] italic mt-0.5">Non posizionato</div>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
