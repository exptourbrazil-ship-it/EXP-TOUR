import Link from "next/link";
import type { PropostaPromocaoResumo } from "@/lib/promocao-proposta-service";

const TIPO: Record<string, string> = {
  percent_off: "Desconto %",
  fixed_off: "Desconto fixo",
  free_units: "Unidades grátis",
  waive_fee: "Isentar taxa",
  free_product: "Produto grátis",
  override_price: "Preço promocional",
};

// Bloco "Propostas lidas por IA" (F3.3): aparece na lista de promoções do admin e na
// aba Promoções do hub. Só lista — publicar/recusar é na tela de revisão.
export default function PropostasPromocaoBloco({ propostas, mostrarFornecedor = true }: { propostas: PropostaPromocaoResumo[]; mostrarFornecedor?: boolean }) {
  if (propostas.length === 0) return null;
  return (
    <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-serif text-base text-brand">Propostas lidas por IA</h2>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{propostas.length}</span>
      </div>
      <p className="mb-3 text-xs text-neutral-600">
        Promoções encontradas em materiais (price list, brochura ou flyer). Nada chega à cotação até você revisar e <strong>publicar</strong>.
      </p>
      <ul className="divide-y divide-blue-100">
        {propostas.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium text-brand">
                {p.nome}
                {p.avisos.length > 0 ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800" title={p.avisos.join(" · ")}>
                    {p.avisos.length} aviso{p.avisos.length > 1 ? "s" : ""}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-neutral-500">
                {mostrarFornecedor && p.supplierNome ? `${p.supplierNome} · ` : ""}
                {p.tipo ? TIPO[p.tipo] ?? p.tipo : "tipo a definir"}
                {p.valor != null ? ` ${p.valor}` : ""}
                {p.reservaAte ? ` · reservar até ${p.reservaAte}` : " · sem prazo"}
                {p.sourceFilename ? ` · ${p.sourceFilename}` : ""}
              </div>
            </div>
            <Link href={`/admin/precos/promocoes/propostas/${p.id}`} className="text-brand-golddark hover:underline">
              Revisar →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
