import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import FornecedoresClient from "./FornecedoresClient";
import FornecedoresAtuaisClient, { type FornecedorLista } from "./FornecedoresAtuaisClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Painel de fornecedores: sincroniza os Vendors do Zoho CRM para a tabela
// supplier (e cria o acesso do portal) e, abaixo, lista os fornecedores já
// cadastrados (indicadores/busca/filtro). Autorizacao por capacidade
// fornecedores.gerir (a rota de API revalida).
export default async function AdminFornecedoresPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);

  // Fornecedores do tenant (não arquivados) + acessos ativos do portal para
  // marcar "com acesso". Ambos escopados pelo tenant.
  const [{ data: suppliers }, { data: acessos }] = await Promise.all([
    supabase
      .from("supplier")
      .select("id, display_name, country_code, website, relationship_status, is_preferred")
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .order("display_name"),
    supabase.from("supplier_user").select("supplier_id").eq("tenant_id", tenantId).eq("active", true),
  ]);

  const comAcesso = new Set((acessos ?? []).map((a: { supplier_id: string }) => a.supplier_id));
  const fornecedores: FornecedorLista[] = (suppliers ?? []).map((s: {
    id: string;
    display_name: string;
    country_code: string | null;
    website: string | null;
    relationship_status: string;
    is_preferred: boolean;
  }) => ({
    id: s.id,
    name: s.display_name,
    country: s.country_code,
    website: s.website,
    status: s.relationship_status,
    preferido: s.is_preferred,
    temAcesso: comAcesso.has(s.id),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <FornecedoresClient />
      <FornecedoresAtuaisClient fornecedores={fornecedores} />
    </div>
  );
}
