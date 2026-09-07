import { exigirCapacidade } from "@/lib/admin-guard";
import TermosClient from "./TermosClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida (Configuracao): gestao das versoes do Termo de Adesao. O
// client carrega a lista e cria/ativa via /api/admin/termos — todas gateadas por
// `config.gerir` (Gestor). A pagina exige a MESMA capacidade, para nao renderizar
// um shell nao-funcional a quem as rotas negariam.
export default async function AdminTermosPage() {
  await exigirCapacidade("config.gerir", "/admin/termos");
  return <TermosClient />;
}
