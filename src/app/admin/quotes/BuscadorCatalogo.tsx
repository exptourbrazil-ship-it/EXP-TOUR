"use client";

// Buscador de catalogo do construtor de cotacao, no formato CHECKOUT: o
// consultor escolhe em ordem, um passo por vez, e so grava no fim.
//
//   1. Curso        — busca no catalogo inteiro (termo, destino, duracao).
//   2. Acomodacao   — SO as do campus do curso escolhido.
//   3. Serviços     — seguro, noite extra e afins, tambem do campus do curso.
//   4. Revisao      — carrinho com total, e um unico "Adicionar a opcao".
//
// Por que a hierarquia: acomodacao e servico so fazem sentido amarrados a um
// curso (mesmo campus, mesma moeda, mesma data). Escolher o curso primeiro
// elimina a combinacao impossivel em vez de deixar o consultor descobrir na
// hora de emitir.
//
// O preco de cada card vem do MOTOR REAL (/api/admin/catalog/price-batch), com
// a UNIDADE de cada produto: curso, acomodacao e seguro sao cobrados por
// semana; noite extra, por diaria. Precificar tudo como semana cobraria a noite
// extra 7x.
//
// Estilo: utilitarias Tailwind do admin, que o tema claro/escuro ja remapeia.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtMoeda } from "@/lib/formato";
import {
  KIND_LABEL,
  faixaDe,
  filtrarItensCatalogo,
  labelUnidade,
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

// Item no carrinho: produto + a quantidade, SEMPRE derivada do estado atual.
// Guardar a quantidade junto da selecao (um retrato do clique) fazia o card
// mostrar um preco e o POST gravar outro quando o consultor mudava a duracao
// depois de selecionar.
type ItemCarrinho = { item: ItemCatalogo; qtd: number };

const PAGINA = 24; // = teto do price-batch

const PASSOS = [
  { n: 1, titulo: "Curso" },
  { n: 2, titulo: "Acomodação" },
  { n: 3, titulo: "Serviços" },
  { n: 4, titulo: "Revisão" },
] as const;

// Passo 3: tudo que nao e curso nem acomodacao. `other` e onde vivem as noites
// extras; `service` fica pronto para traslado, que ainda nao existe no catalogo.
const KINDS_SERVICO: KindCatalogo[] = ["insurance", "service", "other"];

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

  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);

  // Criterios do passo 1 (a data vale para todos os itens do carrinho).
  const [termo, setTermo] = useState("");
  const [semanasCurso, setSemanasCurso] = useState(4);
  const [inicio, setInicio] = useState(segundas[0] ?? new Date().toISOString().slice(0, 10));
  const [pais, setPais] = useState("todos");
  const [visiveis, setVisiveis] = useState(PAGINA);

  // Carrinho.
  const [curso, setCurso] = useState<ItemCatalogo | null>(null);
  const [acom, setAcom] = useState<ItemCatalogo | null>(null);
  const [semanasAcom, setSemanasAcom] = useState(4);
  const [extras, setExtras] = useState<Record<string, ItemCatalogo>>({});
  // Quantidade digitada por card do passo 3, mesmo antes de selecionar.
  const [qtdServico, setQtdServico] = useState<Record<string, number>>({});
  // Escape das etapas 2 e 3: mostrar itens de outros campi.
  const [soDoCampus, setSoDoCampus] = useState(true);

  const [precos, setPrecos] = useState<Record<string, PrecoCard>>({});
  const [precificando, setPrecificando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  const chavePreco = useCallback(
    (id: string, qtd: number, unit: string) => `${id}|${inicio}|${qtd}|${unit}`,
    [inicio],
  );

  /** Quantidade default de um produto do passo 3, na unidade dele. */
  const qtdPadrao = useCallback(
    (item: ItemCatalogo) => (item.unit === "day" ? 1 : semanasCurso),
    [semanasCurso],
  );

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

  // ——— Resultados do passo corrente ———————————————————————————————
  const campusFiltro = soDoCampus ? curso?.campusId ?? null : null;

  const { resultados, foraDaFaixa } = useMemo(() => {
    if (passo === 1) {
      return filtrarItensCatalogo({ itens, termo, pais, kinds: ["program"], quantidade: semanasCurso });
    }
    if (passo === 2) {
      return filtrarItensCatalogo({
        itens,
        termo,
        kinds: ["accommodation"],
        campusId: campusFiltro,
        quantidade: semanasAcom,
      });
    }
    if (passo === 3) {
      // Unidades MISTAS aqui (seguro em semanas, noite extra em diarias): sem
      // filtro de duracao, cada card traz a propria quantidade.
      return filtrarItensCatalogo({
        itens,
        termo,
        kinds: KINDS_SERVICO,
        campusId: campusFiltro,
        // Noite extra so aparece se for DA acomodacao escolhida: uma noite
        // extra de um quarto que o aluno nao reservou nao existe como produto.
        acomodacaoId: acom?.id ?? null,
        quantidade: null,
      });
    }
    return { resultados: [], foraDaFaixa: [] };
  }, [passo, itens, termo, pais, semanasCurso, semanasAcom, campusFiltro, acom]);

  useEffect(() => {
    setVisiveis(PAGINA);
  }, [passo, termo, pais, semanasCurso, semanasAcom, inicio, soDoCampus]);

  const naTela = useMemo(() => resultados.slice(0, visiveis), [resultados, visiveis]);

  /** Quantidade usada para precificar um card, conforme o passo. */
  const qtdDoCard = useCallback(
    (item: ItemCatalogo) => {
      if (passo === 1) return semanasCurso;
      if (passo === 2) return semanasAcom;
      return qtdServico[item.id] ?? qtdPadrao(item);
    },
    [passo, semanasCurso, semanasAcom, qtdServico, qtdPadrao],
  );

  // ——— Precificacao dos cards visiveis, pelo motor real ————————————————
  const emVoo = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (passo === 4) return;
    const pendentes = naTela
      .map((item) => ({ item, qtd: qtdDoCard(item) }))
      .filter(({ item, qtd }) => {
        const k = chavePreco(item.id, qtd, item.unit);
        return precos[k] === undefined && !emVoo.current.has(k);
      })
      .slice(0, PAGINA);
    if (pendentes.length === 0) return;

    // Espera o consultor parar de digitar: no passo 3 a quantidade e um campo
    // numerico, e sem isso "14" dispararia um lote para "1" e outro para "14".
    const atraso = setTimeout(() => {
      dispararLote(pendentes);
    }, 250);
    return () => clearTimeout(atraso);

    function dispararLote(lote: { item: ItemCatalogo; qtd: number }[]) {
      for (const { item, qtd } of lote) emVoo.current.add(chavePreco(item.id, qtd, item.unit));
      // Sem cancelamento do fetch de proposito: o preco e gravado na chave
      // `produto|data|qtd|unidade`, entao uma resposta que chega depois de o
      // consultor mudar os criterios continua CORRETA para a propria chave.
      setPrecificando(true);
      void enviar(lote);
    }

    async function enviar(pendentes: { item: ItemCatalogo; qtd: number }[]) {
      try {
        const res = await fetch("/api/admin/catalog/price-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: pendentes.map(({ item, qtd }) => ({
              productId: item.id,
              startDate: inicio,
              quantity: qtd,
              unit: item.unit,
            })),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "Falha ao calcular preços.");
        const porId = new Map<string, RespostaPreco>();
        for (const r of (json.data ?? []) as RespostaPreco[]) porId.set(r.productId, r);
        const novos: Record<string, PrecoCard> = {};
        for (const { item, qtd } of pendentes) {
          const k = chavePreco(item.id, qtd, item.unit);
          const r = porId.get(item.id);
          novos[k] =
            r && r.ok
              ? {
                  ok: true,
                  grossAmount: Number(r.grossAmount ?? 0),
                  netAmount: Number(r.netAmount ?? 0),
                  currency: r.currency ?? "",
                  warnings: r.warnings ?? [],
                }
              : { ok: false, error: r?.error || "Sem preço." };
        }
        // Toda chave do lote recebe valor: sem isso ela ficaria `undefined` e o
        // efeito repetiria o mesmo pedido a cada rerender (laco infinito).
        setPrecos((p) => ({ ...p, ...novos }));
      } catch (e: any) {
        setErro(e?.message || "Erro de rede ao calcular preços.");
        // Sem isso o card fica em "calculando…" para sempre: o efeito nao
        // reexecuta (nenhuma dep mudou) e o botao "Selecionar" continuaria
        // habilitado, deixando entrar no carrinho um item sem preco.
        const falhos: Record<string, PrecoCard> = {};
        for (const { item, qtd } of pendentes) {
          falhos[chavePreco(item.id, qtd, item.unit)] = {
            ok: false,
            error: "Não foi possível calcular agora.",
          };
        }
        setPrecos((p) => ({ ...p, ...falhos }));
      } finally {
        for (const { item, qtd } of pendentes) emVoo.current.delete(chavePreco(item.id, qtd, item.unit));
        setPrecificando(false);
      }
    }
  }, [passo, naTela, precos, chavePreco, inicio, qtdDoCard]);

  // ——— Carrinho ————————————————————————————————————————————————
  const carrinho: ItemCarrinho[] = useMemo(() => {
    const out: ItemCarrinho[] = [];
    if (curso) out.push({ item: curso, qtd: semanasCurso });
    if (acom) out.push({ item: acom, qtd: semanasAcom });
    for (const item of Object.values(extras)) {
      out.push({ item, qtd: qtdServico[item.id] ?? qtdPadrao(item) });
    }
    return out;
  }, [curso, acom, extras, semanasCurso, semanasAcom, qtdServico, qtdPadrao]);

  const precoDe = useCallback(
    (c: ItemCarrinho) => precos[chavePreco(c.item.id, c.qtd, c.item.unit)],
    [precos, chavePreco],
  );

  // Total por moeda. Tudo vem do mesmo campus, entao na pratica e uma moeda so
  // — mas somar moedas diferentes seria errado, entao separamos sempre.
  const totalPorMoeda = useMemo(() => {
    const acc: Record<string, number> = {};
    let incompleto = false;
    for (const c of carrinho) {
      const p = precoDe(c);
      if (!p || !p.ok) {
        incompleto = true;
        continue;
      }
      acc[p.currency] = (acc[p.currency] ?? 0) + p.netAmount;
    }
    return { acc, incompleto };
  }, [carrinho, precoDe]);

  function escolherCurso(item: ItemCatalogo) {
    setCurso(item);
    setSemanasAcom(semanasCurso);
    // Trocar de curso invalida o que dependia do campus anterior.
    setAcom(null);
    setExtras({});
    setQtdServico({});
    setTermo("");
    setPasso(2);
  }

  function alternarExtra(item: ItemCatalogo) {
    setExtras((atual) => {
      const n = { ...atual };
      if (n[item.id]) delete n[item.id];
      else n[item.id] = item;
      return n;
    });
  }

  function mudarQtdServico(item: ItemCatalogo, qtd: number) {
    const faixa = faixaDe(item);
    let v = Number.isFinite(qtd) ? Math.floor(qtd) : 1;
    if (v < 1) v = 1;
    if (faixa) v = Math.min(Math.max(v, faixa.min), faixa.max);
    // `extras` guarda so o produto; a quantidade vive em `qtdServico` e e lida
    // na montagem do carrinho — nao ha o que sincronizar aqui.
    setQtdServico((s) => ({ ...s, [item.id]: v }));
  }

  // ——— Gravacao ————————————————————————————————————————————————
  async function adicionarCarrinho() {
    if (carrinho.length === 0 || adicionando) return;
    setAdicionando(true);
    setErro(null);
    const falhas: { nome: string; motivo: string }[] = [];
    let gravados = 0;
    // Sequencial: cada item e precificado e auditado no servidor, e uma falha
    // no meio precisa dizer QUAL produto ficou de fora.
    for (const c of carrinho) {
      try {
        const res = await fetch(`/api/admin/quotes/${quoteId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            optionId,
            productId: c.item.id,
            startDate: inicio,
            quantity: c.qtd,
            unit: c.item.unit,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "Falha ao adicionar.");
        gravados += 1;
      } catch (e: any) {
        falhas.push({ nome: c.item.name, motivo: e?.message || "erro" });
      }
    }
    setAdicionando(false);
    onAdicionado();
    if (falhas.length > 0) {
      setErro(
        `${gravados} item(ns) adicionado(s). Não foi possível adicionar: ` +
          falhas.map((f) => `${f.nome} (${f.motivo})`).join(" · "),
      );
      return;
    }
    onFechar();
  }

  // Mudar a duracao DEPOIS de escolher pode tirar o item da faixa que o
  // proprio produto aceita. O motor so emite warning nesse caso (nao recusa),
  // entao o item entraria na cotacao com uma duracao invalida. Barramos aqui.
  const cursoForaDaFaixa = useMemo(() => {
    const f = curso ? faixaDe(curso) : null;
    return !!f && (semanasCurso < f.min || semanasCurso > f.max);
  }, [curso, semanasCurso]);
  const acomForaDaFaixa = useMemo(() => {
    const f = acom ? faixaDe(acom) : null;
    return !!f && (semanasAcom < f.min || semanasAcom > f.max);
  }, [acom, semanasAcom]);
  const foraDaFaixaNoCarrinho = cursoForaDaFaixa || acomForaDaFaixa;

  const podeAvancar = (passo === 1 ? !!curso : true) && !foraDaFaixaNoCarrinho;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/40" role="dialog" aria-modal="true" aria-label="Montar itens da opção">
      <div className="flex h-full w-full flex-col bg-neutral-50">
        <Cabecalho
          optionLabel={optionLabel}
          passo={passo}
          curso={curso}
          onFechar={onFechar}
          onIrPara={(n) => {
            // So volta; avancar exige a acao do passo (escolher curso, etc.).
            if (n < passo) setPasso(n as 1 | 2 | 3 | 4);
          }}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-5">
            {erro ? (
              <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
            ) : null}

            {foraDaFaixaNoCarrinho ? (
              <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {cursoForaDaFaixa && curso ? (
                  <>
                    <strong>{curso.name}</strong> aceita{" "}
                    {faixaDe(curso)!.min === faixaDe(curso)!.max
                      ? labelUnidade(curso.unit, faixaDe(curso)!.min)
                      : `${faixaDe(curso)!.min}–${labelUnidade(curso.unit, faixaDe(curso)!.max)}`}
                    , e a duração está em {labelSemanas(semanasCurso)}.{" "}
                  </>
                ) : null}
                {acomForaDaFaixa && acom ? (
                  <>
                    <strong>{acom.name}</strong> aceita{" "}
                    {faixaDe(acom)!.min === faixaDe(acom)!.max
                      ? labelUnidade(acom.unit, faixaDe(acom)!.min)
                      : `${faixaDe(acom)!.min}–${labelUnidade(acom.unit, faixaDe(acom)!.max)}`}
                    , e a acomodação está em {labelSemanas(semanasAcom)}.{" "}
                  </>
                ) : null}
                Ajuste a duração ou troque o item para continuar.
              </p>
            ) : null}

            {passo === 4 ? (
              <Revisao
                carrinho={carrinho}
                inicio={inicio}
                precoDe={precoDe}
                totalPorMoeda={totalPorMoeda}
                onRemover={(id) => {
                  if (acom && acom.id === id) setAcom(null);
                  setExtras((s) => {
                    const n = { ...s };
                    delete n[id];
                    return n;
                  });
                }}
              />
            ) : (
              <div className="grid gap-5 md:grid-cols-[240px_1fr] md:items-start">
                <aside className="flex flex-col gap-4 md:sticky md:top-0">
                  <FiltroCard titulo="Busca">
                    <input
                      type="text"
                      value={termo}
                      onChange={(e) => setTermo(e.target.value)}
                      placeholder={
                        passo === 1 ? "Ex.: inglês para médicos…" : passo === 2 ? "Ex.: casa de família…" : "Ex.: seguro…"
                      }
                      className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                    />
                  </FiltroCard>

                  {passo === 1 ? (
                    <>
                      <FiltroCard titulo="Data de início">
                        <select
                          value={inicio}
                          onChange={(e) => setInicio(e.target.value)}
                          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                        >
                          {segundas.map((d) => (
                            <option key={d} value={d}>
                              {fmtData(d)}
                            </option>
                          ))}
                        </select>
                      </FiltroCard>
                      <FiltroCard titulo="Duração do curso">
                        <select
                          value={semanasCurso}
                          onChange={(e) => setSemanasCurso(parseInt(e.target.value, 10))}
                          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                        >
                          {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => (
                            <option key={w} value={w}>
                              {labelSemanas(w)}
                            </option>
                          ))}
                        </select>
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
                    </>
                  ) : null}

                  {passo === 2 ? (
                    <FiltroCard titulo="Duração da acomodação">
                      <select
                        value={semanasAcom}
                        onChange={(e) => setSemanasAcom(parseInt(e.target.value, 10))}
                        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800"
                      >
                        {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => (
                          <option key={w} value={w}>
                            {labelSemanas(w)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[11px] text-neutral-500">
                        Começa igual ao curso. Ajuste se o aluno chega antes ou fica depois.
                      </p>
                    </FiltroCard>
                  ) : null}

                  {passo >= 2 && curso ? (
                    <FiltroCard titulo="Campus">
                      <p className="mb-2 text-xs text-neutral-600">
                        {curso.school} · {curso.city}
                      </p>
                      <label className="flex items-start gap-2 text-xs text-neutral-600">
                        <input
                          type="checkbox"
                          checked={soDoCampus}
                          onChange={(e) => setSoDoCampus(e.target.checked)}
                          className="mt-0.5"
                        />
                        Só deste campus
                      </label>
                    </FiltroCard>
                  ) : null}
                </aside>

                <main>
                  <TituloPasso
                    passo={passo}
                    carregando={carregando}
                    total={resultados.length}
                    inicio={inicio}
                    semanasCurso={semanasCurso}
                    semanasAcom={semanasAcom}
                    precificando={precificando}
                  />

                  {foraDaFaixa.length > 0 ? (
                    <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      ⚠ {foraDaFaixa.length} produto(s) casam a busca mas não aceitam essa duração:{" "}
                      {[
                        ...new Set(
                          foraDaFaixa.map((f) =>
                            f.minQtd === f.maxQtd
                              ? labelUnidade(f.unit, f.minQtd)
                              : `${f.minQtd}–${labelUnidade(f.unit, f.maxQtd)}`,
                          ),
                        ),
                      ].join(", ")}
                      . Ajuste a duração para vê-los.
                    </p>
                  ) : null}

                  {!carregando && resultados.length === 0 ? (
                    <VazioDoPasso
                      passo={passo}
                      soDoCampus={soDoCampus}
                      acomEscolhida={!!acom}
                      onVerTodos={() => setSoDoCampus(false)}
                    />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {naTela.map((item) => {
                        const qtd = qtdDoCard(item);
                        const preco = precos[chavePreco(item.id, qtd, item.unit)];
                        const selecionado =
                          passo === 1
                            ? curso?.id === item.id
                            : passo === 2
                              ? acom?.id === item.id
                              : !!extras[item.id];
                        return (
                          <Card
                            key={item.id}
                            item={item}
                            qtd={qtd}
                            preco={preco}
                            selecionado={selecionado}
                            mostrarQtd={passo === 3}
                            onMudarQtd={(v) => mudarQtdServico(item, v)}
                            onSelecionar={() => {
                              if (passo === 1) escolherCurso(item);
                              else if (passo === 2)
                                setAcom(acom?.id === item.id ? null : item);
                              else alternarExtra(item);
                            }}
                            rotuloBotao={passo === 1 ? "Escolher curso" : selecionado ? "✓ Selecionado" : "Selecionar"}
                          />
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

                  <div className="h-24" />
                </main>
              </div>
            )}
          </div>
        </div>

        <BarraCarrinho
          passo={passo}
          carrinho={carrinho}
          totalPorMoeda={totalPorMoeda}
          adicionando={adicionando}
          podeAvancar={podeAvancar}
          acomEscolhida={!!acom}
          onVoltar={() => setPasso((p) => (p > 1 ? ((p - 1) as 1 | 2 | 3) : p))}
          onAvancar={() => setPasso((p) => (p < 4 ? ((p + 1) as 2 | 3 | 4) : p))}
          onAdicionar={adicionarCarrinho}
        />
      </div>
    </div>
  );
}

// ——— Partes ————————————————————————————————————————————————————

function Cabecalho({
  optionLabel,
  passo,
  curso,
  onFechar,
  onIrPara,
}: {
  optionLabel: string;
  passo: number;
  curso: ItemCatalogo | null;
  onFechar: () => void;
  onIrPara: (n: number) => void;
}) {
  return (
    <header className="bg-brand px-5 py-4 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-medium tracking-tight">
            Montando <span className="font-semibold">{optionLabel}</span>
            {curso ? <span className="text-white/60"> · {curso.school}, {curso.city}</span> : null}
          </p>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10"
          >
            Fechar
          </button>
        </div>
        <ol className="flex flex-wrap items-center gap-1.5">
          {PASSOS.map((p, i) => {
            const feito = p.n < passo;
            const atual = p.n === passo;
            return (
              <li key={p.n} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onIrPara(p.n)}
                  disabled={!feito}
                  className={[
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    atual
                      ? "bg-white text-brand"
                      : feito
                        ? "bg-white/15 text-white hover:bg-white/25"
                        : "bg-white/5 text-white/40",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold",
                      atual ? "bg-brand text-white" : feito ? "bg-white/30 text-white" : "bg-white/10 text-white/50",
                    ].join(" ")}
                  >
                    {feito ? "✓" : p.n}
                  </span>
                  {p.titulo}
                </button>
                {i < PASSOS.length - 1 ? <span className="text-white/25">›</span> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}

function TituloPasso({
  passo,
  carregando,
  total,
  inicio,
  semanasCurso,
  semanasAcom,
  precificando,
}: {
  passo: number;
  carregando: boolean;
  total: number;
  inicio: string;
  semanasCurso: number;
  semanasAcom: number;
  precificando: boolean;
}) {
  const sub =
    passo === 1
      ? `início ${fmtData(inicio)} · ${labelSemanas(semanasCurso)}`
      : passo === 2
        ? `${labelSemanas(semanasAcom)} a partir de ${fmtData(inicio)}`
        : "cada serviço tem a própria quantidade";
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-sm font-medium text-brand">
        {carregando ? "Carregando catálogo…" : `${total} opção(ões) · ${sub}`}
      </h2>
      {precificando ? <span className="text-xs text-neutral-500">calculando preços…</span> : null}
    </div>
  );
}

function VazioDoPasso({
  passo,
  soDoCampus,
  acomEscolhida,
  onVerTodos,
}: {
  passo: number;
  soDoCampus: boolean;
  acomEscolhida: boolean;
  onVerTodos: () => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
      <p className="text-sm text-neutral-600">
        {passo === 1
          ? "Nenhum curso encontrado. Ajuste o termo, o destino ou a duração."
          : passo === 2
            ? "Nenhuma acomodação cadastrada para este campus nessa duração."
            : acomEscolhida
              ? "Nenhum serviço para este campus. Noites extras aparecem só quando existem para a acomodação escolhida."
              : "Nenhum serviço cadastrado para este campus. Sem acomodação escolhida, noites extras não se aplicam."}
      </p>
      {passo > 1 && soDoCampus ? (
        <button
          type="button"
          onClick={onVerTodos}
          className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand-cream/60"
        >
          Ver de todos os campi
        </button>
      ) : null}
    </div>
  );
}

function Card({
  item,
  qtd,
  preco,
  selecionado,
  mostrarQtd,
  onMudarQtd,
  onSelecionar,
  rotuloBotao,
}: {
  item: ItemCatalogo;
  qtd: number;
  preco: PrecoCard | undefined;
  selecionado: boolean;
  mostrarQtd: boolean;
  onMudarQtd: (v: number) => void;
  onSelecionar: () => void;
  rotuloBotao: string;
}) {
  const faixa = faixaDe(item);
  const semPreco = !!preco && !preco.ok;
  return (
    <article
      className={`flex flex-col rounded-2xl border bg-white p-4 transition ${
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

      {mostrarQtd ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
          Quantidade
          <input
            type="number"
            min={faixa?.min ?? 1}
            max={faixa?.max}
            step={1}
            value={qtd}
            onChange={(e) => onMudarQtd(parseInt(e.target.value, 10))}
            className="w-16 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-800"
          />
          <span className="text-neutral-500">{item.unit === "day" ? "noite(s)" : "semana(s)"}</span>
        </label>
      ) : null}

      <div className="mt-2 min-h-[42px]">
        {preco === undefined ? (
          <p className="text-xs text-neutral-400">calculando…</p>
        ) : preco.ok ? (
          <>
            <p className="font-serif text-xl text-brand">{fmtMoeda(preco.netAmount, preco.currency)}</p>
            <p className="text-[11px] text-neutral-500">
              {labelUnidade(item.unit, qtd)}
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
            ? `pacote fixo de ${labelUnidade(item.unit, faixa.min)}`
            : `${faixa.min}–${labelUnidade(item.unit, faixa.max)}`}
        </p>
      ) : null}

      <button
        type="button"
        onClick={onSelecionar}
        disabled={semPreco}
        className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
          selecionado ? "bg-cta text-cta-fg" : "border border-neutral-300 bg-white text-brand hover:bg-brand-cream/60"
        }`}
        title={semPreco ? "Sem preço para esta data/duração" : ""}
      >
        {rotuloBotao}
      </button>
    </article>
  );
}

function Revisao({
  carrinho,
  inicio,
  precoDe,
  totalPorMoeda,
  onRemover,
}: {
  carrinho: ItemCarrinho[];
  inicio: string;
  precoDe: (c: ItemCarrinho) => PrecoCard | undefined;
  totalPorMoeda: { acc: Record<string, number>; incompleto: boolean };
  onRemover: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 font-serif text-2xl text-brand">Revisão</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Tudo começa em {fmtData(inicio)}. Ao confirmar, cada linha vira um item da opção e é
        precificada de novo no servidor.
      </p>

      <ul className="flex flex-col gap-2">
        {carrinho.map((c) => {
          const p = precoDe(c);
          const ehCurso = c.item.kind === "program";
          return (
            <li key={c.item.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                    {KIND_LABEL[c.item.kind] ?? c.item.kind}
                  </span>
                  <p className="mt-1 text-sm font-medium text-brand">{c.item.name}</p>
                  <p className="text-xs text-neutral-500">
                    {c.item.school} · {c.item.city} · {labelUnidade(c.item.unit, c.qtd)}
                  </p>
                </div>
                <div className="text-right">
                  {p && p.ok ? (
                    <p className="font-serif text-lg text-brand">{fmtMoeda(p.netAmount, p.currency)}</p>
                  ) : (
                    <p className="text-xs text-amber-700">sem preço</p>
                  )}
                  {!ehCurso ? (
                    <button
                      type="button"
                      onClick={() => onRemover(c.item.id)}
                      className="mt-1 text-[11px] text-neutral-500 underline hover:text-red-700"
                    >
                      remover
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Total estimado</p>
        {Object.entries(totalPorMoeda.acc).map(([moeda, v]) => (
          <p key={moeda} className="font-serif text-2xl text-brand">
            {fmtMoeda(v, moeda)}
          </p>
        ))}
        {totalPorMoeda.incompleto ? (
          <p className="mt-1 text-[11px] text-amber-700">
            Há item sem preço: ele será recusado ao adicionar e não entra neste total.
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-neutral-500">
          Soma dos líquidos (bruto + taxas − descontos). O valor em BRL é congelado na emissão.
        </p>
      </div>
    </div>
  );
}

function BarraCarrinho({
  passo,
  carrinho,
  totalPorMoeda,
  adicionando,
  podeAvancar,
  acomEscolhida,
  onVoltar,
  onAvancar,
  onAdicionar,
}: {
  passo: number;
  carrinho: ItemCarrinho[];
  totalPorMoeda: { acc: Record<string, number>; incompleto: boolean };
  adicionando: boolean;
  podeAvancar: boolean;
  acomEscolhida: boolean;
  onVoltar: () => void;
  onAvancar: () => void;
  onAdicionar: () => void;
}) {
  const totais = Object.entries(totalPorMoeda.acc);
  return (
    <div className="sticky bottom-0 border-t border-white/10 bg-brand px-5 py-3 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-white/70">{carrinho.length} item(ns)</span>
          {totais.length > 0 ? (
            <span className="ml-2 font-semibold">
              {totais.map(([m, v]) => fmtMoeda(v, m)).join(" + ")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {passo > 1 ? (
            <button
              type="button"
              onClick={onVoltar}
              disabled={adicionando}
              className="rounded-lg border border-white/25 px-3.5 py-2 text-xs font-medium text-white/90 transition hover:bg-white/10 disabled:opacity-50"
            >
              ← Voltar
            </button>
          ) : null}
          {passo < 4 ? (
            <button
              type="button"
              onClick={onAvancar}
              disabled={!podeAvancar}
              className="rounded-lg bg-cta px-4 py-2 text-xs font-semibold text-cta-fg transition disabled:opacity-50"
              title={podeAvancar ? "" : "Escolha um curso para continuar"}
            >
              {passo === 2 && !acomEscolhida ? "Pular acomodação →" : passo === 3 ? "Revisar →" : "Continuar →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onAdicionar}
              disabled={adicionando || carrinho.length === 0 || !podeAvancar}
              title={podeAvancar ? "" : "Há item com duração fora da faixa aceita"}
              className="rounded-lg bg-cta px-4 py-2 text-xs font-semibold text-cta-fg transition disabled:opacity-50"
            >
              {adicionando ? "Adicionando…" : `Adicionar ${carrinho.length} item(ns) à opção`}
            </button>
          )}
        </div>
      </div>
    </div>
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
    ativo ? "border-cta bg-brand-cream text-brand" : "border-neutral-300 bg-white text-brand hover:bg-brand-cream/60",
  ].join(" ");
}
