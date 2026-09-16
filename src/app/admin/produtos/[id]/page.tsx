import { exigirCapacidade } from "@/lib/admin-guard";
import EditarProdutoCorpo from "@/components/EditarProdutoCorpo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Página unificada "Editar produto" (estilo Edvisor "Edit Program"): reúne todas
// as dimensões do produto (Informação, Preços & Taxas, Disponibilidade, Promoções,
// Elegibilidade, Conteúdo). O corpo é compartilhado com o hub do fornecedor.
export default async function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/produtos/${id}`);
  return (
    <div className="mx-auto max-w-3xl">
      <EditarProdutoCorpo productId={id} voltarHref="/admin/produtos" voltarLabel="Produtos" />
    </div>
  );
}
