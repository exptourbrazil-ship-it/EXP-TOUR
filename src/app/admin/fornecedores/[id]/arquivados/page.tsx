import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { carregarFornecedorDoTenant } from "@/lib/fornecedor-hub-service";
import { listarArquivadosDoFornecedor } from "@/lib/arquivados-service";
import {
  KINDS_PRODUTO,
  TIPOS_TAXA,
  ROTULO_KIND,
  ROTULO_TIPO_TAXA,
  LIMITE_POR_BLOCO,
  avisoRestaurarProduto,
  kindProdutoValido,
  normalizarBusca,
  resumoProdutosLigados,
  tipoTaxaValido,
} from "@/lib/arquivados";
import RestaurarBotao from "./RestaurarBotao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const valor = (n: number | null, moeda: string | null) =>
  n == null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moeda ?? ""}`.trim();
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Aba "Arquivados" do hub: tudo que foi arquivado DESTE fornecedor (produtos,
// tabelas de preço e taxas), para checagem. Sem lista geral. Produto e taxa
// podem ser restaurados; tabela de preço é só consulta. Tenant + fornecedor da
// URL conferidos (fornecedor de outro tenant => 404).
export default async function ArquivadosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirCapacidade("fornecedores.gerir", "/admin/fornecedores");
  const { id } = await params;
  const sp = await searchParams;
  const filtro = {
    q: normalizarBusca(um(sp.q)),
    kind: kindProdutoValido(um(sp.kind)),
    tipoTaxa: tipoTaxaValido(um(sp.taxa)),
  };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const tenantId = await tenantIdAtual(supabase);
  const fornecedor = await carregarFornecedorDoTenant(supabase, tenantId, id);
  if (!fornecedor) notFound();

  const { produtos, tabelas, taxas } = await listarArquivadosDoFornecedor(supabase, tenantId, id, filtro);
  const filtrando = !!(filtro.q || filtro.kind || filtro.tipoTaxa);
  const avisoMais = (b: { haMais: boolean }) =>
    b.haMais ? (
      <p className="mt-2 text-xs text-amber-800">
        Há mais registros do que o exibido (mostrando os {LIMITE_POR_BLOCO} mais recentes). Use a busca/filtro para achar um específico.
      </p>
    ) : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 font-serif text-lg text-brand">Arquivados</h2>
        <p className="text-sm text-neutral-600">
          Tudo que foi arquivado deste fornecedor. Arquivar não apaga: o histórico de cotações e contratos continua intacto.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Nome
          <input name="q" defaultValue={filtro.q ?? ""} maxLength={80} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Tipo de produto
          <select name="kind" defaultValue={filtro.kind ?? ""} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {KINDS_PRODUTO.map((k) => (
              <option key={k} value={k}>{ROTULO_KIND[k]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-600">
          Tipo de taxa
          <select name="taxa" defaultValue={filtro.tipoTaxa ?? ""} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {TIPOS_TAXA.map((k) => (
              <option key={k} value={k}>{ROTULO_TIPO_TAXA[k]}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-brand-cream">Filtrar</button>
        {filtrando ? (
          <a href={`/admin/fornecedores/${id}/arquivados`} className="text-xs text-neutral-500 hover:underline">Limpar</a>
        ) : null}
      </form>

      {/* Produtos */}
      <section>
        <h3 className="mb-2 font-serif text-base text-brand">
          Produtos arquivados <span className="text-sm text-neutral-500">({produtos.total}{filtrando ? " no filtro" : ""})</span>
        </h3>
        {produtos.itens.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum produto arquivado.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {produtos.itens.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand">{p.name}</p>
                  <p className="text-xs text-neutral-500">
                    {ROTULO_KIND[p.kind] ?? p.kind} · {p.campusName ?? "campus"}
                    {p.campusArquivado ? " (campus arquivado)" : ""} · status: {p.status === "inactive" ? "inativo" : p.status === "active" ? "ativo" : p.status}
                    {p.gerido ? " · veio de price list" : ""} · arquivado em {dataBR(p.archivedAt)}
                  </p>
                </div>
                {p.campusArquivado ? (
                  <span className="text-xs text-neutral-400" title="Restaure o campus antes">não restaurável</span>
                ) : (
                  <RestaurarBotao
                    titulo="Restaurar produto"
                    url={`/api/admin/fornecedores/${id}/arquivados/produtos/${p.id}/restaurar`}
                    descricao={
                      <>
                        <p>Restaurar “{p.name}” ({p.campusName ?? "campus"})?</p>
                        <p>{avisoRestaurarProduto(p.status)}</p>
                        {p.gerido ? (
                          <p>Atenção: veio de um price list que foi substituído; confira se não duplica o produto atual.</p>
                        ) : null}
                      </>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {avisoMais(produtos)}
      </section>

      {/* Tabelas de preço: só consulta */}
      <section>
        <h3 className="mb-1 font-serif text-base text-brand">
          Tabelas de preço arquivadas <span className="text-sm text-neutral-500">({tabelas.total}{filtro.q ? " no filtro" : ""})</span>
        </h3>
        <p className="mb-2 text-xs text-neutral-500">
          Somente consulta. Uma tabela expirada reativada brigaria com a vigente do mesmo campus; para reaproveitar,
          crie uma nova tabela no produto (aba Preços &amp; Taxas).
        </p>
        {tabelas.itens.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma tabela arquivada.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {tabelas.itens.map((t) => (
              <li key={t.id} className="px-3 py-2 text-sm">
                <p className="font-medium text-brand">{t.name}</p>
                <p className="text-xs text-neutral-500">
                  {t.campusName ?? "campus"} · {t.currency} · vigência {dataBR(t.validFrom)} a {t.validUntil ? dataBR(t.validUntil) : "sem fim"}
                  {" · "}status: {t.status === "expired" ? "expirada" : t.status === "active" ? "ativa" : "rascunho"}
                  {t.gerida ? " · veio de price list" : ""} · arquivada em {dataBR(t.archivedAt)}
                </p>
                <p className="text-xs text-neutral-500">Produtos: {resumoProdutosLigados(t.produtos)}</p>
              </li>
            ))}
          </ul>
        )}
        {avisoMais(tabelas)}
      </section>

      {/* Taxas */}
      <section>
        <h3 className="mb-2 font-serif text-base text-brand">
          Taxas arquivadas <span className="text-sm text-neutral-500">({taxas.total}{filtrando ? " no filtro" : ""})</span>
        </h3>
        {taxas.itens.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma taxa arquivada.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {taxas.itens.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand">{f.name}</p>
                  <p className="text-xs text-neutral-500">
                    {ROTULO_TIPO_TAXA[f.feeType] ?? f.feeType} · {f.derivadaDeTabela ? "valor por tabela" : valor(f.amount, f.currency)} ·{" "}
                    {f.campusName ?? "campus"}
                    {f.campusArquivado ? " (campus arquivado)" : ""}
                    {f.gerida ? " · veio de price list" : ""} · arquivada em {dataBR(f.archivedAt)}
                  </p>
                </div>
                {f.gerida || f.campusArquivado ? (
                  <span
                    className="text-xs text-neutral-400"
                    title={f.gerida ? "Taxa de price list substituído: crie uma nova taxa" : "Restaure o campus antes"}
                  >
                    não restaurável
                  </span>
                ) : (
                  <RestaurarBotao
                    titulo="Restaurar taxa"
                    url={`/api/admin/fornecedores/${id}/arquivados/taxas/${f.id}/restaurar`}
                    descricao={
                      <>
                        <p>Restaurar a taxa “{f.name}”?</p>
                        <p>Ela volta a ser considerada no cálculo das cotações novas dos produtos a que está ligada.</p>
                      </>
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {avisoMais(taxas)}
      </section>
    </div>
  );
}
