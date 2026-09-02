import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Taxas manuais do Admin (matrícula/material/serviço etc.). Autorização por
// capacidade fornecedores.gerir.
const TIPO: Record<string, string> = {
  registration: "Matrícula", material: "Material", bank: "Bancária", placement: "Colocação",
  service: "Serviço", courier: "Courier", courier_of_documents: "Courier docs", custom: "Personalizada",
};
const KIND: Record<string, string> = { program: "Programa", accommodation: "Acomodação", insurance: "Seguro", other: "Complementar", package: "Pacote" };

export default async function AdminTaxasPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/taxas");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const taxas = await listarTaxasAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Taxas</h1>
        <Link href="/admin/precos/taxas/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">+ Nova taxa</Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Taxas de matrícula, material, serviço etc. — valor fixo ou derivado de uma tabela de preço.
        Aplicam-se por tipo de produto e/ou produtos específicos.
      </p>

      {taxas.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma taxa cadastrada.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Valor</th>
                <th className="px-4 py-2">Aplica a</th>
                <th className="px-4 py-2">Campus</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {taxas.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">
                    {t.name}
                    {t.gerida ? <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">price list</span> : null}
                    {!t.isMandatory ? <span className="ml-2 text-xs text-neutral-400">(opcional)</span> : null}
                  </td>
                  <td className="px-4 py-2">{TIPO[t.feeType] ?? t.feeType}</td>
                  <td className="px-4 py-2">{t.modo === "fixo" ? `${t.currency ?? ""} ${t.amount != null ? t.amount.toFixed(2) : ""}` : "tabela"}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {t.appliesToKinds.length ? t.appliesToKinds.map((k) => KIND[k] ?? k).join(", ") : "—"}
                    {t.produtos > 0 ? ` · ${t.produtos} produto(s)` : ""}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{t.campusName ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/taxas/${t.id}`} className="text-brand-golddark hover:underline">{t.gerida ? "Ver →" : "Editar →"}</Link>
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
