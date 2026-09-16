import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import ProdutoEditor from "@/components/ProdutoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Novo produto DENTRO do hub: o seletor de campus já vem LIMITADO a este
// fornecedor (só os campi dele). A escrita envia `supplier_esperado` e o backend
// EXIGE que o campus escolhido seja deste fornecedor (não só do tenant) — um
// campus de outro fornecedor no corpo forjado é recusado (campus_invalido).
export default async function NovoProdutoNoHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/produto/novo`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const [campiTodos, produtos] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
  ]);
  const campi = campiTodos.filter((c) => c.supplierId === id);

  return (
    <div>
      <Link href={`/admin/fornecedores/${id}`} className="text-sm text-brand-golddark hover:underline">← Inventário do fornecedor</Link>
      <h2 className="mb-4 mt-1 font-serif text-lg text-brand">Novo produto</h2>
      {campi.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Este fornecedor ainda não tem um campus cadastrado — crie/importe um campus antes de adicionar produtos.
        </p>
      ) : (
        <ProdutoEditor
          campi={campi}
          produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
          supplierEsperado={id}
        />
      )}
    </div>
  );
}
