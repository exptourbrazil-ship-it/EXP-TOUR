import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarProdutosAdmin } from "@/lib/produto-admin-service";
import ProdutosListClient from "./ProdutosListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catálogo de produtos do Admin (escrita em todos os verticais). Carrega o
// catálogo do tenant no servidor e entrega ao client, que cuida de indicadores,
// filtro por tipo, busca e badges. Autorização por capacidade fornecedores.gerir
// (a rota de API revalida em cada mutação).
export default async function AdminProdutosPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/produtos");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const produtos = await listarProdutosAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Produtos</h1>
        <Link href="/admin/produtos/novo" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Novo produto
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Catálogo do tenant: programas, acomodações, seguros, complementares (transfer etc.) e pacotes.
        As alterações valem na hora.
      </p>

      <ProdutosListClient produtos={produtos} />
    </div>
  );
}
