import "@/index.css";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Patrimonio from "@/pages/Patrimonio";
import SchedaImmobile from "@/pages/SchedaImmobile";
import Operazioni from "@/pages/Operazioni";
import Affitti from "@/pages/Affitti";
import Vendite from "@/pages/Vendite";
import Lavori from "@/pages/Lavori";
import CostiRicavi from "@/pages/CostiRicavi";
import Mutui from "@/pages/Mutui";
import CashFlow from "@/pages/CashFlow";
import KPI from "@/pages/KPI";
import Simulatore from "@/pages/Simulatore";
import AIAutopilot from "@/pages/AIAutopilot";
import AlertCenter from "@/pages/AlertCenter";
import Documenti from "@/pages/Documenti";
import Report from "@/pages/Report";
import Impostazioni from "@/pages/Impostazioni";
import Mappa from "@/pages/Mappa";

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#9CA3AF]">Caricamento…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/patrimonio" element={<Protected><Patrimonio /></Protected>} />
            <Route path="/immobile/:id" element={<Protected><SchedaImmobile /></Protected>} />
            <Route path="/operazioni" element={<Protected><Operazioni /></Protected>} />
            <Route path="/affitti" element={<Protected><Affitti /></Protected>} />
            <Route path="/vendite" element={<Protected><Vendite /></Protected>} />
            <Route path="/lavori" element={<Protected><Lavori /></Protected>} />
            <Route path="/costi-ricavi" element={<Protected><CostiRicavi /></Protected>} />
            <Route path="/mutui" element={<Protected><Mutui /></Protected>} />
            <Route path="/cash-flow" element={<Protected><CashFlow /></Protected>} />
            <Route path="/kpi" element={<Protected><KPI /></Protected>} />
            <Route path="/simulatore" element={<Protected><Simulatore /></Protected>} />
            <Route path="/ai-autopilot" element={<Protected><AIAutopilot /></Protected>} />
            <Route path="/alert-center" element={<Protected><AlertCenter /></Protected>} />
            <Route path="/documenti" element={<Protected><Documenti /></Protected>} />
            <Route path="/report" element={<Protected><Report /></Protected>} />
            <Route path="/impostazioni" element={<Protected><Impostazioni /></Protected>} />
            <Route path="/mappa" element={<Protected><Mappa /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" theme="dark" />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
