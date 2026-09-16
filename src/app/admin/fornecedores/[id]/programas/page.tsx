import { PaginaProdutosDoTipo } from "../produtos-tipo-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return PaginaProdutosDoTipo({ supplierId: id, kind: "program", titulo: "Programas", vazio: "Nenhum programa cadastrado para este fornecedor." });
}
