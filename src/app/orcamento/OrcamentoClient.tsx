"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenantBrand } from "@/components/TenantBrandProvider";
import { filtrarProgramas, montarOrcamento, converterBRL, type ProgramaOrcavel } from "@/lib/orcamento";
import { fmtMoeda, fmtBRL, fmtData, labelSemanas, segundasDisponiveis, encodeParams } from "./shared";

type Props = {
  programas: ProgramaOrcavel[];
  cambio: Record<string, number>;
  paises: string[];
};

const NIGHT = "rgb(var(--brand))";
const BLUE = "var(--p-cta)";
const MIST = "var(--p-page)";

export default function OrcamentoClient({ programas, cambio, paises }: Props) {
  const brand = useTenantBrand();
  const marca = brand.email.brandName;
  const router = useRouter();
  const segundas = useMemo(() => segundasDisponiveis(), []);

  const [termo, setTermo] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [inicio, setInicio] = useState(segundas[0] ?? new Date().toISOString().slice(0, 10));
  const [accomOn, setAccomOn] = useState(true);
  const [accomTipo, setAccomTipo] = useState<"residence" | "homestay">("homestay");
  const [seguroOn, setSeguroOn] = useState(true);
  const [country, setCountry] = useState("todos");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  const { resultados, foraDaFaixa } = useMemo(
    () => filtrarProgramas({ programas, termo, weeks, country }),
    [programas, termo, weeks, country],
  );

  function orcamentoDe(p: ProgramaOrcavel) {
    const o = montarOrcamento(p, { weeks, accomOn, accomType: accomTipo, insuranceOn: seguroOn });
    const vet = cambio[p.currency] || 0;
    return { o, vet, brl: converterBRL(o.totalMoeda, vet) };
  }
  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function comparar() {
    if (sel.size === 0) return;
    const qs = encodeParams({ ids: [...sel], weeks, inicio, accom: accomOn, accomTipo, seguro: seguroOn });
    router.push(`/orcamento/comparar?${qs}`);
  }

  return (
    <div>
      {/* Header — busca (search engine) */}
      <header style={{ background: NIGHT, color: "#FBF9F4", padding: "18px 24px", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <p style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 12 }}>{marca} · Orçamento</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: 240 }}>
              <HdrLabel>O que você procura</HdrLabel>
              <input value={termo} onChange={(e) => setTermo(e.target.value)}
                placeholder="Ex.: inglês para médicos, negócios, aviação…" style={inputStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 170 }}>
              <HdrLabel>Data de início</HdrLabel>
              <select value={inicio} onChange={(e) => setInicio(e.target.value)} style={inputStyle}>
                {segundas.map((d) => <option key={d} value={d}>{fmtData(d)}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <HdrLabel>Duração</HdrLabel>
              <select value={weeks} onChange={(e) => setWeeks(parseInt(e.target.value))} style={inputStyle}>
                {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{labelSemanas(w)}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "260px 1fr", gap: 24, padding: "24px", alignItems: "start" }}>
        {/* Coluna esquerda — filtros */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: "sticky", top: 120 }}>
          <FiltroCard titulo="Acomodação & seguro">
            <label style={checkRow}>
              <input type="checkbox" checked={accomOn} onChange={(e) => setAccomOn(e.target.checked)} style={{ accentColor: "#3b4dc9" }} />
              Incluir acomodação
            </label>
            {accomOn ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {(["homestay", "residence"] as const).map((t) => (
                  <button key={t} onClick={() => setAccomTipo(t)} style={chipStyle(accomTipo === t)}>
                    {t === "homestay" ? "Casa de família" : "Residência"}
                  </button>
                ))}
              </div>
            ) : null}
            <label style={{ ...checkRow, marginTop: 10 }}>
              <input type="checkbox" checked={seguroOn} onChange={(e) => setSeguroOn(e.target.checked)} style={{ accentColor: "#3b4dc9" }} />
              Incluir seguro saúde
            </label>
          </FiltroCard>

          <FiltroCard titulo="Destino">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={() => setCountry("todos")} style={chipStyle(country === "todos")}>🌐 Todos os destinos</button>
              {paises.map((p) => <button key={p} onClick={() => setCountry(p)} style={chipStyle(country === p)}>{p}</button>)}
            </div>
          </FiltroCard>
        </aside>

        {/* Centro — resultados */}
        <main>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 500, color: "var(--p-ink)" }}>
              {resultados.length} programa(s) · início {fmtData(inicio)} · {labelSemanas(weeks)}
            </h1>
          </div>

          {foraDaFaixa.length > 0 ? (
            <div style={avisoStyle}>
              ⚠ Há {foraDaFaixa.length} programa(s) para esse termo em outras durações:{" "}
              {Array.from(new Set(foraDaFaixa.map((f) => `${f.minWeeks}–${f.maxWeeks} sem`))).join(", ")}.
            </div>
          ) : null}

          {resultados.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 32, textAlign: "center", color: "var(--p-muted)" }}>
              Nenhum programa encontrado. Ajuste o termo, a duração ou o destino.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {resultados.map((p) => {
                const { o, brl, vet } = orcamentoDe(p);
                const aberto = !!expandido[p.id];
                const selecionado = sel.has(p.id);
                return (
                  <div key={p.id} style={{ background: "#fff", border: `1.5px solid ${selecionado ? "#3b4dc9" : "#EAEAF2"}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 4px rgba(15,16,32,0.06)" }}>
                    <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9A9DB0" }}>{p.city}, {p.country}</p>
                    <p style={{ fontSize: 15, fontWeight: 500, color: "var(--p-ink)", marginTop: 2 }}>{p.courseName}</p>
                    <p style={{ fontSize: 12, color: "var(--p-muted)" }}>{p.school} {p.flag}</p>
                    <p style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--p-ink)", marginTop: 8 }}>
                      {vet > 0 ? fmtBRL(brl) : fmtMoeda(o.totalMoeda, o.currency)}
                    </p>
                    {aberto ? (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--p-muted)" }}>
                        {o.linhas.map((l) => (
                          <div key={l.chave} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                            <span>{l.rotulo}</span><span>{fmtMoeda(l.valor, o.currency)}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #eee", marginTop: 4, paddingTop: 4, fontWeight: 500, color: "var(--p-ink)" }}>
                          <span>Total ({o.currency})</span><span>{fmtMoeda(o.totalMoeda, o.currency)}</span>
                        </div>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={() => toggle(p.id)} style={selecionado ? btnSelOn : btnSelOff}>
                        {selecionado ? "✓ Selecionado" : "Selecionar"}
                      </button>
                      <button onClick={() => setExpandido((s) => ({ ...s, [p.id]: !aberto }))} style={btnLink}>
                        {aberto ? "menos" : "detalhes"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Barra flutuante de comparacao */}
      {sel.size > 0 ? (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: NIGHT, color: "#fff", padding: "14px 24px", display: "flex", justifyContent: "center", zIndex: 30 }}>
          <div style={{ maxWidth: 1200, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 14 }}>{sel.size} programa(s) selecionado(s)</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setSel(new Set())} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.8)", borderRadius: 6, padding: "9px 14px", fontSize: 13, cursor: "pointer" }}>Limpar</button>
              <button onClick={comparar} style={{ background: BLUE, color: "#fff", border: "none", borderRadius: 6, padding: "9px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                Comparar e orçar →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid #DCDCE8", borderRadius: 6, padding: "9px 12px", fontSize: 13.5, marginTop: 6, background: "#fff", color: "#0f1020", fontFamily: "var(--p-body)" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-ink)", cursor: "pointer" };
const avisoStyle: React.CSSProperties = { background: "#FFF7E6", border: "1px solid #F5DFA0", color: "#B8860B", fontSize: 12, borderRadius: 8, padding: "10px 12px", marginBottom: 12 };
const btnSelOn: React.CSSProperties = { flex: 1, background: BLUE, color: "#fff", border: "none", borderRadius: 6, padding: "8px 10px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
const btnSelOff: React.CSSProperties = { flex: 1, background: "#fff", color: "var(--p-ink)", border: "1px solid #DCDCE8", borderRadius: 6, padding: "8px 10px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" };
const btnLink: React.CSSProperties = { background: "transparent", border: "none", color: "var(--p-muted)", fontSize: 12, cursor: "pointer", textDecoration: "underline" };

function HdrLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{children}</span>;
}
function FiltroCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 16 }}>
      <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--p-muted)", fontWeight: 500, marginBottom: 10 }}>{titulo}</p>
      {children}
    </div>
  );
}
function chipStyle(sel: boolean): React.CSSProperties {
  return { textAlign: "left", border: `1.5px solid ${sel ? "#3b4dc9" : "#DCDCE8"}`, background: sel ? "#EEF0FF" : "#fff", color: "var(--p-ink)", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 500, cursor: "pointer" };
}
