import { exigirAdmin } from "@/lib/admin-guard";
import TermosClient from "./TermosClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida: gestao das versoes do Termo de Adesao. O client carrega a
// lista e cuida de criar/ativar via /api/admin/termos.
export default async function AdminTermosPage() {
  await exigirAdmin("/admin/termos");
  return <TermosClient />;
}
