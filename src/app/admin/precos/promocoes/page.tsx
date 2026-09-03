import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPromocoesAdmin } from "@/lib/promocao-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Promoções manuais do Admin. Autorização por capacidade fornecedores.gerir.
const TIPO: Record<string, string> = {
  percent_off: "Desconto %", fixed_off: "Desconto fixo", free_units: "Unidades grátis",
  waive_fee: "Isentar taxa", free_product: "Produto grátis", override_price: "Preço promocional",
};
const APLICA: Record<string, string> = {
  tuition: "Curso", accommodation: "Acomodação", insurance: "Seguro", fees: "Taxas",
  specific_fee: "Taxa específica", total: "Total", specific_product: "Produto específico",
};
const STATUS: Record<string, string> = { draft: "Rascunho", active: "Ativo", expired: "Expirado" };

export default async function AdminPromocoesPage() {
  await exigirCapacidade("fornecedores.gerir", "/admin/precos/promocoes");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const promocoes = await listarPromocoesAdmin(supabase, tenantId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-serif text-2xl text-brand">Promoções</h1>
        <Link href="/admin/precos/promocoes/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">+ Nova promoção</Link>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Descontos, isenções e ofertas por fornecedor. Aplicam-se na cotação conforme o alvo, as janelas
        de reserva/viagem e a segmentação.
      </p>

      {promocoes.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma promoção cadastrada.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Aplica a</th>
                <th className="px-4 py-2">Fornecedor</th>
                <th className="px-4 py-2">Prio.</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {promocoes.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">
                    {p.name}
                    {p.isStackable ? <span className="ml-2 text-xs text-neutral-400">(empilhável)</span> : null}
                    {p.segmentos > 0 ? <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">{p.segmentos} seg.</span> : null}
                  </td>
                  <td className="px-4 py-2">{TIPO[p.promoType] ?? p.promoType}{p.value != null ? ` · ${p.value}` : ""}</td>
                  <td className="px-4 py-2 text-neutral-500">{APLICA[p.appliesTo] ?? p.appliesTo}</td>
                  <td className="px-4 py-2 text-neutral-500">{p.supplierName ?? "—"}{p.campusName ? ` · ${p.campusName}` : ""}</td>
                  <td className="px-4 py-2">{p.priority}</td>
                  <td className="px-4 py-2">{STATUS[p.status] ?? p.status}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/promocoes/${p.id}`} className="text-brand-golddark hover:underline">Editar →</Link>
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
