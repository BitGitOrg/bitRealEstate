import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Layout } from "../components/layout/Layout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { TrendingUp, Banknote, Calculator } from "lucide-react";
import ForecastSimple from "./ForecastSimple";
import MortgageFeasibility from "./MortgageFeasibility";
import Simulatore from "./Simulatore";

const TAB_KEYS = ["acquisto", "mutuo", "deal"];

const SUBTITLES = {
  acquisto: "Descrivi il tuo piano o usa i parametri rapidi · simulazione + grafici + report",
  mutuo: "Senior Credit Officer AI: DSCR · LTV · NOI · rata/reddito sui tuoi bilanci reali",
  deal: "Valuta un singolo immobile candidato all'acquisto con AI Deal Score",
};

export default function ForecastWrapper() {
  const location = useLocation();
  const navigate = useNavigate();
  const sp = new URLSearchParams(location.search);
  const requested = sp.get("tab");
  const initial = TAB_KEYS.includes(requested) ? requested : "acquisto";
  const [tab, setTab] = useState(initial);

  const onChange = (v) => {
    if (!TAB_KEYS.includes(v)) v = "acquisto";
    setTab(v);
    const q = v === "acquisto" ? "" : `?tab=${v}`;
    navigate(`/forecast${q}`, { replace: true });
  };

  return (
    <Layout
      title="Simulatore"
      subtitle={SUBTITLES[tab] || "Forecast portfolio · fattibilità mutuo · deal singolo"}
    >
      <Tabs value={tab} onValueChange={onChange} className="w-full">
        <TabsList data-testid="forecast-wrapper-tabs" className="mb-4 flex flex-wrap gap-1">
          <TabsTrigger value="acquisto" data-testid="tab-fc-acquisto">
            <TrendingUp size={14} className="mr-2"/> Piano portfolio
          </TabsTrigger>
          <TabsTrigger value="mutuo" data-testid="tab-fc-mutuo">
            <Banknote size={14} className="mr-2"/> Fattibilità mutuo
          </TabsTrigger>
          <TabsTrigger value="deal" data-testid="tab-fc-deal">
            <Calculator size={14} className="mr-2"/> Deal singolo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="acquisto" className="mt-0">
          <ForecastSimple embedded />
        </TabsContent>
        <TabsContent value="mutuo" className="mt-0">
          <MortgageFeasibility />
        </TabsContent>
        <TabsContent value="deal" className="mt-0">
          <Simulatore embedded />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
