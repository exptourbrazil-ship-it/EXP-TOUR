import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { obterTabelaPrecoAdmin, listarMarketsDoTenant } from "@/lib/price-template-admin-service";
import TabelaPrecoEditor from "@/components/TabelaPrecoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar tabela de preço manual. Tabela GERIDA por price list (source_submission_id
// != NULL) é só leitura aqui — pertence ao fluxo de aprovação em /admin/precos.
export default async function EditarTabelaPrecoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/precos/tabelas/${id}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const tabela = await obterTabelaPrecoAdmin(supabase, tenantId, id);
  if (!tabela) notFound();

  const [campi, produtos, markets] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    listarMarketsDoTenant(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/precos/tabelas" className="text-sm text-brand-golddark hover:underline">← Tabelas de preço</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">
        {tabela.gerida ? "Tabela de preço" : "Editar tabela de preço"}
        <span className="text-neutral-400"> — {String(tabela.template.name ?? "")}</span>
      </h1>

      {tabela.gerida ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Esta tabela veio de um <b>price list de escola</b> e é gerida pelo fluxo de aprovação. Para alterá-la,
          use a fila em <Link href="/admin/precos" className="underline">Preços — aprovação</Link>. Aqui ela é
          somente leitura.
        </div>
      ) : (
        <TabelaPrecoEditor
          campi={campi}
          produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind, campusId: p.campusId }))}
          markets={markets}
          inicial={{ id, template: tabela.template, tiers: tabela.tiers, product_ids: tabela.product_ids }}
        />
      )}
    </div>
  );
}
