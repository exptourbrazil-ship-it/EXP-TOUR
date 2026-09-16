import { exigirAdmin } from "@/lib/admin-guard";
import IofVigenciaClient from "./IofVigenciaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config de IOF-câmbio por vigência (§8). Só Gestor (config.gerir). O client faz
// o CRUD via /api/admin/config/iof-vigencia.
export default async function AdminIofVigenciaPage() {
  await exigirAdmin("/admin/config/iof");
  return <IofVigenciaClient />;
}
