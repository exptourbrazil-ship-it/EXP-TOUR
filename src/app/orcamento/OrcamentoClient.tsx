"use client";

import { useMemo, useState } from "react";
import { useTenantBrand } from "@/components/TenantBrandProvider";
import { montarLinkSuporteWhatsApp } from "@/lib/viagem";
import {
  filtrarProgramas,
  montarOrcamento,
  converterBRL,
  planoPix,
  CATEGORY_LABEL,
  type ProgramaOrcavel,
} from "@/lib/orcamento";

type Props = {
  programas: ProgramaOrcavel[];
  cambio: Record<string, number>;
  dataCambio: string;
  paises: string[];
};

const NIGHT = "rgb(var(--brand))";
const BLUE = "var(--p-cta)";
const MIST = "var(--p-page)";

function fmtMoeda(v: number, cur: string): string {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: cur, maximumFractionDigits: 0 });
  } catch {
    return `${cur} ${Math.round(v).toLocaleString("pt-BR")}`;
  }
}
const fmtBRL = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
function fmtData(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function labelSemanas(w: number): string {
  return w === 1 ? "1 semana" : `${w} semanas`;
}

// Segundas-feiras entre hoje e o fim de 2027; feriado fixo (1 jan, 25/26 dez) -> terca.
function segundasDisponiveis(): string[] {
  const out: string[] = [];
  const hoje = new Date();
  const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const fim = new Date(Date.UTC(2027, 11, 31));
  while (d <= fim) {
    const mes = d.getUTCMonth() + 1, dia = d.getUTCDate();
    const feriado = (mes === 1 && dia === 1) || (mes === 12 && (dia === 25 || dia === 26));
    const escolhido = new Date(d);
    if (feriado) escolhido.setUTCDate(escolhido.getUTCDate() + 1);
    out.push(escolhido.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export default function OrcamentoClient({ programas, cambio, dataCambio, paises }: Props) {
  const brand = useTenantBrand();
  const marca = brand.email.brandName;
  const segundas = useMemo(() => segundasDisponiveis(), []);
  const hojeISO = new Date().toISOString().slice(0, 10);

  const [termo, setTermo] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [dataInicio, setDataInicio] = useState(segundas[0] ?? hojeISO);
  const [accomOn, setAccomOn] = useState(true);
  const [accomType, setAccomType] = useState<"residence" | "homestay">("homestay");
  const [insuranceOn, setInsuranceOn] = useState(true);
  const [country, setCountry] = useState("todos");
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<ProgramaOrcavel | null>(null);
  const [numParcelas, setNumParcelas] = useState<number | null>(null); // null = automatico

  const { resultados, foraDaFaixa } = useMemo(
    () => filtrarProgramas({ programas, termo, weeks, country }),
    [programas, termo, weeks, country],
  );

  function orcamentoDe(p: ProgramaOrcavel) {
    const o = montarOrcamento(p, { weeks, accomOn, accomType, insuranceOn });
    const vet = cambio[p.currency] || 0;
    return { o, vet, brl: converterBRL(o.totalMoeda, vet) };
  }

  const moedasCambio = Object.keys(cambio);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 64 }}>
      {/* Hero */}
      <section style={{ background: NIGHT, padding: "36px 32px 32px", color: "#FBF9F4" }}>
        <p style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)" }}>
          {marca} · Orçamento
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.15, maxWidth: 640, marginTop: 12 }}>
          Monte o orçamento do seu programa no exterior
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.42)", lineHeight: 1.6, maxWidth: 560, marginTop: 10 }}>
          Escolha tipo de curso, data e duração — a {marca} encontra as escolas e destinos que batem com seu
          critério, com o total em reais atualizado a cada escolha.
        </p>
        <div style={{ marginTop: 16, fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 10 }}>
            Câmbio do dia{dataCambio ? ` · ${fmtData(dataCambio)}` : ""}
          </span>
          {moedasCambio.length > 0 ? (
            moedasCambio.map((m) => (
              <span key={m}>{`${m} 1 = R$ ${(cambio[m]).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}</span>
            ))
          ) : (
            <span>referência de câmbio indisponível</span>
          )}
        </div>
      </section>

      {/* Corpo: form + resultados */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start", padding: "24px 32px" }}>
        {/* Coluna esquerda: formulário */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card n={1} titulo="O que você procura">
            <Label>Descreva o curso (opcional)</Label>
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Ex.: inglês para médicos, negócios, aviação…"
              style={inputStyle}
            />
            <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 8 }}>
              Deixe em branco para ver todos os cursos disponíveis.
            </p>
          </Card>

          <Card n={2} titulo="Data de início & duração">
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <Label>Início (segundas-feiras)</Label>
                <select value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={inputStyle}>
                  {segundas.map((d) => (
                    <option key={d} value={d}>{fmtData(d)}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <Label>Duração</Label>
                <select value={weeks} onChange={(e) => setWeeks(parseInt(e.target.value))} style={inputStyle}>
                  {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>{labelSemanas(w)}</option>
                  ))}
                </select>
              </div>
            </div>
            {foraDaFaixa.length > 0 ? (
              <div style={avisoStyle}>
                ⚠ Há {foraDaFaixa.length} programa(s) para esse termo em outras durações:{" "}
                {Array.from(new Set(foraDaFaixa.map((f) => `${f.minWeeks}–${f.maxWeeks} sem`))).join(", ")}.
              </div>
            ) : null}
          </Card>

          <Card n={3} titulo="Acomodação & seguro">
            <label style={checkRow}>
              <input type="checkbox" checked={accomOn} onChange={(e) => setAccomOn(e.target.checked)} style={{ accentColor: "#3b4dc9" }} />
              Incluir acomodação
            </label>
            {accomOn ? (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {(["homestay", "residence"] as const).map((t) => (
                  <button key={t} onClick={() => setAccomType(t)} style={chipStyle(accomType === t)}>
                    {t === "homestay" ? "Casa de Família" : "Residência Estudantil"}
                  </button>
                ))}
              </div>
            ) : null}
            <label style={{ ...checkRow, marginTop: 10 }}>
              <input type="checkbox" checked={insuranceOn} onChange={(e) => setInsuranceOn(e.target.checked)} style={{ accentColor: "#3b4dc9" }} />
              Incluir seguro saúde
            </label>
          </Card>

          <Card n={4} titulo="Destino">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => setCountry("todos")} style={chipStyle(country === "todos")}>🌐 Todos</button>
              {paises.map((p) => (
                <button key={p} onClick={() => setCountry(p)} style={chipStyle(country === p)}>{p}</button>
              ))}
            </div>
          </Card>
        </div>

        {/* Coluna direita: resultados (sticky) */}
        <aside style={{ position: "sticky", top: 16, background: NIGHT, borderRadius: 12, padding: 20, color: "#fff" }}>
          {resultados.length === 0 ? (
            <div style={{ padding: "32px 4px", textAlign: "center", color: "rgba(255,255,255,0.5)" }}>
              <p style={{ fontWeight: 500, color: "#fff", fontSize: 14.5 }}>Nenhum programa encontrado</p>
              <p style={{ fontSize: 12.5, marginTop: 6 }}>Ajuste o termo, a duração ou o destino.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.45)" }}>
                Resultados do orçamento
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, marginBottom: 12 }}>
                {resultados.length} programa(s) · início {fmtData(dataInicio)} · {labelSemanas(weeks)}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "70vh", overflowY: "auto" }}>
                {resultados.map((p) => {
                  const { o, brl, vet } = orcamentoDe(p);
                  const aberto = !!expandido[p.id];
                  return (
                    <div key={p.id} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16 }}>
                      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.35)" }}>
                        {p.city}, {p.country}
                      </p>
                      <p style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{p.courseName}</p>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{p.school} {p.flag}</p>
                      <p style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 8 }}>
                        {vet > 0 ? fmtBRL(brl) : fmtMoeda(o.totalMoeda, o.currency)}
                      </p>
                      {aberto ? (
                        <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                          {o.linhas.map((l) => (
                            <div key={l.chave} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                              <span>{l.rotulo}</span><span>{fmtMoeda(l.valor, o.currency)}</span>
                            </div>
                          ))}
                          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.12)", marginTop: 6, fontWeight: 500 }}>
                            <span>Total ({o.currency})</span><span>{fmtMoeda(o.totalMoeda, o.currency)}</span>
                          </div>
                        </div>
                      ) : null}
                      <button onClick={() => setExpandido((s) => ({ ...s, [p.id]: !aberto }))} style={btnGhost}>
                        {aberto ? "Ver menos" : "Saber mais"}
                      </button>
                      <button onClick={() => { setModal(p); setNumParcelas(null); }} style={btnPrimary}>
                        Ver orçamento detalhado
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </aside>
      </div>

      {modal ? (
        <ModalOrcamento
          programa={modal}
          weeks={weeks}
          accomOn={accomOn}
          accomType={accomType}
          insuranceOn={insuranceOn}
          dataInicio={dataInicio}
          hojeISO={hojeISO}
          vet={cambio[modal.currency] || 0}
          numParcelas={numParcelas}
          setNumParcelas={setNumParcelas}
          supportWhatsApp={brand.supportWhatsApp}
          marca={marca}
          onFechar={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function ModalOrcamento(props: {
  programa: ProgramaOrcavel; weeks: number; accomOn: boolean; accomType: "residence" | "homestay";
  insuranceOn: boolean; dataInicio: string; hojeISO: string; vet: number;
  numParcelas: number | null; setNumParcelas: (n: number | null) => void;
  supportWhatsApp: string; marca: string; onFechar: () => void;
}) {
  const { programa: p } = props;
  const o = montarOrcamento(p, { weeks: props.weeks, accomOn: props.accomOn, accomType: props.accomType, insuranceOn: props.insuranceOn });
  const brl = converterBRL(o.totalMoeda, props.vet);
  const plano = planoPix({ totalBRL: brl, dataInicioISO: props.dataInicio, hojeISO: props.hojeISO, numParcelasForcado: props.numParcelas });

  const resumo = `Olá! Tenho interesse no programa "${p.courseName}" na ${p.school} (${p.city}, ${p.country}), ${props.weeks} semanas a partir de ${fmtData(props.dataInicio)}. Total estimado: ${props.vet > 0 ? fmtBRL(brl) : fmtMoeda(o.totalMoeda, o.currency)}.`;
  const waLink = (msg: string) => {
    const base = montarLinkSuporteWhatsApp(props.supportWhatsApp);
    return base + (base.includes("?") ? "&" : "?") + "text=" + encodeURIComponent(msg);
  };

  return (
    <div onClick={props.onFechar} style={{ position: "fixed", inset: 0, background: "rgba(15,16,32,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 560, width: "100%", maxHeight: "88vh", overflowY: "auto", padding: 32, color: "var(--p-ink)", fontFamily: "var(--p-body)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9A9DB0" }}>Orçamento detalhado</p>
            <h2 style={{ fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em" }}>{p.courseName}</h2>
            <p style={{ fontSize: 13, color: "var(--p-muted)" }}>{p.school} {p.flag} · {p.city}, {p.country}</p>
          </div>
          <button onClick={props.onFechar} style={{ background: MIST, border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", color: "var(--p-muted)" }}>✕</button>
        </div>

        {/* Itemizado */}
        <div style={{ background: MIST, borderRadius: 12, padding: 18, marginTop: 16 }}>
          {o.linhas.map((l) => (
            <div key={l.chave} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}>
              <span style={{ color: "var(--p-muted)" }}>{l.rotulo}</span>
              <span style={{ fontWeight: 500 }}>{fmtMoeda(l.valor, o.currency)}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #DCDCE8", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: "var(--p-muted)" }}>
              Total ({o.currency}){props.vet > 0 ? ` · 1 ${o.currency} = R$ ${props.vet.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
            </span>
            <span style={{ fontSize: 22, fontWeight: 500 }}>{props.vet > 0 ? fmtBRL(brl) : fmtMoeda(o.totalMoeda, o.currency)}</span>
          </div>
        </div>

        {/* Plano PIX editavel */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 15, fontWeight: 500 }}>Plano de pagamento via PIX</h3>
            <select
              value={props.numParcelas ?? "auto"}
              onChange={(e) => props.setNumParcelas(e.target.value === "auto" ? null : parseInt(e.target.value))}
              style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 12 }}
            >
              <option value="auto">Parcelas: automático</option>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>
              ))}
            </select>
          </div>
          {props.vet > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {plano.parcelas.map((parc, i) => (
                <div key={i} style={{ background: MIST, borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span style={{ color: "var(--p-muted)" }}>{parc.rotulo} · vence {fmtData(parc.vencimento)}</span>
                  <span style={{ fontWeight: 500 }}>{fmtBRL(parc.valor)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 8 }}>Plano em reais indisponível sem câmbio.</p>
          )}
        </div>

        {/* Escola / curso */}
        <div style={{ marginTop: 20, fontSize: 13 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Escola, curso e acomodação</h3>
          {[
            ["Escola", p.school],
            ["Cidade / país", `${p.city}, ${p.country}`],
            ["Curso", p.courseName],
            ["Categoria", CATEGORY_LABEL[p.courseType] || p.courseType],
            ...(props.accomOn ? [["Acomodação", props.accomType === "homestay" ? "Casa de família" : "Residência estudantil"]] : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span style={{ color: "var(--p-muted)" }}>{k}</span><span style={{ fontWeight: 500 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Botoes: encaminhar + fechar */}
        <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <a href={waLink(resumo + " Pode me ajudar a fechar?")} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, minWidth: 200, background: BLUE, color: "#fff", borderRadius: 6, padding: "11px 14px", textAlign: "center", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
            Quero fechar este programa
          </a>
          <a href={waLink(resumo)} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, minWidth: 160, background: "#fff", color: "var(--p-ink)", border: "1px solid #DCDCE8", borderRadius: 6, padding: "11px 14px", textAlign: "center", fontSize: 13, fontWeight: 500, textDecoration: "none" }}>
            Falar com a {props.marca}
          </a>
        </div>
        <p style={{ fontSize: 11, color: "var(--p-muted)", marginTop: 10 }}>
          O total em reais é uma estimativa pela cotação do dia e é confirmado na geração de cada PIX.
        </p>
      </div>
    </div>
  );
}

// ── UI helpers ──
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid #DCDCE8", borderRadius: 6, padding: "9px 12px", fontSize: 13.5, marginTop: 6, background: "#fff", color: "var(--p-ink)", fontFamily: "var(--p-body)" };
const checkRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--p-ink)", border: "1px solid #EAEAF2", borderRadius: 8, padding: "12px 14px", cursor: "pointer" };
const avisoStyle: React.CSSProperties = { background: "#FFF7E6", border: "1px solid #F5DFA0", color: "#B8860B", fontSize: 11.5, borderRadius: 6, padding: "8px 10px", marginTop: 10 };
const btnGhost: React.CSSProperties = { width: "100%", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.7)", borderRadius: 6, padding: "8px 12px", fontSize: 12, fontWeight: 500, marginTop: 10, cursor: "pointer" };
const btnPrimary: React.CSSProperties = { width: "100%", background: BLUE, color: "#fff", border: "none", borderRadius: 6, padding: "9px 14px", fontSize: 12.5, fontWeight: 500, marginTop: 8, cursor: "pointer" };

function Card({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(15,16,32,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ width: 24, height: 24, borderRadius: "50%", background: MIST, color: BLUE, fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</span>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--p-ink)" }}>{titulo}</h2>
      </div>
      {children}
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9A9DB0", fontWeight: 500 }}>{children}</span>;
}
function chipStyle(sel: boolean): React.CSSProperties {
  return { border: `1.5px solid ${sel ? "#3b4dc9" : "#DCDCE8"}`, background: sel ? "#EEF0FF" : "#fff", color: "var(--p-ink)", borderRadius: 8, padding: "10px 16px", fontSize: 13.5, fontWeight: 500, cursor: "pointer" };
}
