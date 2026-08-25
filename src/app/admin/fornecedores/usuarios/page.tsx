import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import UsuariosClient, { type SupplierComUsuarios } from "./UsuariosClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gestao de usuarios do Portal do Fornecedor: convidar (criar) acessos a mao
// (escolas sem e-mail no Zoho ou 2o contato) e ativar/desativar. Autorizacao por
// capacidade fornecedores.gerir (a rota de API revalida).
export default async function AdminFornecedorUsuariosPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores/usuarios");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const [{ data: suppliers }, { data: usuarios }] = await Promise.all([
    supabase.from("supplier").select("id, display_name, country_code").order("display_name"),
    supabase
      .from("supplier_user")
      .select("id, supplier_id, name, email, role, language, active, zoho_vendor_id")
      .is("archived_at", null)
      .order("created_at", { ascending: true }),
  ]);

  // Agrupa os usuarios por fornecedor para a UI.
  const porSupplier = new Map<string, SupplierComUsuarios["usuarios"]>();
  for (const u of usuarios ?? []) {
    const lista = porSupplier.get(u.supplier_id) ?? [];
    lista.push({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      language: u.language,
      active: u.active,
      origem: u.zoho_vendor_id ? "zoho" : "manual",
    });
    porSupplier.set(u.supplier_id, lista);
  }

  const dados: SupplierComUsuarios[] = (suppliers ?? []).map((s) => ({
    id: s.id,
    displayName: s.display_name,
    countryCode: s.country_code ?? null,
    usuarios: porSupplier.get(s.id) ?? [],
  }));

  return <UsuariosClient suppliers={dados} />;
}
