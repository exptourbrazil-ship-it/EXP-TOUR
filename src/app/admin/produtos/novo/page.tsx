import { redirect } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { HUB_LISTA_FORNECEDORES } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Novo produto agora só existe dentro do hub do fornecedor
// (/admin/fornecedores/[id]/produto/novo), onde o campus já vem limitado ao dono.
export default async function NovoProdutoPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/produtos/novo");
  redirect(HUB_LISTA_FORNECEDORES);
}
