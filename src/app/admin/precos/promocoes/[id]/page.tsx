import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterPromocaoAdmin } from "@/lib/promocao-admin-service";
import PromocaoEditorCorpo from "@/components/PromocaoEditorCorpo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar promoção do tenant. Corpo compartilhado com o hub do fornecedor.
export default async function EditarPromocaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/precos/promocoes/${id}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const promo = await obterPromocaoAdmin(supabase, tenantId, id);
  if (!promo) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PromocaoEditorCorpo
        titulo={`Editar promoção — ${String(promo.promotion.name ?? "")}`}
        voltarHref="/admin/precos/promocoes"
        voltarLabel="Promoções"
        inicial={{ id, promotion: promo.promotion, targets: promo.targets }}
      />
    </div>
  );
}
