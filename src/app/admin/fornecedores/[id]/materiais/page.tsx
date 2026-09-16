import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarMateriaisAdmin } from "@/lib/material-service";
import MateriaisHubClient from "./MateriaisHubClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba Material do hub (F2): fila de aprovação (fornecedor sobe -> pendente ->
// admin publica), upload direto pelo admin (nasce publicado) e biblioteca com
// status. Só material PUBLICADO alcança cliente e cotação. Escopo tenant+supplier.
export default async function FornecedorMateriaisPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const hoje = new Date().toISOString().slice(0, 10);
  const todos = await listarMateriaisAdmin(supabase, tenantId, hoje, id);
  const pendentes = todos.filter((m) => m.status === "pendente");
  const demais = todos.filter((m) => m.status !== "pendente");

  return (
    <div>
      <h2 className="mb-1 font-serif text-lg text-brand">Material</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Brochuras, price lists, fotos, vídeos e mídia kit deste fornecedor. O fornecedor sobe pelo portal e
        você publica; você também pode adicionar material direto.
      </p>
      <MateriaisHubClient supplierId={id} pendentes={pendentes} demais={demais} hoje={hoje} />
    </div>
  );
}
