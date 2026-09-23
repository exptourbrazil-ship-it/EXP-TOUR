// Leitura das tabelas de preco pela CARGA HORARIA (aulas por semana + formato
// de aula), que e como as escolas realmente precificam: o nome do curso e
// marketing, o preco vem de quantas aulas por semana e de quantos alunos
// dividem o professor. PURO — sem rede/DB — para ser testado sem mocks.
//
// A relacao price_template <-> product ja e N:N no banco; este modulo apenas
// le nesse sentido (a tabela como objeto, os cursos como etiquetas) e deriva
// dela tres coisas que a tela mostra:
//   1. a IDENTIDADE da tabela (carga horaria + formato), inferida dos cursos
//      etiquetados, para o nome nao depender de texto livre;
//   2. a COMPOSICAO — quais cargas horarias e formatos a tabela de fato cobre,
//      agrupados, sem eleger um "certo" e acusar o resto;
//   3. as duas falhas que importam — curso sem tabela viva e curso em mais de
//      uma tabela viva (a invariante confirmada na consolidacao).
//
// Esta versao e so de LEITURA: nada aqui escreve. A escola confere antes de
// ganhar permissao para editar.

import type { ClassFormat } from "./produto-conteudo.ts";

export type FormatoAula = ClassFormat;

export const FORMATO_LABEL: Record<FormatoAula, string> = {
  group: "Em grupo",
  mini_group: "Mini-grupo (2 alunos)",
  one_to_one: "Individual",
  combined: "Grupo + individual",
};

export type CursoDaTabela = {
  id: string;
  nome: string;
  /** program_detail.lessons_per_week — null quando a ficha nao foi preenchida. */
  lessonsPerWeek: number | null;
  /** program_detail.format — null quando a ficha nao foi preenchida. */
  formato: FormatoAula | null;
};

export type FaixaPreco = { minQuantity: number; unitPrice: number };

export type TabelaCargaHoraria = {
  id: string;
  /** price_template.name como esta gravado hoje (pode ter derivado). */
  nomeCadastrado: string;
  unit: string;
  currency: string;
  validFrom: string;
  validUntil: string | null;
  status: string;
  /** market_id: null = tabela geral; preenchida = tabela especifica de um mercado. */
  marketId: string | null;
  /** Nome do mercado, para o selo explicar o par geral + especifica. */
  marketNome: string | null;
  archivedAt: string | null;
  /** true quando veio de um price list aprovado (source_submission_id != null). */
  gerida: boolean;
  faixas: FaixaPreco[];
  cursos: CursoDaTabela[];
};

// ── Vivacidade ──────────────────────────────────────────────────────────────

/**
 * Uma tabela esta VIVA HOJE quando publicada, nao arquivada e com a vigencia
 * JA COMECADA e ainda nao terminada. Os dois lados da vigencia importam: uma
 * tabela de 2027 ja cadastrada nao precifica nada hoje, e conta-la como viva
 * esconderia o alerta de "curso sem preco" justamente no caso em que ele e
 * verdadeiro.
 */
export function tabelaViva(t: TabelaCargaHoraria, hojeISO: string): boolean {
  if (t.status !== "active") return false;
  if (t.archivedAt) return false;
  if (t.validFrom && t.validFrom > hojeISO) return false;
  if (t.validUntil && t.validUntil < hojeISO) return false;
  return true;
}

/**
 * Tabela publicada cuja vigencia ainda vai comecar — a renovacao do ano
 * seguinte. Nao e viva nem esta encerrada; fica numa terceira secao e fora dos
 * dois alertas, porque virar o ano com as duas cadastradas e o certo, nao o
 * errado.
 */
export function tabelaFutura(t: TabelaCargaHoraria, hojeISO: string): boolean {
  if (t.status !== "active") return false;
  if (t.archivedAt) return false;
  return !!t.validFrom && t.validFrom > hojeISO;
}

// ── Identidade derivada ─────────────────────────────────────────────────────

// Valor predominante entre os cursos. Empate ou ausencia total devolve null:
// preferimos dizer "nao da para afirmar" a escolher um lado por ordem de linha.
function predominante<T extends string | number>(valores: (T | null)[]): T | null {
  const contagem = new Map<T, number>();
  for (const v of valores) {
    if (v === null || v === undefined) continue;
    contagem.set(v, (contagem.get(v) ?? 0) + 1);
  }
  if (contagem.size === 0) return null;
  let vencedor: T | null = null;
  let melhor = 0;
  let empatado = false;
  for (const [v, n] of contagem) {
    if (n > melhor) {
      melhor = n;
      vencedor = v;
      empatado = false;
    } else if (n === melhor) {
      empatado = true;
    }
  }
  return empatado ? null : vencedor;
}

export type IdentidadeTabela = {
  lessonsPerWeek: number | null;
  formato: FormatoAula | null;
};

/** Carga horaria e formato que a tabela representa, inferidos dos cursos. */
export function identidadeDaTabela(t: TabelaCargaHoraria): IdentidadeTabela {
  return {
    lessonsPerWeek: predominante(t.cursos.map((c) => c.lessonsPerWeek)),
    formato: predominante(t.cursos.map((c) => c.formato)),
  };
}

/**
 * Nome DERIVADO da identidade — "25 aulas por semana · Em grupo". E o nome que
 * a tela mostra; o texto livre de `name` vira nota, porque foi ele que produziu
 * a duzia de nomes quase iguais que tiveram de ser fundidos a mao.
 * Devolve null quando nao da para derivar (a tela cai no nome cadastrado).
 */
export function nomeDerivado(id: IdentidadeTabela): string | null {
  const partes: string[] = [];
  if (id.lessonsPerWeek != null) {
    partes.push(id.lessonsPerWeek === 1 ? "1 aula por semana" : `${id.lessonsPerWeek} aulas por semana`);
  }
  if (id.formato) partes.push(FORMATO_LABEL[id.formato]);
  return partes.length > 0 ? partes.join(" · ") : null;
}

// ── Composicao da tabela ────────────────────────────────────────────────────────────

export type GrupoDeFicha<T> = { valor: T; cursos: CursoDaTabela[] };

// Agrupa os cursos da tabela pelo valor de um campo da ficha, ignorando quem
// esta em branco. Ordem: grupo maior primeiro, empate desfeito pelo valor —
// estavel entre recargas.
function agrupar<T extends string | number>(
  cursos: CursoDaTabela[],
  campo: (c: CursoDaTabela) => T | null,
): GrupoDeFicha<T>[] {
  const mapa = new Map<T, CursoDaTabela[]>();
  for (const c of cursos) {
    const v = campo(c);
    if (v === null || v === undefined) continue;
    const arr = mapa.get(v) ?? [];
    arr.push(c);
    mapa.set(v, arr);
  }
  return [...mapa.entries()]
    .map(([valor, cs]) => ({ valor, cursos: cs }))
    .sort((a, b) => b.cursos.length - a.cursos.length || (a.valor < b.valor ? -1 : a.valor > b.valor ? 1 : 0));
}

/**
 * Cursos da tabela agrupados por carga horaria e por formato. Substitui a
 * acusacao da minoria: com 2 cursos de cargas diferentes nao ha maioria, e
 * eleger um "certo" e um "errado" pela contagem tratava o mesmo fenomeno de
 * dois jeitos opostos. Agrupar apenas mostra o que a tabela cobre.
 */
export function gruposDeCarga(t: TabelaCargaHoraria): GrupoDeFicha<number>[] {
  return agrupar(t.cursos, (c) => c.lessonsPerWeek);
}

export function gruposDeFormato(t: TabelaCargaHoraria): GrupoDeFicha<FormatoAula>[] {
  return agrupar(t.cursos, (c) => c.formato);
}

/**
 * Quantas cargas horarias e quantos formatos distintos a tabela realmente
 * cobre. Mais de um nao e necessariamente erro — uma escola pode cobrar o mesmo
 * por 20 e por 25 aulas —, mas muda o tom do aviso: e "confira", nao "esta
 * errado".
 */
export function homogeneidade(t: TabelaCargaHoraria): { cargas: number; formatos: number } {
  const cargas = new Set<number>();
  const formatos = new Set<FormatoAula>();
  for (const c of t.cursos) {
    if (c.lessonsPerWeek != null) cargas.add(c.lessonsPerWeek);
    if (c.formato != null) formatos.add(c.formato);
  }
  return { cargas: cargas.size, formatos: formatos.size };
}

/** Cursos etiquetados na tabela sem carga horaria ou sem formato na ficha. */
export function cursosComFichaIncompleta(t: TabelaCargaHoraria): CursoDaTabela[] {
  return t.cursos.filter((c) => c.lessonsPerWeek == null || c.formato == null);
}

// ── As duas falhas que importam ─────────────────────────────────────────────

export type CursoSimples = {
  id: string;
  nome: string;
  /** Nome do campus — o alerta e calculado no fornecedor inteiro, entao sem
   *  isto a escola le "General English" oito vezes sem saber qual unidade. */
  campusNome?: string | null;
};

/**
 * Cursos do campus que nenhuma tabela VIVA precifica. E a falha que custa
 * dinheiro: uma tabela errada aparece na cotacao e alguem repara; um curso sem
 * preco simplesmente nao e vendido.
 */
export function cursosSemTabela(
  cursos: CursoSimples[],
  tabelas: TabelaCargaHoraria[],
  hojeISO: string,
): CursoSimples[] {
  const precificados = new Set<string>();
  for (const t of tabelas) {
    if (!tabelaViva(t, hojeISO)) continue;
    for (const c of t.cursos) precificados.add(c.id);
  }
  return cursos.filter((c) => !precificados.has(c.id));
}

export type CursoEmVariasTabelas = { curso: CursoSimples; tabelaIds: string[] };

/**
 * Cursos em MAIS DE UMA tabela viva DO MESMO MERCADO. A invariante "nenhum
 * curso com mais de uma tabela viva" hoje vale por sorte (foi verificada a mao
 * depois da consolidacao); a tela passa a mostra-la.
 *
 * O mercado entra na chave porque tabela geral + tabela de um mercado nao e
 * ambiguidade: o motor escolhe a mais especifica de proposito. Acusar esse par
 * mandaria a escola "corrigir" uma configuracao correta.
 */
export function cursosEmVariasTabelas(
  tabelas: TabelaCargaHoraria[],
  hojeISO: string,
): CursoEmVariasTabelas[] {
  const porCursoEMercado = new Map<string, { id: string; nome: string; ids: string[] }>();
  for (const t of tabelas) {
    if (!tabelaViva(t, hojeISO)) continue;
    for (const c of t.cursos) {
      const chave = `${c.id}|${t.marketId ?? ""}`;
      const atual = porCursoEMercado.get(chave) ?? { id: c.id, nome: c.nome, ids: [] };
      atual.ids.push(t.id);
      porCursoEMercado.set(chave, atual);
    }
  }
  const saida: CursoEmVariasTabelas[] = [];
  for (const v of porCursoEMercado.values()) {
    if (v.ids.length > 1) saida.push({ curso: { id: v.id, nome: v.nome }, tabelaIds: v.ids });
  }
  // Ordem estavel por nome, para a tela nao dancar entre recargas.
  return saida.sort((a, b) => a.curso.nome.localeCompare(b.curso.nome, "pt-BR"));
}

// ── Apresentacao das faixas ─────────────────────────────────────────────────

/** Formata dinheiro na moeda da tabela, sem centavos quando redondo. */
export function formatarDinheiro(valor: number, currency: string): string {
  const casas = Number.isInteger(valor) ? 0 : 2;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    }).format(valor);
  } catch {
    // Moeda fora do ISO 4217 nao pode derrubar a tela.
    return `${currency} ${valor.toFixed(casas)}`;
  }
}

/**
 * Resumo de uma escala de faixas para o cabecalho do cartao:
 * "€455 → €335" quando ha escada, "€200 fixo" quando ha uma faixa so.
 */
export function resumoFaixas(faixas: FaixaPreco[], currency: string): string {
  if (faixas.length === 0) return "sem faixa";
  const ordenadas = [...faixas].sort((a, b) => a.minQuantity - b.minQuantity);
  const primeiro = ordenadas[0].unitPrice;
  const ultimo = ordenadas[ordenadas.length - 1].unitPrice;
  if (ordenadas.length === 1 || primeiro === ultimo) {
    return `${formatarDinheiro(primeiro, currency)} fixo`;
  }
  return `${formatarDinheiro(primeiro, currency)} → ${formatarDinheiro(ultimo, currency)}`;
}

/** Rotulo da permanencia de uma faixa: "4 a 11 semanas", "24+ semanas". */
export function rotuloFaixa(faixas: FaixaPreco[], indice: number, unit: string): string {
  const ordenadas = [...faixas].sort((a, b) => a.minQuantity - b.minQuantity);
  const atual = ordenadas[indice];
  if (!atual) return "";
  const proxima = ordenadas[indice + 1];
  const plural = unit === "week" ? "semanas" : unit === "day" ? "noites" : unit === "month" ? "meses" : "unidades";
  if (!proxima) return `${atual.minQuantity}+ ${plural}`;
  const teto = proxima.minQuantity - 1;
  if (teto <= atual.minQuantity) return `${atual.minQuantity} ${plural}`;
  return `${atual.minQuantity} a ${teto} ${plural}`;
}
