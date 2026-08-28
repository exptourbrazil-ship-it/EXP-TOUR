import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarContasAPagar, type ContaAPagar } from "@/lib/payout-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
function selo(c: ContaAPagar): { texto: string; cor: string } | null {
  if (c.diasAteVencimento == null) return null;
  const d = c.diasAteVencimento;
  if (d < 0) return { texto: `vencido há ${Math.abs(d)}d`, cor: "#b91c1c" };
  if (d === 0) return { texto: "vence hoje", cor: "#b91c1c" };
  if (d <= 7) return { texto: `em ${d}d`, cor: "#8a6d2f" };
  return { texto: `em ${d}d`, cor: "#6b7280" };
}

// Contas a pagar às escolas (D-30, doc 05 §2). Capacidade financeiro.ver (a
// execução da remessa exige financeiro.gerir, revalidado na rota). Lista as
// previsões de repasse ainda não executadas, do caso mais urgente ao menos.
export default async function ContasAPagarPage() {
  await exigirCapacidade("financeiro.ver", "/admin/contas-a-pagar");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const contas = await listarContasAPagar(supabase, tenantId);

  // Total previsto por moeda (só líquido definido).
  const totais: Record<string, number> = {};
  for (const c of contas) {
    if (c.netAmount != null && c.currency) totais[c.currency] = (totais[c.currency] ?? 0) + c.netAmount;
  }
  const moedas = Object.keys(totais).sort();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-serif text-2xl text-brand">Contas a pagar</h1>
      <p className="mb-4 text-sm text-neutral-600">
        Repasses às escolas com vencimento D-30 (30 dias antes do início, configurável por fornecedor).
        Registre a remessa executada e anexe o comprovante — a escola é avisada e vê o comprovante no portal.
      </p>

      {moedas.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          {moedas.map((m) => (
            <div key={m} className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
              <div className="text-xs text-neutral-500">Líquido previsto</div>
              <div className="font-serif text-xl text-brand">{fmtMoeda(totais[m], m)}</div>
            </div>
          ))}
        </div>
      ) : null}

      {contas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum repasse pendente.</p>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: 720 }}>
            <thead className="text-neutral-400 text-xs">
              <tr>
                <th className="px-4 py-2">Escola / estudante</th>
                <th className="px-4 py-2 text-right">Bruto</th>
                <th className="px-4 py-2 text-right">Comissão</th>
                <th className="px-4 py-2 text-right">Líquido</th>
                <th className="px-4 py-2">Vencimento</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {contas.map((c) => {
                const s = selo(c);
                return (
                  <tr key={c.contratoId} className="border-t border-neutral-100">
                    <td className="px-4 py-2">
                      <div className="text-brand font-medium">{c.supplierNome || "—"}</div>
                      <div className="text-xs text-neutral-500">{c.estudanteNome || c.programa || "—"}</div>
                    </td>
                    <td className="px-4 py-2 text-right">{fmtMoeda(c.grossAmount, c.currency)}</td>
                    <td className="px-4 py-2 text-right text-neutral-500">
                      {c.comissaoDefinida ? fmtMoeda(c.commissionAmount, c.currency) : "a definir"}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{fmtMoeda(c.netAmount, c.currency)}</td>
                    <td className="px-4 py-2">
                      {fmtData(c.dueDate)}
                      {s ? <span className="ml-1 text-xs" style={{ color: s.cor }}>({s.texto})</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/admin/contas-a-pagar/${c.contratoId}`} className="text-brand-golddark hover:underline">
                        Pagar →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
