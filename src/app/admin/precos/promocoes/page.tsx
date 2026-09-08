import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPromocoesAdmin } from "@/lib/promocao-admin-service";
import PromocoesListClient from "./PromocoesListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Promoções manuais do Admin. Autorização por capacidade fornecedores.gerir
// (a rota de API revalida em cada mutação). Carrega no servidor e delega ao
// client (indicadores, filtro por status, busca, badges).
export default async function AdminPromocoesPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/promocoes");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const promocoes = await listarPromocoesAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Promoções</h1>
        <Link href="/admin/precos/promocoes/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">+ Nova promoção</Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Descontos, isenções e ofertas por fornecedor. Aplicam-se na cotação conforme o alvo, as janelas
        de reserva/viagem e a segmentação.
      </p>

      <PromocoesListClient promocoes={promocoes} />
    </div>
  );
}
