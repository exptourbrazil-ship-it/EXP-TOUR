import { exigirAdmin } from "@/lib/admin-guard";
import CambioClient from "./CambioClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida: exige sessao de admin (login em /admin/login). Antes esta
// tela pedia uma senha digitada (Bearer); agora usa a mesma sessao das demais
// telas admin.
export default async function AdminCambioPage() {
  await exigirAdmin("/admin/cambio");
  return <CambioClient />;
}
