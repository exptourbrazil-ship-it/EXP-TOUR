import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { fornecedorDosCampi } from "@/lib/admin-hub-resolver";
import { hrefHub } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A lista geral de tabelas de preço foi extinta. Preços vivem dentro de cada
// produto (aba "Preços & Taxas" no hub do fornecedor). Link antigo com
// ?campus_id= vai ao hub do fornecedor daquele campus; sem ele (ou se não
// resolver no tenant), à lista de fornecedores.
export default async function AdminTabelasPrecoPage({
  searchParams,
}: {
  searchParams: Promise<{ campus_id?: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/tabelas");
  const { campus_id: campusId } = await searchParams;
  let supplierId: string | null = null;
  if (campusId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    supplierId = await fornecedorDosCampi(supabase, await tenantIdAtual(supabase), [campusId]);
  }
  redirect(hrefHub(supplierId));
}
