import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { obterPromocaoAdmin, listarSuppliersDoTenant } from "@/lib/promocao-admin-service";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";
import PromocaoEditor from "@/components/PromocaoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Editar promoção do tenant.
export default async function EditarPromocaoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await exigirCapacidade("fornecedores.gerir", `/admin/precos/promocoes/${id}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const promo = await obterPromocaoAdmin(supabase, tenantId, id);
  if (!promo) notFound();

  const [suppliers, campi, produtos, taxas] = await Promise.all([
    listarSuppliersDoTenant(supabase, tenantId),
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    listarTaxasAdmin(supabase, tenantId),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/precos/promocoes" className="text-sm text-brand-golddark hover:underline">← Promoções</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">
        Editar promoção <span className="text-neutral-400">— {String(promo.promotion.name ?? "")}</span>
      </h1>
      <PromocaoEditor
        suppliers={suppliers}
        campi={campi.map((c) => ({ id: c.id, name: c.name, supplierId: c.supplierId }))}
        produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind, campusId: p.campusId }))}
        fees={taxas.map((f) => ({ id: f.id, name: f.name, campusId: f.campusId }))}
        inicial={{ id, promotion: promo.promotion, targets: promo.targets }}
      />
    </div>
  );
}
