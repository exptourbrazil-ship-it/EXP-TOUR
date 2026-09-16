import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import PromocaoEditorCorpo from "@/components/PromocaoEditorCorpo";
import type { PromocaoInicial } from "@/components/PromocaoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nova promoção. Prefill opcional por ?produto=<id> (pré-seleciona fornecedor/
// campus e adiciona o alvo "produto"). Escrita via POST /api/admin/catalog/promotions.
export default async function NovaPromocaoPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/promocoes/nova");
  const { produto: produtoId } = await searchParams;

  let inicial: PromocaoInicial | undefined;
  if (produtoId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const tenantId = await tenantIdAtual(supabase);
    const [campi, produtos] = await Promise.all([
      listarCampusDoTenant(supabase, tenantId),
      listarProdutosAdmin(supabase, tenantId),
    ]);
    const alvo = produtos.find((p) => p.id === produtoId);
    const campusDoAlvo = alvo ? campi.find((c) => c.id === alvo.campusId) : undefined;
    if (alvo) {
      inicial = {
        promotion: {
          ...(campusDoAlvo?.supplierId ? { supplier_id: campusDoAlvo.supplierId } : {}),
          campus_id: alvo.campusId,
        },
        targets: [{ dimension: "product", value: alvo.id }],
      };
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PromocaoEditorCorpo titulo="Nova promoção" voltarHref="/admin/precos/promocoes" voltarLabel="Promoções" inicial={inicial} />
    </div>
  );
}
