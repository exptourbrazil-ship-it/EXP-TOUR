import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { contextoDoProduto } from "@/lib/admin-hub-resolver";
import { hrefProdutoNoHub, HUB_LISTA_FORNECEDORES } from "@/lib/admin-hub-nav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Link antigo/atalho por id: o editor do produto vive DENTRO do hub do
// fornecedor dono (derivado do próprio produto, por tenant). Se não resolver,
// cai na lista de fornecedores (falha fechada).
export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/produtos/${id}`);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const ctx = await contextoDoProduto(supabase, tenantId, id);
  redirect(ctx?.supplierId ? hrefProdutoNoHub(ctx.supplierId, id) : HUB_LISTA_FORNECEDORES);
}
