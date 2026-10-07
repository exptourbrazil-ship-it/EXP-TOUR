import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterPromocaoAdmin } from "@/lib/promocao-admin-service";
import { fornecedorDaPromocao } from "@/lib/admin-hub-resolver";
import { hrefPromocaoNoHub, HUB_LISTA_FORNECEDORES } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Link antigo/atalho por id: a promoção é editada DENTRO do hub do fornecedor
// dono (promotion.supplier_id, conferido por tenant). Não resolveu => lista de
// fornecedores (falha fechada).
export default async function EditarPromocaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/precos/promocoes/${id}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const promo = await obterPromocaoAdmin(supabase, tenantId, id);
  const supplierId = promo ? await fornecedorDaPromocao(supabase, tenantId, promo.promotion) : null;
  redirect(supplierId ? hrefPromocaoNoHub(supplierId, id) : HUB_LISTA_FORNECEDORES);
}
