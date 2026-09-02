import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarTabelasPrecoAdmin } from "@/lib/price-template-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tabelas de preço MANUAIS do Admin (complementa a fila de aprovação de price
// list em /admin/precos). Autorização por capacidade fornecedores.gerir.
const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", expired: "Expirado" };
const BASE_LABEL: Record<string, string> = { duration: "Duração", quantity: "Quantidade", fixed: "Fixo", per_person: "Por pessoa" };

export default async function AdminTabelasPrecoPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/tabelas");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const tabelas = await listarTabelasPrecoAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Tabelas de preço</h1>
        <Link href="/admin/precos/tabelas/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Nova tabela
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Tabelas de preço montadas à mão pelo Admin (faixas por quantidade). Para aprovar price lists
        enviados pelas escolas, veja <Link href="/admin/precos" className="text-brand-golddark hover:underline">Preços — aprovação</Link>.
      </p>

      {tabelas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma tabela cadastrada.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Campus</th>
                <th className="px-4 py-2">Base</th>
                <th className="px-4 py-2">Moeda</th>
                <th className="px-4 py-2">Faixas</th>
                <th className="px-4 py-2">Produtos</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {tabelas.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">
                    {t.name}
                    {t.gerida ? <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">price list</span> : null}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{t.campusName ?? "—"}</td>
                  <td className="px-4 py-2">{BASE_LABEL[t.priceBasis] ?? t.priceBasis}</td>
                  <td className="px-4 py-2">{t.currency}</td>
                  <td className="px-4 py-2">{t.faixas}</td>
                  <td className="px-4 py-2">{t.produtos}</td>
                  <td className="px-4 py-2">{STATUS_LABEL[t.status] ?? t.status}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/tabelas/${t.id}`} className="text-brand-golddark hover:underline">
                      {t.gerida ? "Ver →" : "Editar →"}
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
