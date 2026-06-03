import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Impostazioni from "./Impostazioni";
import ImportCenter from "./ImportCenter";
import { Layout } from "../components/layout/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Settings as SettingsIcon, Database } from "lucide-react";

/**
 * Wrapper che contiene "Impostazioni" e "Centro Import" sotto un'unica route /impostazioni.
 * - Default: tab Impostazioni
 * - /impostazioni?tab=import → tab Centro Import
 * Mantengo i 2 componenti originali integralmente per minima invasività.
 */
export default function ImpostazioniWrapper() {
  const location = useLocation();
  const navigate = useNavigate();
  const sp = new URLSearchParams(location.search);
  const initial = sp.get("tab") === "import" ? "import" : "config";
  const [tab, setTab] = useState(initial);

  const onChange = (v) => {
    setTab(v);
    const q = v === "import" ? "?tab=import" : "";
    navigate(`/impostazioni${q}`, { replace: true });
  };

  return (
    <Layout title="Impostazioni" subtitle="Configurazione + import dati">
      <Tabs value={tab} onValueChange={onChange} className="w-full">
        <TabsList data-testid="impostazioni-wrapper-tabs" className="mb-4">
          <TabsTrigger value="config" data-testid="tab-imp-config">
            <SettingsIcon size={14} className="mr-2"/> Configurazione
          </TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-imp-import">
            <Database size={14} className="mr-2"/> Centro Import
          </TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-0">
          <Impostazioni embedded />
        </TabsContent>
        <TabsContent value="import" className="mt-0">
          <ImportCenter embedded />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
