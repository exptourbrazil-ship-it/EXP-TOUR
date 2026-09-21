import { exigirCapacidade } from "@/lib/admin-guard";
import SpreadVigenciaClient from "./SpreadVigenciaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Config do spread de intermediação e câmbio por vigência. Só Gestor
// (config.gerir). O client faz o CRUD via /api/admin/config/spread-vigencia.
export default async function AdminSpreadVigenciaPage() {
  // Capacidade, nao so sessao: e a tela que define quanto todo estudante paga.
  await exigirCapacidade("config.gerir", "/admin/config/spread");
  return <SpreadVigenciaClient />;
}
