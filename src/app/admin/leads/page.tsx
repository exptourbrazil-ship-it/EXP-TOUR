import { exigirCapacidade } from "@/lib/admin-guard";
import { carregarLeads } from "@/lib/admin-leads";
import LeadsClient from "./LeadsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila de LEADS do orcamento (funil de captacao). Consulta comercial: exige
// propostas.gerir (Consultor/Gestor). Carrega no servidor e entrega ao client,
// que cuida de busca, filtro por status e ordenacao.
export default async function AdminLeadsPage() {
  await exigirCapacidade("propostas.gerir", "/admin/leads");

  let leads;
  try {
    leads = await carregarLeads();
  } catch {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl text-brand">Leads</h1>
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os leads agora. Tente novamente em instantes.
        </p>
      </div>
    );
  }

  return <LeadsClient leads={leads} />;
}
