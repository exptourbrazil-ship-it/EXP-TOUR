import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";
import TaxasListClient from "./TaxasListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Taxas manuais do Admin (matrícula/material/serviço etc.). Autorização por
// capacidade fornecedores.gerir. Carrega no servidor e delega ao client
// (indicadores, filtro por obrigatoriedade, busca, badges).
//
// Modo escopado: com ?campus_id=<id> (vindo do hub do fornecedor), a listagem
// mostra só as taxas daquele campus e o "voltar" leva de volta ao hub — nunca
// deixa o usuário preso na visão global de todas as escolas. Sem o parâmetro,
// continua sendo a visão global (auditoria cross-escola).
export default async function AdminTaxasPage({
  searchParams,
}: {
  searchParams: Promise<{ campus_id?: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/taxas");
  const { campus_id: campusId } = await searchParams;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const taxas = await listarTaxasAdmin(supabase, tenantId, campusId ? { campusId } : undefined);

  let campus: { name: string; supplierId: string | null } | null = null;
  if (campusId) {
    const { data } = await supabase
      .from("campus")
      .select("name, supplier_id")
      .eq("tenant_id", tenantId)
      .eq("id", campusId)
      .maybeSingle();
    if (data) campus = { name: data.name as string, supplierId: (data.supplier_id as string | null) ?? null };
  }

  const voltarHref = campus?.supplierId ? `/admin/fornecedores/${campus.supplierId}` : null;
  const novaTaxaHref = campusId ? `/admin/precos/taxas/nova?campus_id=${campusId}` : "/admin/precos/taxas/nova";

  return (
    <div className="mx-auto max-w-4xl">
      {voltarHref ? (
        <Link href={voltarHref} className="mb-1 block text-sm text-brand-golddark hover:underline">← Fornecedor</Link>
      ) : null}
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">{campus ? `Taxas — ${campus.name}` : "Taxas"}</h1>
        <Link href={novaTaxaHref} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">+ Nova taxa</Link>
      </div>
      {campus ? (
        <p className="mb-4 text-sm text-neutral-600">
          Mostrando apenas as taxas de <b>{campus.name}</b>.{" "}
          <Link href="/admin/precos/taxas" className="text-brand-golddark hover:underline">Ver todas as escolas →</Link>
        </p>
      ) : (
        <p className="mb-4 text-sm text-neutral-600">
          Taxas de matrícula, material, serviço etc. — valor fixo ou derivado de uma tabela de preço.
          Aplicam-se por tipo de produto e/ou produtos específicos.
        </p>
      )}

      <TaxasListClient taxas={taxas} />
    </div>
  );
}
