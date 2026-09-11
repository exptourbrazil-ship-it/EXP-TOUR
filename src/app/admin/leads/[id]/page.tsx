import { notFound } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { carregarLead } from "@/lib/admin-leads";
import LeadCasoClient from "./LeadCasoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Caso 360 do lead: dados do titular/participante, programa escolhido, snapshot
// do orcamento e aceite dos termos. Ações do funil (mudar status) e o gancho de
// conversao em cliente. Consulta comercial: exige propostas.gerir.
export default async function AdminLeadCasoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("propostas.gerir", "/admin/leads");
  const { id } = await params;

  let lead;
  try {
    lead = await carregarLead(id);
  } catch {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl text-brand">Lead</h1>
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar o lead agora. Tente novamente em instantes.
        </p>
      </div>
    );
  }
  if (!lead) notFound();

  return <LeadCasoClient lead={lead} />;
}
