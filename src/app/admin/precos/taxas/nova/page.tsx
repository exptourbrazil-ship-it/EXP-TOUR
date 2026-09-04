import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { listarTabelasPrecoAdmin } from "@/lib/price-template-admin-service";
import TaxaEditor from "@/components/TaxaEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nova taxa manual. Carrega campi, produtos (vínculo) e tabelas de preço (modo
// derivado). Escrita via POST /api/admin/catalog/fees.
// Prefill: ?produto=<id> pré-seleciona o campus e vincula o produto (validado
// contra a lista do tenant — posse).
export default async function NovaTaxaPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/taxas/nova");
  const { produto: produtoId } = await searchParams;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const [campi, produtos, tabelas] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    listarTabelasPrecoAdmin(supabase, tenantId),
  ]);

  const alvo = produtoId ? produtos.find((p) => p.id === produtoId) : undefined;
  const inicial = alvo ? { fee: { campus_id: alvo.campusId }, product_ids: [alvo.id] } : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/precos/taxas" className="text-sm text-brand-golddark hover:underline">← Taxas</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">Nova taxa</h1>
      <TaxaEditor
        campi={campi}
        produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind, campusId: p.campusId }))}
        templates={tabelas.map((t) => ({ id: t.id, name: t.name, currency: t.currency, campusId: t.campusId }))}
        inicial={inicial}
      />
    </div>
  );
}
