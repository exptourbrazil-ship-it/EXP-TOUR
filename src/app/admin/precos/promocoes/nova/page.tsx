import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { contextoDoProduto } from "@/lib/admin-hub-resolver";
import { hrefNovaPromocaoNoHub, HUB_LISTA_FORNECEDORES } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Link antigo: nova promoção só existe dentro do hub do fornecedor. Com
// ?produto=<id>, o fornecedor é derivado do PRÓPRIO produto (tenant); sem isso,
// lista de fornecedores.
export default async function NovaPromocaoPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/promocoes/nova");
  const { produto: produtoId } = await searchParams;
  if (produtoId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    const ctx = await contextoDoProduto(supabase, await tenantIdAtual(supabase), produtoId);
    if (ctx?.supplierId) redirect(hrefNovaPromocaoNoHub(ctx.supplierId, produtoId));
  }
  redirect(HUB_LISTA_FORNECEDORES);
}
