import Link from "next/link";
import { exigirCapacidade } from "@/lib/admin-guard";
import CampusEditor from "@/components/CampusEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Novo campus DENTRO do hub (aba "Meus Campi"). O fornecedor vem da URL; a posse
// (fornecedor do tenant) e revalidada na escrita (campus-admin-service).
export default async function NovoCampusNoHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/campus/novo`);
  const voltar = `/admin/fornecedores/${id}/escolas`;
  return (
    <div>
      <Link href={voltar} className="text-sm text-brand-golddark hover:underline">← Meus Campi</Link>
      <h2 className="mb-4 mt-1 font-serif text-lg text-brand">Novo campus</h2>
      <CampusEditor supplierId={id} voltarHref={voltar} />
    </div>
  );
}
