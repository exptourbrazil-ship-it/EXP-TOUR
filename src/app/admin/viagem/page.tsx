import { exigirAdmin } from "@/lib/admin-guard";
import ViagemInfoClient from "./ViagemInfoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida: exige sessao de admin (login em /admin/login). Preenche os
// dados da aba Viagem (escola, acomodacao, contato local) de cada contrato.
export default async function AdminViagemPage() {
  const { usuario } = await exigirAdmin("/admin/viagem");
  return <ViagemInfoClient usuario={usuario} />;
}
