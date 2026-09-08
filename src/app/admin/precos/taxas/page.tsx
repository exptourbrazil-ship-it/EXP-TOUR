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
export default async function AdminTaxasPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/taxas");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const taxas = await listarTaxasAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Taxas</h1>
        <Link href="/admin/precos/taxas/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">+ Nova taxa</Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Taxas de matrícula, material, serviço etc. — valor fixo ou derivado de uma tabela de preço.
        Aplicam-se por tipo de produto e/ou produtos específicos.
      </p>

      <TaxasListClient taxas={taxas} />
    </div>
  );
}
