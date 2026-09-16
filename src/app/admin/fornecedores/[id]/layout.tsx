import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { FORNECEDOR_STATUS_LABEL, FORNECEDOR_STATUS_BADGE } from "@/lib/fornecedor";
import { carregarFornecedorDoTenant } from "@/lib/fornecedor-hub-service";
import HubTabs from "./HubTabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hub do fornecedor (F1): a Área Admin passa a ser CENTRADA em cada fornecedor.
// Este layout carrega o fornecedor (escopado por tenant — notFound se não for do
// tenant), desenha o cabeçalho + as abas, e cada aba (página filha) renderiza o
// conteúdo daquele fornecedor. Autorização por capacidade fornecedores.gerir.
export default async function FornecedorHubLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const fornecedor = await carregarFornecedorDoTenant(supabase, tenantId, id);
  if (!fornecedor) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/fornecedores" className="text-xs text-neutral-500 hover:text-brand">
        ← Fornecedores
      </Link>

      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-2xl text-brand">{fornecedor.displayName}</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            FORNECEDOR_STATUS_BADGE[fornecedor.status] ?? "bg-neutral-100 text-neutral-600"
          }`}
        >
          {FORNECEDOR_STATUS_LABEL[fornecedor.status] ?? fornecedor.status}
        </span>
        {fornecedor.preferido ? <span className="text-xs text-brand-golddark">★ preferido</span> : null}
        {fornecedor.country ? <span className="text-xs text-neutral-400">{fornecedor.country}</span> : null}
      </div>

      <HubTabs supplierId={fornecedor.id} />

      {children}
    </div>
  );
}
