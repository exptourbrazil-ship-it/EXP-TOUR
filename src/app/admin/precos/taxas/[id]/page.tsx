import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { listarTabelasPrecoAdmin } from "@/lib/price-template-admin-service";
import { obterTaxaAdmin } from "@/lib/fee-admin-service";
import TaxaEditor from "@/components/TaxaEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar taxa manual. Taxa GERIDA por price list (source_submission_id != NULL) é
// só leitura aqui — pertence ao fluxo de aprovação em /admin/precos.
export default async function EditarTaxaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/precos/taxas/${id}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const taxa = await obterTaxaAdmin(supabase, tenantId, id);
  if (!taxa) notFound();

  const [campi, produtos, tabelas] = await Promise.all([
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    listarTabelasPrecoAdmin(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/precos/taxas" className="text-sm text-brand-golddark hover:underline">← Taxas</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">
        {taxa.gerida ? "Taxa" : "Editar taxa"}
        <span className="text-neutral-400"> — {String(taxa.fee.name ?? "")}</span>
      </h1>

      {taxa.gerida ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Esta taxa veio de um <b>price list de escola</b> e é gerida pelo fluxo de aprovação. Para alterá-la,
          use a fila em <Link href="/admin/precos" className="underline">Preços — aprovação</Link>. Aqui é somente leitura.
        </div>
      ) : (
        <TaxaEditor
          campi={campi}
          produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind, campusId: p.campusId }))}
          templates={tabelas.map((t) => ({ id: t.id, name: t.name, currency: t.currency, campusId: t.campusId }))}
          inicial={{ id, fee: taxa.fee, product_ids: taxa.product_ids }}
        />
      )}
    </div>
  );
}
