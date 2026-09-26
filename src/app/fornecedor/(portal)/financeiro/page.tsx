import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { extratoDoFornecedor, type LinhaExtrato, type StatusRepasse } from "@/lib/extrato-fornecedor";
import { t } from "@/lib/fornecedor-i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_ESTILO: Record<StatusRepasse, { cor: string; bg: string }> = {
  pago: { cor: "var(--p-success-ink)", bg: "var(--p-success-soft)" },
  previsto: { cor: "var(--p-accent-ink)", bg: "var(--p-accent-soft)" },
  cancelado: { cor: "var(--p-muted)", bg: "#f0f0ef" },
};

function fmtMoeda(valor: number | null, moeda: string | null): string {
  if (valor == null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "USD" }).format(valor);
  } catch {
    return `${moeda || ""} ${valor.toFixed(2)}`.trim();
  }
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Etiqueta de urgencia do vencimento (so para casos previstos).
function seloVencimento(l: LinhaExtrato, T: ReturnType<typeof construirTextos>): { texto: string; cor: string } | null {
  if (l.status !== "previsto" || l.diasAteVencimento == null) return null;
  const d = l.diasAteVencimento;
  if (d < 0) return { texto: T.vencidoHa(Math.abs(d)), cor: "#b91c1c" };
  if (d === 0) return { texto: T.venceHoje, cor: "#b91c1c" };
  if (d <= 7) return { texto: T.emDias(d), cor: "var(--p-accent-ink)" };
  return { texto: T.emDias(d), cor: "var(--p-muted)" };
}

function construirTextos(idioma: string | null | undefined) {
  return t(idioma, {
    pt: {
      titulo: "Financeiro",
      intro: (prazoDias: number) =>
        `Seus repasses por estudante: valor bruto do programa, comissão da EXP Tour, líquido a receber e a previsão de pagamento (D-${prazoDias}, ${prazoDias} dias antes do início). Quando a remessa é enviada, o comprovante aparece aqui.`,
      liquidoPrevisto: "Líquido previsto",
      jaPago: "Já pago",
      semAcordo:
        "Ainda não há um acordo de comissão registrado com a EXP Tour. Mostramos o valor bruto e a previsão de vencimento; o líquido aparece quando o acordo estiver cadastrado.",
      nenhumCaso: "Nenhum caso vinculado a você ainda.",
      estudante: "Estudante",
      bruto: "Bruto",
      comissao: "Comissão",
      liquido: "Líquido",
      vencimento: "Vencimento",
      status: "Status",
      aDefinir: "a definir",
      pagoEm: (data: string) => `pago em ${data}`,
      verComprovante: "Ver comprovante",
      rodape:
        "Os valores previstos são uma estimativa com base no contrato e no acordo vigente; o valor final é confirmado no momento da remessa.",
      vencidoHa: (dias: number) => `vencido há ${dias}d`,
      venceHoje: "vence hoje",
      emDias: (dias: number) => `em ${dias}d`,
      statusLabel: { pago: "Pago", previsto: "Previsto", cancelado: "Cancelado" } as Record<StatusRepasse, string>,
    },
    en: {
      titulo: "Finance",
      intro: (prazoDias: number) =>
        `Your payouts per student: gross program amount, EXP Tour's commission, net amount receivable, and the expected payment date (D-${prazoDias}, ${prazoDias} days before the start date). Once the remittance is sent, the proof of payment appears here.`,
      liquidoPrevisto: "Net expected",
      jaPago: "Already paid",
      semAcordo:
        "There is no commission agreement registered with EXP Tour yet. We show the gross amount and the expected due date; the net amount appears once the agreement is registered.",
      nenhumCaso: "No case linked to you yet.",
      estudante: "Student",
      bruto: "Gross",
      comissao: "Commission",
      liquido: "Net",
      vencimento: "Due date",
      status: "Status",
      aDefinir: "to be defined",
      pagoEm: (data: string) => `paid on ${data}`,
      verComprovante: "View proof",
      rodape:
        "Expected amounts are an estimate based on the contract and the current agreement; the final amount is confirmed at the time of remittance.",
      vencidoHa: (dias: number) => `${dias}d overdue`,
      venceHoje: "due today",
      emDias: (dias: number) => `in ${dias}d`,
      statusLabel: { pago: "Paid", previsto: "Expected", cancelado: "Cancelled" } as Record<StatusRepasse, string>,
    },
  });
}

// Extrato financeiro do fornecedor (doc 06 secao 3.6): repasses por caso —
// bruto, comissao, liquido, previsao (D-30), status e comprovante. Read-only;
// a execucao da remessa acontece no Admin. Escopado ao supplier da sessao.
export default async function FinanceiroPage() {
  const sessao = await exigirFornecedor("/fornecedor/financeiro");
  const supabase = getServiceClient();
  const extrato = await extratoDoFornecedor(supabase, sessao.supplierId);
  const T = construirTextos(sessao.language);

  const moedasPrev = Object.keys(extrato.previstoPorMoeda).sort();
  const moedasPago = Object.keys(extrato.pagoPorMoeda).sort();

  return (
    <div>
      <h1 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 26, margin: "0 0 4px" }}>{T.titulo}</h1>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        {T.intro(extrato.prazoDias)}
      </p>

      {/* Resumo por moeda */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <ResumoCard titulo={T.liquidoPrevisto} porMoeda={extrato.previstoPorMoeda} moedas={moedasPrev} destaque="var(--p-accent-ink)" />
        <ResumoCard titulo={T.jaPago} porMoeda={extrato.pagoPorMoeda} moedas={moedasPago} destaque="var(--p-success-ink)" />
      </div>

      {!extrato.temAcordo ? (
        <div
          style={{
            border: "1px solid var(--p-line)",
            background: "var(--p-accent-soft)",
            color: "var(--p-accent-ink)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {T.semAcordo}
        </div>
      ) : null}

      {extrato.linhas.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumCaso}</p>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>{T.estudante}</th>
                <th style={{ padding: "10px 14px", textAlign: "right" }}>{T.bruto}</th>
                <th style={{ padding: "10px 14px", textAlign: "right" }}>{T.comissao}</th>
                <th style={{ padding: "10px 14px", textAlign: "right" }}>{T.liquido}</th>
                <th style={{ padding: "10px 14px" }}>{T.vencimento}</th>
                <th style={{ padding: "10px 14px" }}>{T.status}</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {extrato.linhas.map((l) => {
                const estilo = STATUS_ESTILO[l.status];
                const statusTexto = T.statusLabel[l.status];
                const selo = seloVencimento(l, T);
                const liquido = l.status === "pago" ? l.paidNet : l.netAmount;
                const moedaLiquido = l.status === "pago" ? l.paidCurrency ?? l.currency : l.currency;
                return (
                  <tr key={l.contratoId} style={{ borderTop: "1px solid var(--p-line)", color: "var(--p-ink)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600 }}>{l.estudanteNome || "—"}</div>
                      {l.programa ? <div style={{ fontSize: 12, color: "var(--p-muted)" }}>{l.programa}</div> : null}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmtMoeda(l.grossAmount, l.currency)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--p-muted)" }}>
                      {l.comissaoDefinida ? fmtMoeda(l.commissionAmount, l.currency) : T.aDefinir}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>
                      {fmtMoeda(liquido, moedaLiquido)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {l.status === "pago" ? (
                        <span style={{ color: "var(--p-success-ink)" }}>{T.pagoEm(fmtData(l.paidAt))}</span>
                      ) : (
                        <>
                          {fmtData(l.dueDate)}
                          {selo ? <span style={{ marginLeft: 6, fontSize: 12, color: selo.cor }}>({selo.texto})</span> : null}
                        </>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          color: estilo.cor,
                          background: estilo.bg,
                        }}
                      >
                        {statusTexto}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      {l.status === "pago" && l.proofStoragePath && l.payoutId ? (
                        <a
                          href={`/api/fornecedor/repasses/${l.payoutId}/comprovante`}
                          style={{ color: "#1d4ed8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}
                        >
                          {T.verComprovante}
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: "var(--p-muted)", fontSize: 12, marginTop: 14 }}>
        {T.rodape}
      </p>
    </div>
  );
}

function ResumoCard({
  titulo,
  porMoeda,
  moedas,
  destaque,
}: {
  titulo: string;
  porMoeda: Record<string, number>;
  moedas: string[];
  destaque: string;
}) {
  return (
    <div
      style={{
        flex: "1 1 220px",
        border: "1px solid var(--p-line)",
        borderRadius: 12,
        background: "#fff",
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--p-muted)", marginBottom: 6 }}>{titulo}</div>
      {moedas.length === 0 ? (
        <div style={{ fontSize: 18, color: "var(--p-muted)" }}>—</div>
      ) : (
        moedas.map((m) => (
          <div key={m} style={{ fontFamily: "var(--p-heading)", fontSize: 22, color: destaque }}>
            {fmtMoeda(porMoeda[m], m)}
          </div>
        ))
      )}
    </div>
  );
}
