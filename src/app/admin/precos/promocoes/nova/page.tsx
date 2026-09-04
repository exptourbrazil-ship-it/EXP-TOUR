import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { listarSuppliersDoTenant } from "@/lib/promocao-admin-service";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";
import PromocaoEditor from "@/components/PromocaoEditor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nova promoção. Carrega fornecedores, campi (com supplierId), produtos e taxas
// (para o alvo específico). Escrita via POST /api/admin/catalog/promotions.
// Prefill: ?produto=<id> pré-seleciona fornecedor/campus e já adiciona o alvo
// "produto" apontando para ele (validado contra a lista do tenant — posse).
export default async function NovaPromocaoPage({
  searchParams,
}: {
  searchParams: Promise<{ produto?: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/promocoes/nova");
  const { produto: produtoId } = await searchParams;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const [suppliers, campi, produtos, taxas] = await Promise.all([
    listarSuppliersDoTenant(supabase, tenantId),
    listarCampusDoTenant(supabase, tenantId),
    listarProdutosAdmin(supabase, tenantId),
    listarTaxasAdmin(supabase, tenantId),
  ]);

  // Prefill só se o produto for do tenant. Deriva o fornecedor pelo campus e
  // adiciona o alvo dimension='product' (não força applies_to='specific_product'
  // — o admin escolhe o que a promoção desconta).
  const alvo = produtoId ? produtos.find((p) => p.id === produtoId) : undefined;
  const campusDoAlvo = alvo ? campi.find((c) => c.id === alvo.campusId) : undefined;
  const inicial = alvo
    ? {
        promotion: {
          ...(campusDoAlvo?.supplierId ? { supplier_id: campusDoAlvo.supplierId } : {}),
          campus_id: alvo.campusId,
        },
        targets: [{ dimension: "product", value: alvo.id }],
      }
    : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/precos/promocoes" className="text-sm text-brand-golddark hover:underline">← Promoções</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">Nova promoção</h1>
      <PromocaoEditor
        suppliers={suppliers}
        campi={campi.map((c) => ({ id: c.id, name: c.name, supplierId: c.supplierId }))}
        produtos={produtos.map((p) => ({ id: p.id, name: p.name, kind: p.kind, campusId: p.campusId }))}
        fees={taxas.map((f) => ({ id: f.id, name: f.name, campusId: f.campusId }))}
        inicial={inicial}
      />
    </div>
  );
}
