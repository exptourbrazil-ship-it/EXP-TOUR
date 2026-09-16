import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPromocoesDoFornecedor } from "@/lib/fornecedor-hub-service";
import PromocoesListClient from "@/app/admin/precos/promocoes/PromocoesListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba Ofertas & Bolsas (Edvisor). Nosso modelo hoje só tem `promotion` — sem um
// tipo próprio de bolsa/oferta. Por ora esta aba é uma VISÃO das promoções do
// fornecedor; um modelo dedicado de Scholarship/Offer entra numa etapa futura.
export default async function FornecedorOfertasPage({ params }: { params: Promise<{ id: string }> }) {
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
      <h2 className="mb-1 font-serif text-lg text-brand">Ofertas &amp; Bolsas</h2>
      <p className="mb-4 rounded-lg bg-brand-cream/40 px-3 py-2 text-xs text-neutral-600">
        Prévia: por enquanto mostra as promoções deste fornecedor. Um modelo próprio de bolsa/oferta
        (com criação separada, como no Edvisor) entra numa próxima etapa.
      </p>
      <PromocoesListClient promocoes={promocoes} editHrefBase={`/admin/fornecedores/${id}/promocao`} />
    </div>
  );
}
