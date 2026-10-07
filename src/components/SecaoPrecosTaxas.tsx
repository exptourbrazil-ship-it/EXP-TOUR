"use client";

import { useRouter } from "next/navigation";
import ArquivarBotao, { avisosImpactoTabela } from "@/components/ArquivarBotao";
import Link from "next/link";
import type { PrecoVinculado, TaxaVinculada } from "@/lib/produto-admin-service";

// Seção "Preços & Taxas" da página unificada de produto (estilo Edvisor: o
// bloco "Fees" com Price + Other Fees). Presentacional (sem estado): lista as
// tabelas de preço e as taxas VINCULADAS a este produto, cada uma com link para
// o editor dedicado, e atalhos de criação. Linhas "geridas" (vindas de price
// list de escola) aparecem com selo de só-leitura. A edição de fato continua
// nas telas dedicadas — aqui reunimos as dimensões num lugar só. Os editores
// devolvem o admin a este produto no hub do fornecedor (nunca a uma lista geral).

const UNIT_LABEL: Record<string, string> = { week: "semana", day: "dia", month: "mês", unit: "unidade", stay: "estadia" };
const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativa", inactive: "Inativa" };
const FEE_TYPE_LABEL: Record<string, string> = {
  registration: "Matrícula", material: "Material", bank: "Bancária", placement: "Colocação",
  service: "Serviço", courier: "Correio", courier_of_documents: "Envio de documentos", custom: "Outra",
};

function SeloGerida() {
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
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
  productId,
  campusId,
}: {
  precos: PrecoVinculado[];
  taxas: TaxaVinculada[];
  productId: string;
  // Campus do produto atual — propagado na querystring para os editores de
  // tabela/taxa manterem o contexto da escola.
  campusId?: string | null;
}) {
  const router = useRouter();
  const q = campusId ? `?produto=${productId}&campus_id=${campusId}` : `?produto=${productId}`;
  // Contexto de retorno: ?produto= faz o "voltar"/pós-salvar dos editores
  // devolver o admin a esta aba (Preços & Taxas) do produto, dentro do hub.
  const qCampus = campusId ? `?produto=${productId}&campus_id=${campusId}` : `?produto=${productId}`;
  return (
    <div className="space-y-8">
      {/* Preço */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg text-brand">Preço</h2>
            <p className="text-xs text-neutral-500">Tabelas de preço vinculadas a este produto.</p>
          </div>
          <Link href={`/admin/precos/tabelas/nova${q}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
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
                      <Link href={`/admin/precos/tabelas/${p.id}${qCampus}`} className="text-brand-golddark hover:underline">
                        {p.gerida ? "Ver →" : "Editar →"}
                      </Link>
                      {/* Tabela da escola (price list) é gerida por outro fluxo: sem botão. */}
                      {p.gerida ? null : <span className="ml-4">
                        <ArquivarBotao
                          titulo={`Arquivar a tabela "${p.name}"?`}
                          descricao={
                            <p>
                              A tabela deixa de ser usada em cotações novas. Cotações já emitidas não mudam de valor. É reversível
                              (arquivamento, não exclusão).
                            </p>
                          }
                          urlArquivar={`/api/admin/catalog/price-templates/${p.id}`}
                          urlImpacto={`/api/admin/catalog/price-templates/${p.id}/impacto-arquivar`}
                          avisosDoImpacto={avisosImpactoTabela}
                          aoArquivar={() => router.refresh()}
                        />
                      </span>}
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
          <Link href={`/admin/precos/taxas/nova${q}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream">
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
                      <Link href={`/admin/precos/taxas/${t.id}${qCampus}`} className="text-brand-golddark hover:underline">
                        {t.gerida ? "Ver →" : "Editar →"}
                      </Link>
                      {t.gerida ? null : <span className="ml-4">
                        <ArquivarBotao
                          titulo={`Arquivar a taxa "${t.name}"?`}
                          descricao={
                            <p>
                              A taxa deixa de ser cobrada em cotações novas. Cotações já emitidas não mudam de valor. É reversível
                              (arquivamento, não exclusão).
                            </p>
                          }
                          urlArquivar={`/api/admin/catalog/fees/${t.id}`}
                          aoArquivar={() => router.refresh()}
                        />
                      </span>}
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
