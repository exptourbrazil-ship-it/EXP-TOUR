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
  searchParams,
}: {
  params: Promise<{ id: string; productId: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id, productId } = await params;
  const { aba } = await searchParams;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/produto/${productId}`);
  return (
    <EditarProdutoCorpo
      productId={productId}
      supplierIdEsperado={id}
      abaInicial={aba}
    />
  );
}
