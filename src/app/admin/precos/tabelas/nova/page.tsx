import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { listarMarketsDoTenant } from "@/lib/price-template-admin-service";
import TabelaPrecoEditor from "@/components/TabelaPrecoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nova tabela de preço manual. Carrega campi, produtos (para vincular/prever) e
// mercados do tenant. Escrita via POST /api/admin/catalog/price-templates.
// Prefill: ?produto=<id> (ex.: atalho da página do produto) pré-seleciona o
// campus e já vincula o produto — validado contra a lista do tenant (posse).
export default async function NovaTabelaPrecoPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/tabelas/nova");
  const { produto: produtoId } = await searchParams;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const [campi, produtos, markets] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    listarMarketsDoTenant(supabase, tenantId),
  ]);

  // Só prefila se o produto for do tenant (está na lista carregada).
  const alvo = produtoId ? produtos.find((p) => p.id === produtoId) : undefined;
  const inicial = alvo ? { template: { campus_id: alvo.campusId }, product_ids: [alvo.id] } : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/precos/tabelas" className="text-sm text-brand-golddark hover:underline">← Tabelas de preço</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">Nova tabela de preço</h1>
      <TabelaPrecoEditor
        campi={campi}
        produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind, campusId: p.campusId }))}
        markets={markets}
        inicial={inicial}
      />
    </div>
  );
}
