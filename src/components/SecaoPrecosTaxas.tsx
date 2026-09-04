import Link from "next/link";
import type { PrecoVinculado, TaxaVinculada } from "@/lib/produto-admin-service";

// Seção "Preços & Taxas" da página unificada de produto (estilo Edvisor: o
// bloco "Fees" com Price + Other Fees). Presentacional (sem estado): lista as
// tabelas de preço e as taxas VINCULADAS a este produto, cada uma com link para
// o editor dedicado, e atalhos de criação. Linhas "geridas" (vindas de price
// list de escola) aparecem com selo de só-leitura. A edição de fato continua
// nas telas dedicadas — aqui reunimos as dimensões num lugar só.

const UNIT_LABEL: Record<string, string> = { week: "semana", day: "dia", month: "mês", unit: "unidade", stay: "estadia" };
const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativa", inactive: "Inativa" };
const FEE_TYPE_LABEL: Record<string, string> = {
  enrollment: "Matrícula", material: "Material", accommodation_placement: "Colocação",
  courier: "Correio", insurance: "Seguro", bank: "Bancária", other: "Outra",
};

function SeloGerida() {
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
      da escola
    </span>
  );
}

function fmtData(d: string | null): string {
  if (!d) return "—";
  const [a, m, dia] = d.split("-");
  return dia ? `${dia}/${m}/${a}` : d;
}

export default function SecaoPrecosTaxas({
  precos,
  taxas,
}: {
  precos: PrecoVinculado[];
  taxas: TaxaVinculada[];
}) {
  return (
    <div className="space-y-8">
      {/* Preço */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg text-brand">Preço</h2>
            <p className="text-xs text-neutral-500">Tabelas de preço vinculadas a este produto.</p>
          </div>
          <Link href="/admin/precos/tabelas/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
            + Nova tabela
          </Link>
        </div>
        {precos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            Nenhuma tabela de preço vinculada. Crie uma tabela e vincule este produto para cotá-lo.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Tabela</th>
                  <th className="px-4 py-2">Moeda / Unidade</th>
                  <th className="px-4 py-2">Vigência</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="text-neutral-700">
                {precos.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 text-brand">
                        {p.name}
                        {p.gerida ? <SeloGerida /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {p.currency} · {UNIT_LABEL[p.unit] ?? p.unit}
                    </td>
                    <td className="px-4 py-2 text-neutral-500">
                      {fmtData(p.validFrom)} → {p.validUntil ? fmtData(p.validUntil) : "sem fim"}
                    </td>
                    <td className="px-4 py-2">{STATUS_LABEL[p.status] ?? p.status}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/admin/precos/tabelas/${p.id}`} className="text-brand-golddark hover:underline">
                        {p.gerida ? "Ver →" : "Editar →"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Outras taxas */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg text-brand">Outras taxas</h2>
            <p className="text-xs text-neutral-500">Taxas vinculadas a este produto (matrícula, material, correio etc.).</p>
          </div>
          <Link href="/admin/precos/taxas/nova" className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
            + Nova taxa
          </Link>
        </div>
        {taxas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
            Nenhuma taxa vinculada a este produto.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Taxa</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Valor</th>
                  <th className="px-4 py-2">Obrigatória</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="text-neutral-700">
                {taxas.map((t) => (
                  <tr key={t.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2 text-brand">
                        {t.name}
                        {t.gerida ? <SeloGerida /> : null}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-neutral-500">{FEE_TYPE_LABEL[t.feeType] ?? t.feeType}</td>
                    <td className="px-4 py-2 text-neutral-500">
                      {t.amount != null ? `${t.currency ?? ""} ${t.amount.toFixed(2)}`.trim() : "por tabela"}
                    </td>
                    <td className="px-4 py-2">{t.isMandatory ? "Sim" : "Não"}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/admin/precos/taxas/${t.id}`} className="text-brand-golddark hover:underline">
                        {t.gerida ? "Ver →" : "Editar →"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
