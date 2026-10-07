import { redirect } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { HUB_LISTA_FORNECEDORES } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A lista geral de TODOS os produtos foi extinta: produtos vivem dentro do hub de
// cada fornecedor (abas Programas, Acomodação, Outros, Pacotes, Seguro). O
// redirect acontece DEPOIS da checagem de capacidade.
export default async function AdminProdutosPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/produtos");
  redirect(HUB_LISTA_FORNECEDORES);
}
