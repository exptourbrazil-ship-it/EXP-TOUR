import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarCampusDoFornecedor } from "@/lib/fornecedor-hub-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  draft: "bg-neutral-100 text-neutral-600",
  inactive: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = { active: "Ativo", draft: "Rascunho", inactive: "Inativo" };

// Aba Escolas/Campus do hub: unidades (campus) do fornecedor. A política do campus
// (Anexo III) fica na tela de configuração dedicada.
export default async function FornecedorEscolasPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const campus = await listarCampusDoFornecedor(supabase, tenantId, id);

  const base = `/admin/fornecedores/${id}`;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-serif text-lg text-brand">Meus Campi</h2>
        <Link href={`${base}/campus/novo`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Novo campus
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Unidades deste fornecedor. A política de cada campus (Anexo III: taxas obrigatórias, exigência de
        antecipação, reembolso) fica em{" "}
        <Link href="/admin/config/campus" className="text-brand-golddark hover:underline">
          Política do campus
        </Link>
        .
      </p>

      {campus.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum campus cadastrado para este fornecedor.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Campus</th>
                <th className="px-4 py-2">Cidade</th>
                <th className="px-4 py-2">País</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {campus.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-brand">{c.nome}</td>
                  <td className="px-4 py-2 text-neutral-500">{c.cidade ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{c.pais ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`${base}/campus/${c.id}`} className="font-medium text-brand-golddark hover:underline">
                      Editar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
