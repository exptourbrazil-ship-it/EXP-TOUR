import { exigirCapacidade } from "@/lib/admin-guard";
import PromocaoEditorCorpo from "@/components/PromocaoEditorCorpo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nova promoção DENTRO do hub — já pré-seleciona ESTE fornecedor. A posse do
// campus/alvo é validada no salvamento (promocao-admin-service).
export default async function NovaPromocaoNoHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/promocao/nova`);
  return (
    <PromocaoEditorCorpo
      titulo="Nova promoção"
      voltarHref={`/admin/fornecedores/${id}/promocoes`}
      voltarLabel="Promoções"
      inicial={{ promotion: { supplier_id: id } }}
    />
  );
}
