import { Navigate, useParams } from "react-router-dom";

/**
 * Deep-link compatto verso un deal Pipeline.
 *  /d/AB1234       → /pipeline?deal=DEAL-AB1234
 *  /d/DEAL-AB1234  → /pipeline?deal=DEAL-AB1234   (forma estesa accettata)
 */
export default function DealShortLink() {
  const { short } = useParams();
  if (!short) return <Navigate to="/pipeline" replace />;
  const raw = decodeURIComponent(short).toUpperCase().trim();
  const dealId = raw.startsWith("DEAL-") ? raw : `DEAL-${raw}`;
  return <Navigate to={`/pipeline?deal=${encodeURIComponent(dealId)}`} replace />;
}
