import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Impostazioni from "./Impostazioni";
import ImportCenter from "./ImportCenter";
import DataLineage from "./DataLineage";
import Manuale from "./Manuale";
import { Layout } from "../components/layout/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Settings as SettingsIcon, Database, GitBranch, BookOpen } from "lucide-react";

/**
 * Wrapper che contiene "Impostazioni" + "Centro Import" + "Data Lineage" + "Manuale"
 * sotto un'unica route /impostazioni.
 * - /impostazioni            → tab Configurazione
 * - /impostazioni?tab=import → Centro Import
 * - /impostazioni?tab=lineage → Data Lineage
 * - /impostazioni?tab=manuale → Manuale d'uso
 */
const TAB_KEYS = ["config", "import", "lineage", "manuale"];

const SUBTITLES = {
  config: "Configurazione società, fiscale, soglie e automazioni",
  import: "Carica anagrafica immobili, bilanci e estratti conto bancari",
  lineage: "Mappa di tutti i KPI: formula, endpoint API e collection MongoDB",
  manuale: "Guida completa con workflow tipico e screenshot",
};

export default function ImpostazioniWrapper() {
  const location = useLocation();
  const navigate = useNavigate();
  const sp = new URLSearchParams(location.search);
  const requested = sp.get("tab");
  const initial = TAB_KEYS.includes(requested) ? requested : "config";
  const [tab, setTab] = useState(initial);

  const onChange = (v) => {
    if (!TAB_KEYS.includes(v)) v = "config";
    setTab(v);
    const q = v === "config" ? "" : `?tab=${v}`;
    navigate(`/impostazioni${q}`, { replace: true });
  };

  return (
    <Layout title="Impostazioni" subtitle={SUBTITLES[tab] || "Configurazione + risorse"}>
      <Tabs value={tab} onValueChange={onChange} className="w-full">
        <TabsList data-testid="impostazioni-wrapper-tabs" className="mb-4 grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="config" data-testid="tab-imp-config" className="text-xs sm:text-sm py-2 px-1 sm:px-3">
            <SettingsIcon size={14} className="mr-1 sm:mr-1.5 shrink-0"/>
            <span className="hidden sm:inline">Configurazione</span>
            <span className="sm:hidden">Config</span>
          </TabsTrigger>
          <TabsTrigger value="import" data-testid="tab-imp-import" className="text-xs sm:text-sm py-2 px-1 sm:px-3">
            <Database size={14} className="mr-1 sm:mr-1.5 shrink-0"/>
            <span className="hidden sm:inline">Centro Import</span>
            <span className="sm:hidden">Import</span>
          </TabsTrigger>
          <TabsTrigger value="lineage" data-testid="tab-imp-lineage" className="text-xs sm:text-sm py-2 px-1 sm:px-3">
            <GitBranch size={14} className="mr-1 sm:mr-1.5 shrink-0"/>
            <span className="hidden sm:inline">Data Lineage</span>
            <span className="sm:hidden">Lineage</span>
          </TabsTrigger>
          <TabsTrigger value="manuale" data-testid="tab-imp-manuale" className="text-xs sm:text-sm py-2 px-1 sm:px-3">
            <BookOpen size={14} className="mr-1 sm:mr-1.5 shrink-0"/>
            <span className="hidden sm:inline">Manuale d'uso</span>
            <span className="sm:hidden">Guida</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-0">
          <Impostazioni embedded />
        </TabsContent>
        <TabsContent value="import" className="mt-0">
          <ImportCenter embedded />
        </TabsContent>
        <TabsContent value="lineage" className="mt-0">
          <DataLineage embedded />
        </TabsContent>
        <TabsContent value="manuale" className="mt-0">
          <Manuale embedded />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
