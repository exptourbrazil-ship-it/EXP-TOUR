import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarTabelasPrecoAdmin } from "@/lib/price-template-admin-service";
import TabelasPrecoListClient from "./TabelasPrecoListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tabelas de preço MANUAIS do Admin (complementa a fila de aprovação de price
// list em /admin/precos). Autorização por capacidade fornecedores.gerir.
// Carrega no servidor e delega ao client (indicadores, filtro por status,
// busca, badges).
export default async function AdminTabelasPrecoPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/tabelas");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const tabelas = await listarTabelasPrecoAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Tabelas de preço</h1>
        <Link href="/admin/precos/tabelas/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Nova tabela
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Tabelas de preço montadas à mão pelo Admin (faixas por quantidade). Para aprovar price lists
        enviados pelas escolas, veja <Link href="/admin/precos" className="text-brand-golddark hover:underline">Preços — aprovação</Link>.
      </p>

      <TabelasPrecoListClient tabelas={tabelas} />
    </div>
  );
}
