import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarMateriaisAdmin } from "@/lib/material-service";
import MateriaisListClient from "@/app/admin/materiais/MateriaisListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba Material do hub: biblioteca de materiais deste fornecedor. Reusa a lista de
// materiais, filtrada por supplier no servidor. (F2 acrescenta aqui o fluxo de
// aprovação e o upload pelo admin.)
export default async function FornecedorMateriaisPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const hoje = new Date().toISOString().slice(0, 10);
  const materiais = await listarMateriaisAdmin(supabase, tenantId, hoje, id);

  return (
    <div>
      <h2 className="mb-3 font-serif text-lg text-brand">Material</h2>
      <MateriaisListClient materiais={materiais} hoje={hoje} />
    </div>
  );
}
