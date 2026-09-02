import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import ProdutoEditor from "@/components/ProdutoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Novo produto (qualquer vertical). Carrega os campi do tenant (seletor) e os
// produtos existentes (candidatos a item de pacote). A escrita vai para
// POST /api/admin/produtos, gateada por fornecedores.gerir.
export default async function NovoProdutoPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/produtos/novo");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const [campi, produtos] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/produtos" className="text-sm text-brand-golddark hover:underline">← Produtos</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">Novo produto</h1>
      <ProdutoEditor
        campi={campi}
        produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
      />
    </div>
  );
}
