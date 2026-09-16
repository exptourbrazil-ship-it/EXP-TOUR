import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarProdutosDoFornecedor } from "@/lib/fornecedor-hub-service";
import ProdutosListClient from "@/app/admin/produtos/ProdutosListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba Produtos do hub: catálogo do fornecedor (via campus). Reusa a lista global
// de produtos, já filtrada para este fornecedor no servidor.
export default async function FornecedorProdutosPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const produtos = await listarProdutosDoFornecedor(supabase, tenantId, id);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg text-brand">Produtos</h2>
        <Link href="/admin/produtos/novo" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Novo produto
        </Link>
      </div>
      <ProdutosListClient produtos={produtos} />
    </div>
  );
}
