import { exigirCapacidade } from "@/lib/admin-guard";
import IofVigenciaClient from "./IofVigenciaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config de IOF-câmbio por vigência (§8). Só Gestor (config.gerir). O client faz
// o CRUD via /api/admin/config/iof-vigencia.
export default async function AdminIofVigenciaPage() {
  // Capacidade, nao so sessao — igual a tela do spread.
  await exigirCapacidade("config.gerir", "/admin/config/iof");
  return <IofVigenciaClient />;
}
