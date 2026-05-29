import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useNavigate } from "react-router-dom";
import { Building2, Sparkles, Lock, Mail, ChevronRight } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("ceo@controlroom.it");
  const [password, setPassword] = useState("demo1234");
  const [demos, setDemos] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) nav("/");
    axios.get(`${API}/auth/demo-accounts`).then(r => setDemos(r.data)).catch(() => {});
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Accesso effettuato");
      nav("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Errore di accesso");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden bg-[#FFFFFF] border-r border-[#E2E8F0]">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#0066FF]/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-[#10B981]/10 blur-3xl" />

        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0066FF] flex items-center justify-center">
              <Sparkles size={22} className="text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-lg">Control Room</div>
              <div className="text-[10px] uppercase tracking-widest text-[#64748B]">Real Estate · IT</div>
            </div>
          </div>

          <div>
            <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] text-[#0F172A]">
              Trasforma il tuo<br />
              patrimonio in un<br />
              <span className="text-[#0066FF]">portafoglio di investimento.</span>
            </h1>
            <p className="text-sm text-[#475569] mt-6 max-w-md leading-relaxed">
              Una centrale di controllo AI-driven per gestire affitti, vendite, ristrutturazioni e cash flow del tuo intero portafoglio immobiliare.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
              {[
                { v: "10", l: "Immobili" },
                { v: "€3,3M", l: "Capitale investito" },
                { v: "+18%", l: "ROI medio" },
              ].map((s) => (
                <div key={s.l} className="border-l border-[#E2E8F0] pl-3">
                  <div className="font-display text-xl font-bold text-[#0F172A] tabular">{s.v}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[#64748B]">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-[#64748B] flex items-center gap-2">
            <Building2 size={12} /> v0.1 · Mockup · Demo per validazione UI/UX
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#F8FAFC]">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-lg bg-[#0066FF] flex items-center justify-center">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="font-display font-bold">Control Room</div>
          </div>

          <h2 className="font-display text-3xl font-bold tracking-tight">Accedi</h2>
          <p className="text-sm text-[#475569] mt-2">Inserisci le tue credenziali per entrare nel pannello.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" data-testid="login-form">
            <div>
              <label className="text-xs uppercase tracking-wider text-[#475569] font-medium">Email</label>
              <div className="mt-1.5 relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  data-testid="login-email"
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg text-sm focus:border-[#0066FF] outline-none transition-colors"
                  placeholder="nome@azienda.it"
                />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[#475569] font-medium">Password</label>
              <div className="mt-1.5 relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  data-testid="login-password"
                  type="password" required value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-[#FFFFFF] border border-[#E2E8F0] rounded-lg text-sm focus:border-[#0066FF] outline-none transition-colors"
                />
              </div>
            </div>

            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-[#0066FF] hover:bg-[#2563EB] text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? "Accesso…" : "Entra nel pannello"}
              <ChevronRight size={16} />
            </button>
          </form>

          {demos.length > 0 && (
            <div className="mt-8 pt-6 border-t border-[#E2E8F0]">
              <div className="text-[10px] uppercase tracking-widest text-[#64748B] mb-3">Account demo (click per usare)</div>
              <div className="space-y-1.5">
                {demos.map((d) => (
                  <button
                    key={d.email}
                    onClick={() => { setEmail(d.email); setPassword(d.password); }}
                    data-testid={`demo-account-${d.role}`}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-[#FFFFFF] transition-colors text-left"
                  >
                    <div>
                      <div className="text-xs text-[#0F172A]">{d.name}</div>
                      <div className="text-[10px] text-[#64748B]">{d.email}</div>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-[#2563EB] border border-[rgba(0,102,255,0.3)] bg-[rgba(0,102,255,0.1)] rounded-full px-2 py-0.5">{d.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
