import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarConteudoPendentesAdmin } from "@/lib/content-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila de CONTEÚDO de programa proposto pelas escolas, aguardando aprovação.
// Consulta de catálogo: exige fornecedores.gerir (Gestor/Operação).
export default async function AdminConteudoPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/conteudo");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const pendentes = await listarConteudoPendentesAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Inventário</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Conteúdo dos cursos</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Conteúdo enviado pelas escolas para publicar na cotação. Revise e aprove — a aprovação publica no
          catálogo (o que o estudante vê na cotação).
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3 font-medium">Curso</th>
              <th className="px-4 py-3 font-medium">Escola</th>
              <th className="px-4 py-3 font-medium">Enviado por</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {pendentes.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100 last:border-0 hover:bg-brand-cream/30">
                <td className="px-4 py-3 font-medium text-brand">{p.productName || "(curso)"}</td>
                <td className="px-4 py-3 text-neutral-600">{p.supplierName || "—"}</td>
                <td className="px-4 py-3 text-neutral-500">{p.submittedBy || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/conteudo/${p.id}`} className="inline-block rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-cream/40">
                    Revisar
                  </Link>
                </td>
              </tr>
            ))}
            {pendentes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-500">
                  Nenhum conteúdo aguardando aprovação.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
