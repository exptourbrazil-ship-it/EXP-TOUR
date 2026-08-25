import { exigirCapacidade } from "@/lib/admin-guard";
import FornecedoresClient from "./FornecedoresClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Painel de fornecedores: sincroniza os Vendors do Zoho CRM para a tabela
// supplier (e cria o acesso do portal). Autorizacao por capacidade
// fornecedores.gerir (a rota de API revalida).
export default async function AdminFornecedoresPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  return <FornecedoresClient />;
}
