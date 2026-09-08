import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarMateriaisAdmin } from "@/lib/material-service";
import MateriaisListClient from "./MateriaisListClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Biblioteca de materiais dos fornecedores (doc 06 §3.3), para os consultores
// montarem propostas. Leitura por capacidade casos.ver (todos os papéis). Filtro
// por escola no servidor; indicadores, busca e filtro por validade no client.
export default async function AdminMateriaisPage({ searchParams }: { searchParams: Promise<{ supplier?: string }> }) {
  await exigirCapacidade("casos.ver", "/admin/materiais");
  const { supplier } = await searchParams;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);
  const hoje = new Date().toISOString().slice(0, 10);

  const [{ data: fornecedores }, materiais] = await Promise.all([
    supabase.from("supplier").select("id, display_name").eq("tenant_id", tenantId).order("display_name"),
    listarMateriaisAdmin(supabase, tenantId, hoje, supplier || undefined),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-serif text-2xl text-brand">Materiais</h1>
      <p className="mb-4 text-sm text-neutral-600">
        Biblioteca de materiais das escolas (brochuras, fotos, vídeos, mídia kit). Use para anexar à proposta do estudante.
      </p>

      <form className="mb-4">
        <select name="supplier" defaultValue={supplier || ""} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          <option value="">Todas as escolas</option>
          {(fornecedores ?? []).map((f: { id: string; display_name: string }) => (
            <option key={f.id} value={f.id}>{f.display_name}</option>
          ))}
        </select>
        <button type="submit" className="ml-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">Filtrar</button>
      </form>

      <MateriaisListClient materiais={materiais} hoje={hoje} />
    </div>
  );
}
