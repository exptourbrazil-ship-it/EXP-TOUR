import { exigirAdmin } from "@/lib/admin-guard";
import DocumentosAdminClient from "./DocumentosAdminClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida: exige sessao de admin (login em /admin/login). Antes esta
// tela pedia uma senha digitada (Bearer); agora usa a mesma sessao das demais
// telas admin.
export default async function AdminDocumentosPage() {
  await exigirAdmin("/admin/documentos");
  return <DocumentosAdminClient />;
}
