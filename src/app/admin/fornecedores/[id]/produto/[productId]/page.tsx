import { exigirCapacidade } from "@/lib/admin-guard";
import EditarProdutoCorpo from "@/components/EditarProdutoCorpo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar produto DENTRO do hub do fornecedor (Edvisor-like): o layout do hub
// desenha o cabeçalho + abas do fornecedor; aqui vai o editor completo do produto.
// A posse (produto pertence a ESTE fornecedor) é conferida no corpo via
// supplierIdEsperado — URL de produto de outro fornecedor dá notFound.
export default async function EditarProdutoNoHubPage({
  params,
}: {
  params: Promise<{ id: string; productId: string }>;
}) {
  const { id, productId } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/produto/${productId}`);
  return (
    <EditarProdutoCorpo
      productId={productId}
      supplierIdEsperado={id}
      voltarHref={`/admin/fornecedores/${id}`}
      voltarLabel="Inventário do fornecedor"
    />
  );
}
