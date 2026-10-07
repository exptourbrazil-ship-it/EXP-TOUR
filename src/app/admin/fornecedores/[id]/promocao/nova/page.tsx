import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { contextoDoProduto } from "@/lib/admin-hub-resolver";
import { hrefPromocoesDoHub } from "@/lib/admin-hub-nav";
import PromocaoEditorCorpo from "@/components/PromocaoEditorCorpo";
import type { PromocaoInicial } from "@/components/PromocaoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nova promoção DENTRO do hub — já pré-seleciona ESTE fornecedor. A posse do
// campus/alvo é validada no salvamento (promocao-admin-service).
// Prefill opcional por ?produto=<id> (atalho da aba Promoções do produto): só vale
// se o produto for do tenant E deste fornecedor (derivado do próprio produto).
export default async function NovaPromocaoNoHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ produto?: string }>;
}) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/promocao/nova`);
  const { produto: produtoId } = await searchParams;

  let inicial: PromocaoInicial = { promotion: { supplier_id: id } };
  if (produtoId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const tenantId = await tenantIdAtual(supabase);
    const ctx = await contextoDoProduto(supabase, tenantId, produtoId);
    if (ctx && ctx.supplierId === id) {
      inicial = {
        promotion: { supplier_id: id, campus_id: ctx.campusId },
        targets: [{ dimension: "product", value: produtoId }],
      };
    }
  }

  return (
    <PromocaoEditorCorpo
      titulo="Nova promoção"
      voltarHref={hrefPromocoesDoHub(id)}
      voltarLabel="Promoções"
      inicial={inicial}
    />
  );
}
