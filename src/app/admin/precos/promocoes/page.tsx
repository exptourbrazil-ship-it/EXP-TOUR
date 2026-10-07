import { redirect } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { HUB_LISTA_FORNECEDORES } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A lista geral de promoções foi extinta: promoções (e as propostas lidas por IA
// pendentes) vivem na aba Promoções do hub de cada fornecedor.
export default async function AdminPromocoesPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/promocoes");
  redirect(HUB_LISTA_FORNECEDORES);
}
