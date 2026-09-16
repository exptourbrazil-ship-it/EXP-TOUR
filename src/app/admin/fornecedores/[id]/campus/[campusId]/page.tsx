import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterCampusAdmin } from "@/lib/campus-admin-service";
import CampusEditor from "@/components/CampusEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar campus DENTRO do hub. Posse dupla: o campus tem que ser do tenant E deste
// fornecedor (obterCampusAdmin) — campus de outro fornecedor na URL da notFound.
export default async function EditarCampusNoHubPage({
  params,
}: {
  params: Promise<{ id: string; campusId: string }>;
}) {
  const { id, campusId } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/fornecedores/${id}/campus/${campusId}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const campus = await obterCampusAdmin(supabase, tenantId, id, campusId);
  if (!campus) notFound();

  const voltar = `/admin/fornecedores/${id}/escolas`;
  return (
    <div>
      <Link href={voltar} className="text-sm text-brand-golddark hover:underline">← Meus Campi</Link>
      <h2 className="mb-4 mt-1 font-serif text-lg text-brand">
        Editar campus <span className="text-neutral-400">— {campus.name}</span>
      </h2>
      <CampusEditor supplierId={id} voltarHref={voltar} inicial={campus} />
    </div>
  );
}
