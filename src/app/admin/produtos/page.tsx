import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarProdutosAdmin } from "@/lib/produto-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catálogo de produtos do Admin (escrita em todos os verticais). Lista os
// produtos do tenant com filtro por tipo. Autorização por capacidade
// fornecedores.gerir (a rota de API revalida em cada mutação).
const KIND_LABEL: Record<string, string> = {
  program: "Programa", accommodation: "Acomodação", insurance: "Seguro", other: "Complementar", package: "Pacote",
};
const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", inactive: "Inativo" };
const VIS_LABEL: Record<string, string> = { hidden: "Oculto", internal: "Interno", quotable: "Cotável", sellable: "Vendável" };
const SOURCE_LABEL: Record<string, string> = { internal: "Interno", supplier: "Fornecedor" };

const FILTROS = [
  { k: "", label: "Todos" },
  { k: "program", label: "Programas" },
  { k: "accommodation", label: "Acomodações" },
  { k: "insurance", label: "Seguros" },
  { k: "other", label: "Complementares" },
  { k: "package", label: "Pacotes" },
];

export default async function AdminProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/produtos");
  const { kind } = await searchParams;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const produtos = await listarProdutosAdmin(supabase, tenantId, kind ? { kind } : undefined);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Produtos</h1>
        <Link href="/admin/produtos/novo" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Novo produto
        </Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Catálogo do tenant: programas, acomodações, seguros, complementares (transfer etc.) e pacotes.
        As alterações valem na hora.
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => {
          const ativo = (kind ?? "") === f.k;
          return (
            <Link
              key={f.k || "todos"}
              href={f.k ? `/admin/produtos?kind=${f.k}` : "/admin/produtos"}
              className={`rounded-full px-3 py-1 text-xs font-medium ${ativo ? "bg-brand text-brand-cream" : "border border-neutral-300 bg-white text-brand"}`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {produtos.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum produto {kind ? "deste tipo " : ""}cadastrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Fornecedor / Campus</th>
                <th className="px-4 py-2">Fonte</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Visibilidade</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {produtos.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">{p.name}</td>
                  <td className="px-4 py-2">{KIND_LABEL[p.kind] ?? p.kind}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {p.supplierName ?? "—"}{p.campusName ? ` · ${p.campusName}` : ""}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{SOURCE_LABEL[p.source] ?? p.source}</td>
                  <td className="px-4 py-2">{STATUS_LABEL[p.status] ?? p.status}</td>
                  <td className="px-4 py-2">{VIS_LABEL[p.visibility] ?? p.visibility}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/produtos/${p.id}`} className="text-brand-golddark hover:underline">
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
