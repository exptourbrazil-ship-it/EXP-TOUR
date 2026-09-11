"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenantBrand } from "@/components/TenantBrandProvider";
import { montarOrcamento, converterBRL, planoPix, CATEGORY_LABEL, type ProgramaOrcavel } from "@/lib/orcamento";
import { fmtMoeda, fmtBRL, fmtData, labelSemanas, segundasDisponiveis, encodeParams, type ParamsOrcamento } from "../shared";

type Props = {
  programas: ProgramaOrcavel[];
  cambio: Record<string, number>;
  dataCambio: string;
  params: ParamsOrcamento;
};

const NIGHT = "rgb(var(--brand))";
const BLUE = "var(--p-cta)";
const MIST = "var(--p-page)";

export default function CompararClient({ programas, cambio, dataCambio, params }: Props) {
  const brand = useTenantBrand();
  const router = useRouter();
  const segundas = useMemo(() => segundasDisponiveis(), []);
  const hojeISO = new Date().toISOString().slice(0, 10);

  // Controles COMUNS do simulador (aplicados a todos os programas).
  const [inicio, setInicio] = useState(params.inicio);
  const [numParcelas, setNumParcelas] = useState<number | null>(null); // null = automatico
  const [copiado, setCopiado] = useState(false);

  const weeks = params.weeks;
  const opts = { weeks, accomOn: params.accom, accomType: params.accomTipo, insuranceOn: params.seguro };

  function dados(p: ProgramaOrcavel) {
    const o = montarOrcamento(p, opts);
    const vet = cambio[p.currency] || 0;
    const brl = converterBRL(o.totalMoeda, vet);
    const plano = planoPix({ totalBRL: brl, dataInicioISO: inicio, hojeISO, numParcelasForcado: numParcelas });
    return { o, vet, brl, plano };
  }

  async function compartilhar() {
    // O proprio link desta tela E o orcamento compartilhavel (cambio recarrega no
    // dia em que for aberto). Copia a URL atual (com a data de inicio escolhida).
    const url = new URL(window.location.href);
    url.searchParams.set("inicio", inicio);
    const link = url.toString();
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copie o link do orçamento:", link);
    }
  }
  function encaminhar() {
    const qs = encodeParams({ ...params, inicio });
    router.push(`/orcamento/checkout?${qs}&parcelas=${numParcelas ?? "auto"}`);
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px", paddingBottom: 96 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <a href="/orcamento" style={{ fontSize: 13, color: "var(--p-cta)", textDecoration: "none" }}>← Voltar à busca</a>
          <h1 style={{ fontSize: 24, fontWeight: 500, color: "var(--p-ink)", marginTop: 6 }}>Seu orçamento</h1>
          <p style={{ fontSize: 13, color: "var(--p-muted)" }}>
            {programas.length} programa(s) · {labelSemanas(weeks)} · câmbio do dia {dataCambio ? fmtData(dataCambio) : "atual"}
          </p>
        </div>
      </div>

      {/* Programas lado a lado */}
      <div style={{ display: "flex", gap: 16, overflowX: "auto", marginTop: 20, paddingBottom: 8, alignItems: "stretch" }}>
        {programas.map((p) => {
          const { o, vet, brl } = dados(p);
          return (
            <div key={p.id} style={{ flex: "1 0 300px", maxWidth: 380, background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(15,16,32,0.06)" }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9A9DB0" }}>{p.city}, {p.country}</p>
              <h2 style={{ fontSize: 17, fontWeight: 500, color: "var(--p-ink)", marginTop: 2 }}>{p.courseName}</h2>
              <p style={{ fontSize: 12.5, color: "var(--p-muted)" }}>{p.school} {p.flag} · {CATEGORY_LABEL[p.courseType] || p.courseType}</p>

              <div style={{ background: MIST, borderRadius: 10, padding: 14, marginTop: 12 }}>
                {o.linhas.map((l) => (
                  <div key={l.chave} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
                    <span style={{ color: "var(--p-muted)" }}>{l.rotulo}</span>
                    <span style={{ fontWeight: 500, color: "var(--p-ink)" }}>{fmtMoeda(l.valor, o.currency)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #DCDCE8", marginTop: 6, paddingTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>
                    Total ({o.currency}){vet > 0 ? ` · 1 ${o.currency} = R$ ${vet.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 500, color: "var(--p-ink)" }}>{vet > 0 ? fmtBRL(brl) : fmtMoeda(o.totalMoeda, o.currency)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulador de parcelas — controles comuns */}
      <section style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 20, marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--p-ink)" }}>Simulador de parcelas (PIX)</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "var(--p-muted)" }}>
              Início do programa
              <select value={inicio} onChange={(e) => setInicio(e.target.value)} style={selMini}>
                {segundas.map((d) => <option key={d} value={d}>{fmtData(d)}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--p-muted)" }}>
              Parcelas
              <select value={numParcelas ?? "auto"} onChange={(e) => setNumParcelas(e.target.value === "auto" ? null : parseInt(e.target.value))} style={selMini}>
                <option value="auto">Automático</option>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `${n}x`}</option>)}
              </select>
            </label>
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 6 }}>
          Entrada no fim do mês + parcelas mensais, a última até 30 dias antes do início. Valores em reais pela cotação do dia.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
          {programas.map((p) => {
            const { plano, vet } = dados(p);
            return (
              <div key={p.id}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--p-ink)", marginBottom: 8 }}>{p.courseName} <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>· {p.school}</span></p>
                {vet > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {plano.parcelas.map((parc, i) => (
                      <div key={i} style={{ background: MIST, borderRadius: 8, padding: "8px 10px", display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <span style={{ color: "var(--p-muted)" }}>{parc.rotulo} · {fmtData(parc.vencimento)}</span>
                        <span style={{ fontWeight: 500, color: "var(--p-ink)" }}>{fmtBRL(parc.valor)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--p-muted)" }}>Câmbio indisponível para {p.currency}.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Botoes */}
      <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button onClick={encaminhar} style={{ flex: 1, minWidth: 220, background: BLUE, color: "#fff", border: "none", borderRadius: 8, padding: "14px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          Encaminhar matrícula →
        </button>
        <button onClick={compartilhar} style={{ flex: 1, minWidth: 200, background: "#fff", color: "var(--p-ink)", border: "1px solid #DCDCE8", borderRadius: 8, padding: "14px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          {copiado ? "✓ Link copiado" : "Compartilhar orçamento"}
        </button>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 10 }}>
        O link compartilhado abre este mesmo orçamento e atualiza a cotação para o câmbio do dia em que for aberto. O valor final em reais é confirmado na geração de cada PIX.
      </p>
    </div>
  );
}

const selMini: React.CSSProperties = { display: "block", marginTop: 4, border: "1px solid #DCDCE8", borderRadius: 6, padding: "7px 10px", fontSize: 13, background: "#fff", color: "var(--p-ink)", fontFamily: "var(--p-body)" };
