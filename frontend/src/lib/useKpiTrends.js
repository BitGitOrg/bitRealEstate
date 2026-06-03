import { useEffect, useState } from "react";
import { apiClient } from "./auth";

let _cache = null;
let _ts = 0;
const TTL = 60 * 1000; // 60s cache per evitare hit ripetuti

/**
 * Hook per recuperare gli ultimi 6 mesi di trend per i KPI sparkline.
 * Restituisce { trends, loading }
 * trends ha chiavi: ricavi_affitti, incassato, canone_atteso, tasso_occupazione,
 * morosi, costi, cash_flow, valore_patrimonio, debito_residuo, ricavi
 */
export function useKpiTrends() {
  const [trends, setTrends] = useState(_cache);
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    const now = Date.now();
    if (_cache && (now - _ts) < TTL) {
      setTrends(_cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await apiClient().get("/kpi/trends");
        if (!cancelled) {
          _cache = r.data;
          _ts = Date.now();
          setTrends(r.data);
        }
      } catch {
        // fallback: lascia trends a null → MiniSparkline genererà sintetici
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { trends, loading };
}
