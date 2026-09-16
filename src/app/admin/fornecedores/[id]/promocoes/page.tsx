import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPromocoesDoFornecedor } from "@/lib/fornecedor-hub-service";
import PromocoesListClient from "@/app/admin/precos/promocoes/PromocoesListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba Promoções do hub: promoções deste fornecedor (promotion.supplier_id).
export default async function FornecedorPromocoesPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const promocoes = await listarPromocoesDoFornecedor(supabase, tenantId, id);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg text-brand">Promoções</h2>
        <Link href="/admin/precos/promocoes/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Nova promoção
        </Link>
      </div>
      <PromocoesListClient promocoes={promocoes} />
    </div>
  );
}
