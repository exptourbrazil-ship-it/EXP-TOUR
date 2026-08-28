import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { extratoDoFornecedor, type LinhaExtrato, type StatusRepasse } from "@/lib/extrato-fornecedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<StatusRepasse, { texto: string; cor: string; bg: string }> = {
  pago: { texto: "Pago", cor: "#15803d", bg: "#e7f4ea" },
  previsto: { texto: "Previsto", cor: "#8a6d2f", bg: "#f6efdd" },
  cancelado: { texto: "Cancelado", cor: "#6b7280", bg: "#f0f0ef" },
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
function seloVencimento(l: LinhaExtrato): { texto: string; cor: string } | null {
  if (l.status !== "previsto" || l.diasAteVencimento == null) return null;
  const d = l.diasAteVencimento;
  if (d < 0) return { texto: `vencido há ${Math.abs(d)}d`, cor: "#b91c1c" };
  if (d === 0) return { texto: "vence hoje", cor: "#b91c1c" };
  if (d <= 7) return { texto: `em ${d}d`, cor: "#8a6d2f" };
  return { texto: `em ${d}d`, cor: "#6b7280" };
}

// Extrato financeiro do fornecedor (doc 06 secao 3.6): repasses por caso —
// bruto, comissao, liquido, previsao (D-30), status e comprovante. Read-only;
// a execucao da remessa acontece no Admin. Escopado ao supplier da sessao.
export default async function FinanceiroPage() {
  const sessao = await exigirFornecedor("/fornecedor/financeiro");
  const supabase = getServiceClient();
  const extrato = await extratoDoFornecedor(supabase, sessao.supplierId);

  const moedasPrev = Object.keys(extrato.previstoPorMoeda).sort();
  const moedasPago = Object.keys(extrato.pagoPorMoeda).sort();

  return (
    <div>
      <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 26, margin: "0 0 4px" }}>Financeiro</h1>
      <p style={{ color: "#042f1b", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Seus repasses por estudante: valor bruto do programa, comissão da EXP Tour, líquido a receber e a
        previsão de pagamento (D-{extrato.prazoDias}, {extrato.prazoDias} dias antes do início). Quando a remessa
        é enviada, o comprovante aparece aqui.
      </p>

      {/* Resumo por moeda */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <ResumoCard titulo="Líquido previsto" porMoeda={extrato.previstoPorMoeda} moedas={moedasPrev} destaque="#8a6d2f" />
        <ResumoCard titulo="Já pago" porMoeda={extrato.pagoPorMoeda} moedas={moedasPago} destaque="#15803d" />
      </div>

      {!extrato.temAcordo ? (
        <div
          style={{
            border: "1px solid #e3d6b8",
            background: "#f9f3e2",
            color: "#8a6d2f",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          Ainda não há um acordo de comissão registrado com a EXP Tour. Mostramos o valor bruto e a previsão de
          vencimento; o líquido aparece quando o acordo estiver cadastrado.
        </div>
      ) : null}

      {extrato.linhas.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhum caso vinculado a você ainda.</p>
      ) : (
        <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12 }}>
                <th style={{ padding: "10px 14px" }}>Estudante</th>
                <th style={{ padding: "10px 14px", textAlign: "right" }}>Bruto</th>
                <th style={{ padding: "10px 14px", textAlign: "right" }}>Comissão</th>
                <th style={{ padding: "10px 14px", textAlign: "right" }}>Líquido</th>
                <th style={{ padding: "10px 14px" }}>Vencimento</th>
                <th style={{ padding: "10px 14px" }}>Status</th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {extrato.linhas.map((l) => {
                const st = STATUS[l.status];
                const selo = seloVencimento(l);
                const liquido = l.status === "pago" ? l.paidNet : l.netAmount;
                const moedaLiquido = l.status === "pago" ? l.paidCurrency ?? l.currency : l.currency;
                return (
                  <tr key={l.contratoId} style={{ borderTop: "1px solid #eee7d8", color: "#042f1b" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <div style={{ fontWeight: 600 }}>{l.estudanteNome || "—"}</div>
                      {l.programa ? <div style={{ fontSize: 12, color: "#6b7280" }}>{l.programa}</div> : null}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>{fmtMoeda(l.grossAmount, l.currency)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: "#6b7280" }}>
                      {l.comissaoDefinida ? fmtMoeda(l.commissionAmount, l.currency) : "a definir"}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600 }}>
                      {fmtMoeda(liquido, moedaLiquido)}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {l.status === "pago" ? (
                        <span style={{ color: "#15803d" }}>pago em {fmtData(l.paidAt)}</span>
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
                          color: st.cor,
                          background: st.bg,
                        }}
                      >
                        {st.texto}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right" }}>
                      {l.status === "pago" && l.proofStoragePath && l.payoutId ? (
                        <a
                          href={`/api/fornecedor/repasses/${l.payoutId}/comprovante`}
                          style={{ color: "#1d4ed8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}
                        >
                          Ver comprovante
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

      <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 14 }}>
        Os valores previstos são uma estimativa com base no contrato e no acordo vigente; o valor final é
        confirmado no momento da remessa.
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
        border: "1px solid #d8ccb4",
        borderRadius: 12,
        background: "#fff",
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{titulo}</div>
      {moedas.length === 0 ? (
        <div style={{ fontSize: 18, color: "#9ca3af" }}>—</div>
      ) : (
        moedas.map((m) => (
          <div key={m} style={{ fontFamily: "Bellefair, serif", fontSize: 22, color: destaque }}>
            {fmtMoeda(porMoeda[m], m)}
          </div>
        ))
      )}
    </div>
  );
}
