"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTenantBrand } from "@/components/TenantBrandProvider";
import {
  montarOrcamento, converterBRL, calcularNTrimestre, trimestresDisponiveis, simularParcelamento,
  CATEGORY_LABEL, type ProgramaOrcavel,
} from "@/lib/orcamento";
import { fmtMoeda, fmtBRL, labelSemanas, encodeParams, type ParamsOrcamento } from "../shared";

type Props = {
  programas: ProgramaOrcavel[];
  cambio: Record<string, number>;
  dataCambio: string;
  params: ParamsOrcamento;
};

const NIGHT = "rgb(var(--brand))";
const BLUE = "var(--p-cta)";
const MIST = "var(--p-page)";
const CAIXA_PARCELA = "rgba(15,16,32,0.04)";

const MOEDA_NOME: Record<string, string> = { EUR: "euro", USD: "dólar", GBP: "libra", CAD: "dólar canadense", NZD: "dólar neozelandês" };

export default function CompararClient({ programas, cambio, dataCambio, params }: Props) {
  const brand = useTenantBrand();
  const marca = brand.email.brandName;
  const router = useRouter();
  const hojeISO = new Date().toISOString().slice(0, 10);
  const trimestres = useMemo(() => trimestresDisponiveis(hojeISO, 6), [hojeISO]);

  const [triIdx, setTriIdx] = useState(2); // default ~2 trimestres a frente
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [copiado, setCopiado] = useState(false);

  const tri = trimestres[triIdx] ?? trimestres[0];
  const anoTri = Number((tri?.key || "").slice(0, 4)) || 0;
  const n = calcularNTrimestre(hojeISO, tri.fimISO);
  const weeks = params.weeks;
  const opts = { weeks, accomOn: params.accom, accomType: params.accomTipo, insuranceOn: params.seguro };

  function dados(p: ProgramaOrcavel) {
    const o = montarOrcamento(p, opts);
    const vet = cambio[p.currency] || 0;
    const brl = converterBRL(o.totalMoeda, vet);
    const sim = simularParcelamento({ totalMoeda: o.totalMoeda, entradaMoeda: p.appFee, vet, n, anoTrimestre: anoTri });
    return { o, vet, brl, sim };
  }

  // Cotacao do dia declarada (moedas presentes na selecao).
  const moedas = Array.from(new Set(programas.map((p) => p.currency))).filter((m) => cambio[m] > 0);
  const cotacaoTxt = moedas.map((m) => `R$ ${cambio[m].toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por ${MOEDA_NOME[m] || m}`).join(", ");

  async function compartilhar() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true); setTimeout(() => setCopiado(false), 2500);
    } catch { window.prompt("Copie o link do orçamento:", window.location.href); }
  }
  function encaminhar() {
    // O trimestre vira a data-alvo de inicio (fim do trimestre) para o checkout.
    const qs = encodeParams({ ...params, inicio: tri.fimISO });
    router.push(`/orcamento/checkout?${qs}&parcelas=${n}`);
  }

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 24px 64px" }}>
      <a href="/orcamento" style={{ fontSize: 13, color: BLUE, textDecoration: "none" }}>← Voltar à busca</a>
      <h1 style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--p-ink)", marginTop: 8 }}>Seu orçamento</h1>
      <p style={{ fontSize: 14, color: "var(--p-muted)", lineHeight: 1.6, maxWidth: 620, marginTop: 6 }}>
        Faixas reais, com tudo somado: curso, acomodação, seguro, material e taxas da escola. Não inclui passagem
        aérea, gastos pessoais e taxa consular do visto.
      </p>

      {/* Controle unico — quando viajar */}
      <section style={{ background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 20, marginTop: 20 }}>
        <p id="quando" style={{ fontSize: 15, fontWeight: 500, color: "var(--p-ink)" }}>Quando você quer viajar?</p>
        <div role="group" aria-labelledby="quando" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginTop: 12 }}>
          {trimestres.map((t, i) => (
            <button key={t.key} aria-pressed={i === triIdx} onClick={() => setTriIdx(i)}
              style={{ height: 44, borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                border: `1.5px solid ${i === triIdx ? "#3b4dc9" : "#DCDCE8"}`, background: i === triIdx ? "#EEF0FF" : "#fff", color: "var(--p-ink)" }}>
              {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--p-muted)", lineHeight: 1.6, marginTop: 12 }}>
          Sem juros, na moeda do programa. A parcela em real acompanha a cotação do dia — é por isso que não existe
          juro embutido no valor.
        </p>
        {cotacaoTxt ? (
          <p style={{ fontSize: 12, color: "var(--p-muted)", lineHeight: 1.6, marginTop: 6 }}>
            Simulação pela cotação de hoje{dataCambio ? "" : ""}, de {cotacaoTxt}. O valor de cada parcela em real se
            confirma na geração do Pix.
          </p>
        ) : null}
      </section>

      {/* Cards lado a lado */}
      <div style={{ display: "flex", gap: 16, overflowX: "auto", marginTop: 20, alignItems: "stretch", paddingBottom: 6 }}>
        {programas.map((p) => {
          const { o, vet, brl, sim } = dados(p);
          const exp = !!aberto[p.id];
          return (
            <div key={p.id} style={{ flex: "1 0 300px", maxWidth: 360, background: "#fff", border: "1px solid #EAEAF2", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(15,16,32,0.06)", display: "flex", flexDirection: "column" }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--p-muted)" }}>{p.city}, {p.country} {p.flag}</p>
              <p style={{ fontSize: 15, fontWeight: 500, color: "var(--p-ink)", marginTop: 2 }}>{p.courseName}</p>
              <p style={{ fontSize: 12, color: "var(--p-muted)" }}>{p.school} · {CATEGORY_LABEL[p.courseType] || p.courseType}</p>

              {/* Total moeda dominante + aprox R$ */}
              <p style={{ fontSize: "clamp(30px, 3.2vw, 40px)", fontWeight: 500, letterSpacing: "-0.02em", color: "var(--p-ink)", lineHeight: 1, marginTop: 14 }}>
                {fmtMoeda(o.totalMoeda, o.currency)}
              </p>
              <p style={{ fontSize: 13, color: "var(--p-muted)", marginTop: 4 }}>
                {vet > 0 ? `≈ ${fmtBRL(brl)} hoje` : "cotação indisponível"}
              </p>

              {/* Caixa de parcela */}
              <div style={{ background: CAIXA_PARCELA, borderRadius: 8, padding: "12px 14px", marginTop: 14 }}>
                {sim.curto ? (
                  <>
                    <p style={{ fontSize: 14, fontWeight: 500, color: "var(--p-ink)" }}>à vista, ou em até {n} parcela{n > 1 ? "s" : ""}</p>
                    <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 4, lineHeight: 1.5 }}>
                      Para saída próxima, o pagamento é à vista ou em poucas parcelas. Adiar dois trimestres reduz bastante a parcela.
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 500, color: "var(--p-muted)" }}>até {n} parcelas de</p>
                    <p style={{ fontSize: 20, fontWeight: 500, color: "var(--p-ink)", marginTop: 2 }}>{vet > 0 ? fmtBRL(sim.parcelaBRL) : "—"}</p>
                    {sim.longo ? (
                      <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 4, lineHeight: 1.5 }}>
                        Saídas a partir de 2028 seguem os preços publicados pelas escolas para o ano letivo — valor a confirmar.
                      </p>
                    ) : null}
                  </>
                )}
              </div>

              {/* Entrada */}
              {p.appFee > 0 ? (
                <p style={{ fontSize: 12, color: "var(--p-muted)", lineHeight: 1.5, marginTop: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: "var(--p-ink)" }}>Entrada de {fmtMoeda(p.appFee, o.currency)}</span>
                  {vet > 0 ? <span> · ≈ {fmtBRL(sim.entradaBRL)}</span> : null}
                  <br />o valor exato das taxas que a escola não devolve. Nada além disso fica preso.
                </p>
              ) : null}

              {/* Grade */}
              <div style={{ borderTop: "1px solid #F0F0EE", marginTop: 14, paddingTop: 10, fontSize: 12.5 }}>
                {[["Duração", labelSemanas(weeks)], ["Onde", `${p.city}, ${p.country}`], ["Categoria", CATEGORY_LABEL[p.courseType] || p.courseType]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                    <span style={{ color: "var(--p-muted)" }}>{k}</span><span style={{ color: "var(--p-ink)" }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* O que entra */}
              <button onClick={() => setAberto((s) => ({ ...s, [p.id]: !exp }))} style={{ background: "transparent", border: "none", color: BLUE, fontSize: 12.5, fontWeight: 500, cursor: "pointer", textAlign: "left", marginTop: 10, padding: 0 }}>
                {exp ? "▾ O que entra nesse valor" : "▸ O que entra nesse valor"}
              </button>
              {exp ? (
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
            </div>
          );
        })}
      </div>

      {/* Faixa de rodape — promessas + CTAs */}
      <section style={{ background: NIGHT, color: "#fff", borderRadius: 12, padding: 24, marginTop: 24 }}>
        <p style={{ fontSize: 15, fontWeight: 500 }}>Sem taxa de agência. O nosso ganho vem da escola, não de você.</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {["Pix parcelado, sem comprometer o limite do seu cartão.",
            "O cronograma pode terminar no dia anterior à sua saída.",
            "Se o câmbio ajudar, você antecipa parcela na Área do Cliente, sem custo."].map((t) => (
            <li key={t} style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", display: "flex", gap: 8 }}>
              <span style={{ color: "var(--brand-gold, #E8A838)" }}>•</span>{t}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <button onClick={encaminhar} style={{ flex: 1, minWidth: 220, background: BLUE, color: "#fff", border: "none", borderRadius: 8, padding: "13px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            Encaminhar matrícula →
          </button>
          <button onClick={compartilhar} style={{ flex: 1, minWidth: 200, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "13px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            {copiado ? "✓ Link copiado" : "Quero meu orçamento por escrito"}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.45)", marginTop: 10 }}>
          Leva 2 minutos. Sem cadastro e sem documento nesta etapa. O link do orçamento atualiza a cotação para o câmbio do dia em que for aberto.
        </p>
      </section>
    </div>
  );
}
