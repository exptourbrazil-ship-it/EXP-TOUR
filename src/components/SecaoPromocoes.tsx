import Link from "next/link";
import type { PromocaoDoProduto } from "@/lib/produto-admin-service";

// Seção "Promoções" da página unificada de produto. Presentacional (só leitura):
// lista as promoções que miram este produto (alvo dimension='product' ou
// applies_to='specific_product'), com link para o editor dedicado e atalho de
// criação. A edição de fato vive na tela de promoção.

const PROMO_TYPE_LABEL: Record<string, string> = {
  percent_off: "% de desconto", fixed_off: "Desconto fixo", free_units: "Unidades grátis",
  waive_fee: "Isenção de taxa", free_product: "Produto grátis", override_price: "Preço fixo",
};
const APPLIES_LABEL: Record<string, string> = {
  tuition: "Curso", accommodation: "Acomodação", insurance: "Seguro", fees: "Taxas",
  specific_fee: "Taxa específica", total: "Total", specific_product: "Produto específico",
};
const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativa", expired: "Expirada" };
const STATUS_COR: Record<string, string> = { draft: "text-neutral-500", active: "text-green-700", expired: "text-red-700" };

function fmtValor(p: PromocaoDoProduto): string {
  if (p.value == null) return "—";
  if (p.promoType === "percent_off") return `${p.value}%`;
  if (p.promoType === "free_units") return `${p.value} un.`;
  return p.value.toFixed(2);
}

export default function SecaoPromocoes({ promocoes, productId }: { promocoes: PromocaoDoProduto[]; productId: string }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg text-brand">Promoções</h2>
          <p className="text-xs text-neutral-500">Promoções que miram este produto (alvo por produto).</p>
        </div>
        <Link href={`/admin/precos/promocoes/nova?produto=${productId}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
          + Nova promoção
        </Link>
      </div>

      {promocoes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
          Nenhuma promoção mira este produto diretamente. Promoções por campus, mercado ou nacionalidade
          continuam valendo pela cotação — gerencie-as na tela de promoções.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Promoção</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Aplica a</th>
                <th className="px-4 py-2">Valor</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {promocoes.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-brand">{p.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{PROMO_TYPE_LABEL[p.promoType] ?? p.promoType}</td>
                  <td className="px-4 py-2 text-neutral-500">{APPLIES_LABEL[p.appliesTo] ?? p.appliesTo}</td>
                  <td className="px-4 py-2 text-neutral-500">{fmtValor(p)}</td>
                  <td className={`px-4 py-2 font-medium ${STATUS_COR[p.status] ?? "text-neutral-600"}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/admin/precos/promocoes/${p.id}`} className="text-brand-golddark hover:underline">
                      Editar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
