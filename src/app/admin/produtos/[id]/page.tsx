import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterProdutoAdmin, listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { obterElegibilidadeAdmin } from "@/lib/elegibilidade-admin-service";
import ProdutoEditor from "@/components/ProdutoEditor";
import ElegibilidadeEditor from "@/components/ElegibilidadeEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar produto do tenant. Carrega o produto (core + detalhe do vertical +
// itens de pacote), os campi e os demais produtos (candidatos a item). A escrita
// vai para PUT /api/admin/produtos/[id]; o kind é imutável no editor.
export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/produtos/${id}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const produto = await obterProdutoAdmin(supabase, tenantId, id);
  if (!produto) notFound();

  const [campi, produtos, regrasElig] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    obterElegibilidadeAdmin(supabase, tenantId, id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin/produtos" className="text-sm text-brand-golddark hover:underline">← Produtos</Link>
        <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">
          Editar produto <span className="text-neutral-400">— {String(produto.core.name ?? "")}</span>
        </h1>
        <ProdutoEditor
          campi={campi}
          produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
          inicial={{ id, core: produto.core, detalhe: produto.detalhe, itens: produto.itens }}
        />
      </div>
      <ElegibilidadeEditor productId={id} inicial={regrasElig ?? []} />
    </div>
  );
}
