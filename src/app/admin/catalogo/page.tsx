import { redirect } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { HUB_LISTA_FORNECEDORES } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O painel geral de catálogo (contagens e atalhos de TODOS os produtos/preços/
// taxas/promoções) foi extinto: o inventário vive dentro do hub de cada
// fornecedor. A lista de fornecedores é o único ponto de entrada.
export default async function CatalogoHubPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/catalogo");
  redirect(HUB_LISTA_FORNECEDORES);
}
