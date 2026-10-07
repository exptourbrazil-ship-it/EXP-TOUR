import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { carregarFornecedorDoTenant, listarCampusDoFornecedor } from "@/lib/fornecedor-hub-service";
import { listarTaxasAdmin } from "@/lib/fee-admin-service";
import { hrefHub } from "@/lib/admin-hub-nav";
import { normalizarBusca, tipoTaxaValido, TIPOS_TAXA, ROTULO_TIPO_TAXA } from "@/lib/arquivados";
import { agruparTaxasPorCampus, baseCobranca, escopoTaxa, filtrarTaxas, limitarTaxas, valorTaxa, LIMITE_TAXAS_HUB } from "@/lib/taxas-hub";
import ArquivarTaxaBotao from "./ArquivarTaxaBotao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Aba "Taxas" do hub: TODAS as taxas vivas dos campi deste fornecedor, por campus
// — inclusive as de campus inteiro (applies_to_kinds, sem produto vinculado), que
// não aparecem na aba Preços & Taxas de nenhum produto. Tenant + fornecedor da URL
// conferidos (fornecedor de outro tenant => 404); só campi do fornecedor entram.
export default async function TaxasDoFornecedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;
  const sp = await searchParams;
  const filtro = { q: normalizarBusca(um(sp.q)), tipo: tipoTaxaValido(um(sp.tipo)) };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const fornecedor = await carregarFornecedorDoTenant(supabase, tenantId, id);
  if (!fornecedor) notFound();

  const campi = await listarCampusDoFornecedor(supabase, tenantId, id);
  const todas = await listarTaxasAdmin(supabase, tenantId, { campusIds: campi.map((c) => c.id) });
  const filtradas = filtrarTaxas(todas, filtro);
  const { itens, total, haMais } = limitarTaxas(filtradas, LIMITE_TAXAS_HUB);
  const grupos = agruparTaxasPorCampus(itens, campi.map((c) => ({ id: c.id, name: c.nome })));
  const filtrando = !!(filtro.q || filtro.tipo);
  const voltarAba = hrefHub(id, "taxas");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 font-serif text-lg text-brand">Taxas</h2>
        <p className="text-sm text-neutral-600">
          Todas as taxas deste fornecedor, por campus — inclusive as que valem para o campus inteiro por tipo de produto
          (ex.: transfers e check-in assistido), que não aparecem na aba Preços &amp; Taxas de um produto.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Nome
          <input name="q" defaultValue={filtro.q ?? ""} maxLength={80} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Tipo
          <select name="tipo" defaultValue={filtro.tipo ?? ""} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {TIPOS_TAXA.map((k) => (
              <option key={k} value={k}>{ROTULO_TIPO_TAXA[k]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-brand-cream">Filtrar</button>
        {filtrando ? <Link href={voltarAba} className="text-xs text-neutral-500 hover:underline">Limpar</Link> : null}
        <span className="ml-auto text-xs text-neutral-500">{total} {total === 1 ? "taxa" : "taxas"}{filtrando ? " no filtro" : ""}</span>
      </form>

      {haMais ? (
        <p className="text-xs text-amber-800">
          Há mais taxas do que o exibido (mostrando as primeiras {LIMITE_TAXAS_HUB}). Use a busca/filtro para achar uma específica.
        </p>
      ) : null}

      {grupos.length === 0 ? (
        <p className="text-sm text-neutral-500">Este fornecedor ainda não tem campus cadastrado.</p>
      ) : (
        grupos.map(({ campus, taxas }) => (
          <section key={campus.id}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-serif text-base text-brand">
                {campus.name} <span className="text-sm text-neutral-500">({taxas.length})</span>
              </h3>
              <Link
                href={`/admin/precos/taxas/nova?campus_id=${encodeURIComponent(campus.id)}`}
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-cream"
              >
                + Nova taxa
              </Link>
            </div>
            {taxas.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 p-3 text-sm text-neutral-500">
                {filtrando ? "Nenhuma taxa deste campus no filtro." : "Nenhuma taxa neste campus."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Taxa</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Cobrança</th>
                      <th className="px-3 py-2">Obrigatória</th>
                      <th className="px-3 py-2">Escopo</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-700">
                    {taxas.map((t) => (
                      <tr key={t.id} className="border-t border-neutral-100 align-top">
                        <td className="px-3 py-2 text-brand">
                          {t.name}
                          {t.gerida ? (
                            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-600" title="Gerida por price list da escola">
                              price list
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-neutral-600">{ROTULO_TIPO_TAXA[t.feeType] ?? t.feeType}</td>
                        <td className="whitespace-nowrap px-3 py-2">{valorTaxa(t)}</td>
                        <td className="px-3 py-2 text-neutral-600">{baseCobranca(t.chargeBasis)}</td>
                        <td className="px-3 py-2">{t.isMandatory ? "Obrigatória" : "Opcional"}</td>
                        <td className="px-3 py-2 text-neutral-600">{escopoTaxa(t)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <Link href={`/admin/precos/taxas/${t.id}`} className="text-brand-golddark hover:underline">
                            {t.gerida ? "Ver" : "Editar"}
                          </Link>
                          {t.gerida ? null : (
                            <span className="ml-4">
                              <ArquivarTaxaBotao feeId={t.id} nome={t.name} />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
