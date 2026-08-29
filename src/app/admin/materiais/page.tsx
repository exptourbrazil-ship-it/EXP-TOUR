import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarMateriaisAdmin } from "@/lib/material-service";
import { TIPO_MATERIAL_LABEL, type TipoMaterial } from "@/lib/material-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IDIOMA_LABEL: Record<string, string> = { en: "EN", pt: "PT", es: "ES" };

// Biblioteca de materiais dos fornecedores (doc 06 §3.3), para os consultores
// montarem propostas. Leitura por capacidade casos.ver (todos os papéis). Filtro
// opcional por fornecedor.
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
          {(fornecedores ?? []).map((f: any) => (
            <option key={f.id} value={f.id}>{f.display_name}</option>
          ))}
        </select>
        <button type="submit" className="ml-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50">Filtrar</button>
      </form>

      {materiais.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum material.</p>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-auto">
          <table className="w-full text-left text-sm" style={{ minWidth: 640 }}>
            <thead className="text-neutral-400 text-xs">
              <tr>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Escola</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Permissão</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {materiais.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand font-medium">
                    {m.titulo}
                    {m.vencido ? <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">vencido</span> : null}
                    {m.programa ? <div className="text-xs text-neutral-400">{m.programa}</div> : null}
                  </td>
                  <td className="px-4 py-2">{m.supplierNome || "—"}</td>
                  <td className="px-4 py-2">{TIPO_MATERIAL_LABEL[m.tipo as TipoMaterial] || m.tipo} · {IDIOMA_LABEL[m.idioma] || m.idioma}</td>
                  <td className="px-4 py-2">
                    <span className={m.permissao === "cliente" ? "text-green-700" : "text-amber-700"}>
                      {m.permissao === "cliente" ? "cliente" : "interno"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {m.temArquivo ? (
                      <a href={`/api/admin/materiais/${m.id}/download`} className="text-brand-golddark hover:underline">Baixar</a>
                    ) : m.linkUrl ? (
                      <Link href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="text-brand-golddark hover:underline">Abrir link</Link>
                    ) : null}
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
