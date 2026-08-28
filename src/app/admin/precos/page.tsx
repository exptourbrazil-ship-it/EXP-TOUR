import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { listarPendentesAdmin } from "@/lib/price-admin-service";
import { tenantIdAtual } from "@/lib/catalog-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila de aprovacao de price lists das escolas (Fase C). Capacidade
// fornecedores.gerir (a rota de API revalida). Aprovar publica o preco no
// catalogo (materializacao).
export default async function AdminPrecosPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const tenantId = await tenantIdAtual(supabase);
  const pendentes = await listarPendentesAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 font-serif text-2xl text-brand">Preços — aprovação</h1>
      <p className="mb-5 text-sm text-neutral-600">
        Price lists enviados pelas escolas, aguardando revisão. Ao aprovar, os preços são publicados
        no catálogo (e substituem o price list anterior daquela escola).
      </p>

      {pendentes.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum price list aguardando aprovação.</p>
      ) : (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-400 text-xs">
              <tr>
                <th className="px-4 py-2">Escola</th>
                <th className="px-4 py-2">Itens</th>
                <th className="px-4 py-2">Arquivo</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {pendentes.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">{s.supplierNome || "—"}</td>
                  <td className="px-4 py-2">{s.itens}{s.currency ? ` · ${s.currency}` : ""}</td>
                  <td className="px-4 py-2">{s.sourceFilename || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/${s.id}`} className="text-brand-golddark hover:underline">
                      Revisar →
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
