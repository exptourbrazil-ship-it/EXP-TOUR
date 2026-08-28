import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterCasoParaRepasse } from "@/lib/payout-admin-service";
import RepasseExecutarClient from "./RepasseExecutarClient";

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

// Detalhe do caso + execução da remessa (D-30). Leitura exige financeiro.ver; a
// gravação da remessa (rota) exige financeiro.gerir.
export default async function ContaAPagarDetalhe({ params }: { params: Promise<{ contratoId: string }> }) {
  const { contratoId } = await params;
  await exigirCapacidade("financeiro.ver", `/admin/contas-a-pagar/${contratoId}`);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const caso = await obterCasoParaRepasse(supabase, tenantId, contratoId);
  if (!caso) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3">
        <Link href="/admin/contas-a-pagar" className="text-sm text-neutral-500 hover:text-brand">← Contas a pagar</Link>
      </div>
      <h1 className="mb-1 font-serif text-2xl text-brand">{caso.supplierNome || "Repasse"}</h1>
      <p className="mb-4 text-sm text-neutral-600">
        {caso.estudanteNome || "—"}{caso.programa ? ` · ${caso.programa}` : ""}
      </p>

      <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 font-serif text-lg text-brand">Previsão</h2>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-neutral-500">Bruto</dt>
          <dd className="text-right">{fmtMoeda(caso.grossAmount, caso.currency)}</dd>
          <dt className="text-neutral-500">Comissão</dt>
          <dd className="text-right">{caso.comissaoDefinida ? fmtMoeda(caso.commissionAmount, caso.currency) : "a definir"}</dd>
          <dt className="text-neutral-500">Líquido</dt>
          <dd className="text-right font-semibold">{fmtMoeda(caso.netAmount, caso.currency)}</dd>
          <dt className="text-neutral-500">Vencimento (D-30)</dt>
          <dd className="text-right">{fmtData(caso.dueDate)}</dd>
        </dl>
      </div>

      {caso.jaPago ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Este caso já tem uma remessa registrada. Veja o extrato do fornecedor no portal.
        </p>
      ) : (
        <RepasseExecutarClient
          contratoId={caso.contratoId}
          previsao={{
            grossAmount: caso.grossAmount,
            commissionAmount: caso.commissionAmount,
            netAmount: caso.netAmount,
            currency: caso.currency,
            dueDate: caso.dueDate,
          }}
        />
      )}
    </div>
  );
}
