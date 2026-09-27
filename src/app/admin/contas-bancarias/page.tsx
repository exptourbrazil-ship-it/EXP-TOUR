import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPropostasBancariasPendentesAdmin } from "@/lib/supplier-bank-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Fila central de propostas de CONTA BANCÁRIA dos fornecedores (destino do
// repasse). Isto é dinheiro: nenhuma proposta vira a conta usada no repasse
// sozinha — o admin confirma ou rejeita aqui (ver /admin/contas-bancarias/[id]).
// Capacidade financeiro.ver (consulta); confirmar/rejeitar exige financeiro.gerir,
// checado de novo na rota.
export default async function ContasBancariasPage() {
  await exigirCapacidade("financeiro.ver", "/admin/contas-bancarias");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const propostas = await listarPropostasBancariasPendentesAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-serif text-2xl text-brand">Contas bancárias — propostas pendentes</h1>
      <p className="mb-4 text-sm text-neutral-600">
        Dados bancários que os fornecedores propuseram como destino do repasse. Nenhum vale como conta vigente até
        você confirmar — confira com cuidado antes: uma conta errada é dinheiro indo para o lugar errado.
      </p>

      {propostas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma proposta pendente.</p>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: 640 }}>
            <thead className="text-neutral-400 text-xs">
              <tr>
                <th className="px-4 py-2">Fornecedor</th>
                <th className="px-4 py-2">Titular da conta</th>
                <th className="px-4 py-2">País / moeda</th>
                <th className="px-4 py-2">Proposto por</th>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {propostas.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand font-medium">{p.supplierNome || "—"}</td>
                  <td className="px-4 py-2">{p.accountHolderName}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {[p.countryCode, p.currency].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{p.proposedBy}</td>
                  <td className="px-4 py-2 text-neutral-500">{fmtData(p.createdAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/contas-bancarias/${p.id}`} className="text-brand-golddark hover:underline">
                      Revisar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
