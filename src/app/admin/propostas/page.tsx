import { exigirAdmin } from "@/lib/admin-guard";
import PropostasClient from "./PropostasClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina admin: criar e gerenciar propostas (checkout / estados 0-1). O client
// cuida de listar/criar/cancelar via /api/admin/propostas. A pagina publica do
// link (/proposta/[token]) e a aceitacao entram nas Fases B/C.
export default async function AdminPropostasPage() {
  await exigirAdmin("/admin/propostas");
  return <PropostasClient />;
}
