import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterPromocaoAdmin } from "@/lib/promocao-admin-service";
import { fornecedorDaPromocao } from "@/lib/admin-hub-resolver";
import { hrefPromocoesDoHub } from "@/lib/admin-hub-nav";
import PromocaoEditorCorpo from "@/components/PromocaoEditorCorpo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar promoção DENTRO do hub. Posse: a promoção tem que ser deste fornecedor
// (promotion.supplier_id, conferido por tenant) — notFound caso contrário.
// Salvar/cancelar voltam à aba Promoções DESTE fornecedor.
export default async function EditarPromocaoNoHubPage({
  params,
}: {
  params: Promise<{ id: string; promoId: string }>;
}) {
  const { id, promoId } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/promocao/${promoId}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const promo = await obterPromocaoAdmin(supabase, tenantId, promoId);
  if (!promo || (await fornecedorDaPromocao(supabase, tenantId, promo.promotion)) !== id) notFound();

  return (
    <PromocaoEditorCorpo
      titulo={`Editar promoção — ${String(promo.promotion.name ?? "")}`}
      voltarHref={hrefPromocoesDoHub(id)}
      voltarLabel="Promoções"
      inicial={{ id: promoId, promotion: promo.promotion, targets: promo.targets }}
    />
  );
}
