import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoTenant, listarProdutosAdmin } from "@/lib/produto-admin-service";
import { listarSuppliersDoTenant } from "@/lib/promocao-admin-service";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";
import PromocaoEditor, { type PromocaoInicial } from "@/components/PromocaoEditor";

// Corpo COMPARTILHADO do editor de promoção. Carrega as listas de referência do
// tenant (fornecedores, campi, produtos, taxas) e renderiza o PromocaoEditor com
// um `inicial` já computado pela página (edição ou criação/prefill). Usado pela
// tela global (/admin/precos/promocoes/...) e DENTRO do hub do fornecedor.
export default async function PromocaoEditorCorpo({
  titulo,
  voltarHref,
  voltarLabel,
  inicial,
}: {
  titulo: string;
  voltarHref: string;
  voltarLabel: string;
  inicial?: PromocaoInicial;
}) {
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

  return (
    <div>
      <Link href={voltarHref} className="text-sm text-brand-golddark hover:underline">← {voltarLabel}</Link>
      <h1 className="mb-4 mt-1 font-serif text-2xl text-brand">{titulo}</h1>
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
