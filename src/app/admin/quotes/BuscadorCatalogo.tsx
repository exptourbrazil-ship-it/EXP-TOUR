"use client";

// Buscador de catalogo do construtor de cotacao — mesma ergonomia da tela
// publica /orcamento (faixa de busca no topo, filtros a esquerda, grade de
// cards com preco, selecao multipla), porem:
//   - roda sobre o catalogo INTERNO do tenant (/api/admin/catalog/browse);
//   - o preco do card vem do MOTOR REAL (/api/admin/catalog/price-batch), o
//     mesmo calculo da emissao — nunca uma estimativa que muda depois;
//   - o que for selecionado vira ITEM da opcao da cotacao.
//
// Estilo: utilitarias Tailwind do admin (bg-white, border-neutral-*, text-brand
// ...), que o tema escuro do admin ja remapeia. Nao usar as vars --p-* do
// portal publico aqui: elas nao valem nesta area.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtMoeda } from "@/lib/formato";
import {
  KIND_LABEL,
  faixaDe,
  filtrarItensCatalogo,
  type ItemCatalogo,
  type KindCatalogo,
} from "@/lib/catalog-busca";
import { fmtData, labelSemanas, segundasDisponiveis } from "@/app/orcamento/shared";

type PrecoCard =
  | { ok: true; grossAmount: number; netAmount: number; currency: string; warnings: string[] }
  | { ok: false; error: string };

type RespostaPreco = {
  productId: string;
  ok: boolean;
  grossAmount?: number;
  netAmount?: number;
  currency?: string;
  warnings?: string[];
  error?: string;
};

// Quantos cards precificamos por vez. Igual ao teto de /price-batch.
const PAGINA = 24;

const KINDS_FILTRO: { key: KindCatalogo; label: string }[] = [
  { key: "program", label: "Cursos" },
  { key: "accommodation", label: "Acomodações" },
  { key: "insurance", label: "Seguros" },
];

export default function BuscadorCatalogo({
  quoteId,
  optionId,
  optionLabel,
  onFechar,
  onAdicionado,
}: {
  quoteId: string;
  optionId: string;
  optionLabel: string;
  onFechar: () => void;
  onAdicionado: () => void;
}) {
  const segundas = useMemo(() => segundasDisponiveis(), []);

  const [itens, setItens] = useState<ItemCatalogo[]>([]);
  const [paises, setPaises] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [termo, setTermo] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [inicio, setInicio] = useState(segundas[0] ?? new Date().toISOString().slice(0, 10));
  const [pais, setPais] = useState("todos");
  const [kinds, setKinds] = useState<KindCatalogo[]>([]);
  const [visiveis, setVisiveis] = useState(PAGINA);

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [precos, setPrecos] = useState<Record<string, PrecoCard>>({});
  const [precificando, setPrecificando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  // Cada combinacao (produto, inicio, semanas) tem seu proprio preco.
  const chavePreco = useCallback(
    (productId: string) => `${productId}|${inicio}|${weeks}`,
    [inicio, weeks],
  );

  // Esc fecha — o buscador cobre a tela inteira.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/catalog/browse", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "Falha ao carregar o catálogo.");
        if (!vivo) return;
        setItens(json.data.itens ?? []);
        setPaises(json.data.paises ?? []);
      } catch (e: any) {
        if (vivo) setErro(e?.message || "Erro de rede.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const { resultados, foraDaFaixa } = useMemo(
    () => filtrarItensCatalogo({ itens, termo, pais, kinds, weeks }),
    [itens, termo, pais, kinds, weeks],
  );

  // Ao mudar qualquer criterio, a lista volta para a primeira pagina.
  useEffect(() => {
    setVisiveis(PAGINA);
  }, [termo, pais, kinds, weeks, inicio]);

  const naTela = useMemo(() => resultados.slice(0, visiveis), [resultados, visiveis]);

  // Precifica, pelo motor real, os cards visiveis que ainda nao tem preco.
  const emVoo = useRef<Set<string>>(new Set());
  useEffect(() => {
    const faltando = naTela.map((i) => i.id).filter((id) => {
      const k = chavePreco(id);
      return precos[k] === undefined && !emVoo.current.has(k);
    });
    if (faltando.length === 0) return;

    const lote = faltando.slice(0, PAGINA);
    for (const id of lote) emVoo.current.add(chavePreco(id));
    // Sem cancelamento de proposito: o preco e gravado na chave
    // `produto|data|semanas`, entao uma resposta que chega depois de o
    // consultor mudar os criterios continua CORRETA para a propria chave — e
    // fica no cache para quando ele voltar. Cancelar aqui abria uma corrida em
    // que o lote seguinte pulava chaves que o lote cancelado so liberava
    // depois, deixando os cards presos em "calculando…".
    setPrecificando(true);
    (async () => {
      try {
        const res = await fetch("/api/admin/catalog/price-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: lote, startDate: inicio, quantity: weeks, unit: "week" }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "Falha ao calcular preços.");
        const novos: Record<string, PrecoCard> = {};
        for (const r of (json.data ?? []) as RespostaPreco[]) {
          novos[`${r.productId}|${inicio}|${weeks}`] = r.ok
            ? {
                ok: true,
                grossAmount: Number(r.grossAmount ?? 0),
                netAmount: Number(r.netAmount ?? 0),
                currency: r.currency ?? "",
                warnings: r.warnings ?? [],
              }
            : { ok: false, error: r.error || "Sem preço." };
        }
        // Todo id do lote que a resposta nao trouxe recebe um valor mesmo
        // assim: sem isso a chave ficaria eternamente `undefined` e o efeito
        // repetiria o mesmo pedido a cada rerender (laco infinito).
        for (const id of lote) {
          const k = `${id}|${inicio}|${weeks}`;
          if (novos[k] === undefined) novos[k] = { ok: false, error: "Sem preço." };
        }
        setPrecos((p) => ({ ...p, ...novos }));
      } catch (e: any) {
        setErro(e?.message || "Erro de rede ao calcular preços.");
      } finally {
        // As chaves saem de `emVoo` SEMPRE: em erro, para permitir nova
        // tentativa; em sucesso, porque `precos` ja guarda o valor.
        for (const id of lote) emVoo.current.delete(chavePreco(id));
        setPrecificando(false);
      }
    })();
  }, [naTela, precos, chavePreco, inicio, weeks]);

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function alternarKind(k: KindCatalogo) {
    setKinds((atual) => (atual.includes(k) ? atual.filter((x) => x !== k) : [...atual, k]));
  }

  // Adiciona os selecionados como itens da opcao. Sequencial de proposito: cada
  // item e precificado e auditado no servidor, e um erro no meio precisa parar
  // e dizer QUAL produto falhou, sem deixar a opcao pela metade em silencio.
  async function adicionarSelecionados() {
    if (sel.size === 0 || adicionando) return;
    setAdicionando(true);
    setErro(null);
    const ids = [...sel];
    const falhas: { id: string; nome: string; motivo: string }[] = [];
    let gravados = 0;
    for (const productId of ids) {
      try {
        const res = await fetch(`/api/admin/quotes/${quoteId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId, productId, startDate: inicio, quantity: weeks, unit: "week" }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "Falha ao adicionar.");
        gravados += 1;
      } catch (e: any) {
        falhas.push({
          id: productId,
          nome: itens.find((i) => i.id === productId)?.name ?? productId,
          motivo: e?.message || "erro",
        });
      }
    }
    setAdicionando(false);
    onAdicionado();
    if (falhas.length > 0) {
      // Mantem selecionado SO o que falhou, para o consultor ver o que sobrou
      // e tentar de novo sem readicionar o que ja entrou.
      setSel(new Set(falhas.map((f) => f.id)));
      setErro(
        `${gravados} item(ns) adicionado(s). Não foi possível adicionar: ` +
          falhas.map((f) => `${f.nome} (${f.motivo})`).join(" · "),
      );
      return;
    }
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/40" role="dialog" aria-modal="true" aria-label="Buscar no catálogo">
      <div className="flex h-full w-full flex-col bg-neutral-50" onClick={(e) => e.stopPropagation()}>
        {/* Faixa de busca (equivalente ao header do /orcamento) */}
        <header className="bg-brand px-5 py-4 text-white">
          <div className="mx-auto max-w-7xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium tracking-tight">
                Catálogo · adicionando em <span className="font-semibold">{optionLabel}</span>
              </p>
              <button
                type="button"
                onClick={onFechar}
                className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10"
              >
                Fechar
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <label className="min-w-[240px] flex-[2]">
                <FaixaRotulo>O que você procura</FaixaRotulo>
                <input
                  type="text"
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Ex.: inglês para médicos, residência, seguro…"
                  className={campoFaixa}
                />
              </label>
              <label className="min-w-[170px] flex-1">
                <FaixaRotulo>Data de início</FaixaRotulo>
                <select value={inicio} onChange={(e) => setInicio(e.target.value)} className={campoFaixa}>
                  {segundas.map((d) => (
                    <option key={d} value={d}>
                      {fmtData(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[130px] flex-1">
                <FaixaRotulo>Duração</FaixaRotulo>
                <select
                  value={weeks}
                  onChange={(e) => setWeeks(parseInt(e.target.value, 10))}
                  className={campoFaixa}
                >
                  {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => (
                    <option key={w} value={w}>
                      {labelSemanas(w)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </header>

        {/* Corpo: filtros + resultados */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-7xl gap-5 p-5 md:grid-cols-[240px_1fr] md:items-start">
            <aside className="flex flex-col gap-4 md:sticky md:top-0">
              <FiltroCard titulo="Tipo de produto">
                <div className="flex flex-col gap-1.5">
                  <button type="button" onClick={() => setKinds([])} className={chip(kinds.length === 0)}>
                    Todos os tipos
                  </button>
                  {KINDS_FILTRO.map((k) => (
                    <button
                      key={k.key}
                      type="button"
                      onClick={() => alternarKind(k.key)}
                      className={chip(kinds.includes(k.key))}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </FiltroCard>

              <FiltroCard titulo="Destino">
                <div className="flex flex-col gap-1.5">
                  <button type="button" onClick={() => setPais("todos")} className={chip(pais === "todos")}>
                    🌐 Todos os destinos
                  </button>
                  {paises.map((p) => (
                    <button key={p} type="button" onClick={() => setPais(p)} className={chip(pais === p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </FiltroCard>
            </aside>

            <main>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-medium text-brand">
                  {carregando
                    ? "Carregando catálogo…"
                    : `${resultados.length} produto(s) · início ${fmtData(inicio)} · ${labelSemanas(weeks)}`}
                </h2>
                {precificando ? <span className="text-xs text-neutral-500">calculando preços…</span> : null}
              </div>

              {erro ? (
                <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
              ) : null}

              {foraDaFaixa.length > 0 ? (
                <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  ⚠ {foraDaFaixa.length} produto(s) casam a busca mas não aceitam {labelSemanas(weeks)}:{" "}
                  {[...new Set(foraDaFaixa.map((f) => (f.minWeeks === f.maxWeeks ? `${f.minWeeks} sem` : `${f.minWeeks}–${f.maxWeeks} sem`)))].join(", ")}
                  . Ajuste a duração para vê-los.
                </p>
              ) : null}

              {!carregando && resultados.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
                  Nenhum produto encontrado. Ajuste o termo, o tipo, o destino ou a duração.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {naTela.map((item) => {
                    const preco = precos[chavePreco(item.id)];
                    const selecionado = sel.has(item.id);
                    const faixa = faixaDe(item);
                    return (
                      <article
                        key={item.id}
                        className={`rounded-2xl border bg-white p-4 transition ${
                          selecionado ? "border-cta ring-1 ring-cta" : "border-neutral-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                            {item.city}, {item.country} {item.flag}
                          </p>
                          <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                            {KIND_LABEL[item.kind] ?? item.kind}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-brand">{item.name}</p>
                        <p className="text-xs text-neutral-500">{item.school}</p>

                        <div className="mt-2 min-h-[42px]">
                          {preco === undefined ? (
                            <p className="text-xs text-neutral-400">calculando…</p>
                          ) : preco.ok ? (
                            <>
                              <p className="font-serif text-xl text-brand">
                                {fmtMoeda(preco.netAmount, preco.currency)}
                              </p>
                              <p className="text-[11px] text-neutral-500">
                                {labelSemanas(weeks)}
                                {preco.grossAmount !== preco.netAmount ? (
                                  <> · bruto {fmtMoeda(preco.grossAmount, preco.currency)}</>
                                ) : null}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-amber-700">{preco.error}</p>
                          )}
                        </div>

                        {preco && preco.ok && preco.warnings.length > 0 ? (
                          <p className="mt-1 text-[11px] text-amber-700">{preco.warnings.join(" · ")}</p>
                        ) : null}
                        {faixa ? (
                          <p className="mt-1 text-[11px] text-neutral-400">
                            {faixa.min === faixa.max
                              ? `pacote fixo de ${labelSemanas(faixa.min)}`
                              : `${faixa.min}–${faixa.max} semanas`}
                          </p>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => alternar(item.id)}
                          disabled={!!preco && !preco.ok}
                          className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                            selecionado
                              ? "bg-cta text-cta-fg"
                              : "border border-neutral-300 bg-white text-brand hover:bg-brand-cream/60"
                          }`}
                          title={preco && !preco.ok ? "Sem preço para esta data/duração" : ""}
                        >
                          {selecionado ? "✓ Selecionado" : "Selecionar"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}

              {resultados.length > naTela.length ? (
                <button
                  type="button"
                  onClick={() => setVisiveis((v) => v + PAGINA)}
                  className="mt-4 w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
                >
                  Mostrar mais {Math.min(PAGINA, resultados.length - naTela.length)} de{" "}
                  {resultados.length - naTela.length}
                </button>
              ) : null}

              {/* Espaco para a barra fixa nao cobrir o ultimo card. */}
              <div className="h-20" />
            </main>
          </div>
        </div>

        {/* Barra fixa de selecao (equivalente a barra de comparar do /orcamento) */}
        {sel.size > 0 ? (
          <div className="sticky bottom-0 border-t border-white/10 bg-brand px-5 py-3 text-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
              <span className="text-sm">
                {sel.size} produto(s) · {labelSemanas(weeks)} a partir de {fmtData(inicio)}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSel(new Set())}
                  disabled={adicionando}
                  className="rounded-lg border border-white/25 px-3.5 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={adicionarSelecionados}
                  disabled={adicionando}
                  className="rounded-lg bg-cta px-4 py-2 text-xs font-semibold text-cta-fg transition disabled:opacity-50"
                >
                  {adicionando ? "Adicionando…" : `Adicionar à opção (${sel.size})`}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const campoFaixa =
  "mt-1.5 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800";

function FaixaRotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-white/60">{children}</span>
  );
}

function FiltroCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{titulo}</p>
      {children}
    </div>
  );
}

function chip(ativo: boolean): string {
  return [
    "rounded-lg border px-3 py-2 text-left text-xs font-medium transition",
    ativo
      ? "border-cta bg-brand-cream text-brand"
      : "border-neutral-300 bg-white text-brand hover:bg-brand-cream/60",
  ].join(" ");
}
