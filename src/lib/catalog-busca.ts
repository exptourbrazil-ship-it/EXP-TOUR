// Busca/filtro do CATALOGO INTERNO para o construtor de cotacao (/admin/quotes/[id]).
// Mesma ergonomia do buscador publico (/orcamento): termo com sinonimos, filtro
// por pais e por duracao, com os itens fora da faixa saindo em `foraDaFaixa`.
//
// Diferenca em relacao a `filtrarProgramas` (src/lib/orcamento.ts): ali so
// existem PROGRAMAS e o preco e uma estimativa; aqui entram tambem acomodacao e
// seguro, porque o consultor monta a cotacao item a item, e o preco vem do
// motor real (/api/admin/catalog/price-batch).
//
// NB: modulo PURO — sem dependencia de rede/DB. Testado em catalog-busca.test.ts.
import { CATEGORY_LABEL, GENERIC_PROFESSIONAL_TERMS, expandirTermos, normalizar } from "./orcamento.ts";

export type KindCatalogo = "program" | "accommodation" | "insurance" | "service" | "other";

export type ItemCatalogo = {
  id: string;
  name: string;
  kind: KindCatalogo;
  campusId: string;
  school: string;
  city: string;
  country: string; // rotulo (ver src/lib/paises.ts)
  flag: string;
  currency: string;
  /** Unidade de cobranca do produto: "week" (curso/acomodacao/seguro) ou
   *  "day" (noite extra). Vem da tabela de preco ativa. */
  unit: string;
  /** Minimo NA UNIDADE do produto (semanas ou noites). 0 = sem minimo. */
  minQtd: number;
  /** Maximo NA UNIDADE do produto. 0 = sem maximo; ver `faixaDe`. */
  maxQtd: number;
  courseType: string | null;
  /**
   * Quando o produto e um ADD-ON de outra acomodacao (hoje: "Noite extra"),
   * o id do produto-mae. Vem de `attributes.addon_de`. null = produto proprio.
   */
  addonDe: string | null;
};

export type ForaDaFaixaItem = {
  id: string;
  name: string;
  school: string;
  minQtd: number;
  maxQtd: number;
  unit: string;
};

export type ResultadoBuscaCatalogo = {
  resultados: ItemCatalogo[];
  foraDaFaixa: ForaDaFaixaItem[];
};

/**
 * Faixa de duracao efetiva do item. Espelha a regra do catalogo publico: quando
 * `max_duration` nao vem, o produto e um PACOTE FIXO de `min` semanas — nao um
 * produto sem teto. Sem minimo declarado, nao ha restricao.
 */
export function faixaDe(item: Pick<ItemCatalogo, "minQtd" | "maxQtd">): { min: number; max: number } | null {
  const min = Number(item.minQtd) || 0;
  // NUNCA menor que o minimo: uma faixa invertida vinda de cadastro ruim
  // (min 7, max 3) travava a cotacao com um aviso sem sentido ("aceita 7-3
  // noites") e gerava um <input min=7 max=3> invalido.
  const max = Math.max(min, Number(item.maxQtd) || min);
  if (min <= 0) return null; // sem restricao declarada
  return { min, max };
}

// Score de relevancia: 0 nome/tipo, 1 escola, 2 cidade, 3 coringa profissional,
// 4 sem termo. `null` = nao casa e sai do resultado.
function scoreRelevancia(item: ItemCatalogo, termos: string[], coringa: boolean): number | null {
  if (termos.length === 0) return 4;
  const casa = (hay: string) => hay !== "" && termos.some((t) => hay.includes(t));
  if (casa(normalizar(item.name))) return 0;
  const tipo = normalizar(item.courseType ?? "");
  const categoria = normalizar(CATEGORY_LABEL[item.courseType ?? ""] || "");
  if (casa(tipo) || casa(categoria)) return 0;
  if (casa(normalizar(item.school))) return 1;
  if (casa(normalizar(item.city))) return 2;
  if (coringa && item.courseType === "english-for-professionals") return 3;
  return null;
}

/**
 * Filtra + ordena o catalogo conforme os criterios do consultor. Um item que
 * casa o termo/pais/tipo mas NAO cabe na duracao alimenta `foraDaFaixa` (aviso)
 * e nunca aparece em `resultados` — o motor de preco recusaria esse item.
 */
export function filtrarItensCatalogo(args: {
  itens: ItemCatalogo[];
  termo: string;
  /** rotulo do pais; "todos"/vazio = sem filtro */
  pais?: string;
  /** kinds aceitos; vazio/undefined = todos */
  kinds?: KindCatalogo[];
  /** restringe a um campus (usado nos passos 2 e 3 do construtor) */
  campusId?: string | null;
  /**
   * Acomodacao escolhida no passo 2. Um ADD-ON (noite extra) so aparece quando
   * e daquela acomodacao: uma noite extra de um quarto que o aluno nao reservou
   * nao existe como produto vendavel. Produtos sem `addonDe` (seguro, servico)
   * nao sao afetados. `null`/ausente = nenhum add-on passa.
   */
  acomodacaoId?: string | null;
  /**
   * Quantidade pretendida, NA UNIDADE DE CADA ITEM. Passe null quando o
   * conjunto misturar unidades (ex.: seguro em semanas + noite extra em
   * diarias): ali cada extra tem a sua propria quantidade no carrinho.
   */
  quantidade: number | null;
  /**
   * Unidade a que `quantidade` se refere. Item de OUTRA unidade fica fora do
   * filtro de faixa em vez de ser comparado em unidade errada: um hotel cobrado
   * por diaria, com minimo de 7 noites, sumia de uma busca de 4 SEMANAS porque
   * 4 < 7. O preco desse item vem da quantidade propria dele.
   */
  unidadeDaQuantidade?: string | null;
}): ResultadoBuscaCatalogo {
  const termos = expandirTermos(args.termo);
  const termoNorm = normalizar(args.termo);
  const coringa =
    !!termoNorm && GENERIC_PROFESSIONAL_TERMS.some((g) => termoNorm.includes(normalizar(g)));
  const paisFiltro = args.pais && args.pais !== "todos" ? args.pais : null;
  const kindsFiltro = args.kinds && args.kinds.length > 0 ? new Set(args.kinds) : null;

  const candidatos: Array<{ item: ItemCatalogo; score: number }> = [];
  const fora: ForaDaFaixaItem[] = [];

  for (const item of args.itens) {
    if (args.campusId && item.campusId !== args.campusId) continue;
    // Add-on so acompanha a propria acomodacao.
    if (item.addonDe && item.addonDe !== (args.acomodacaoId ?? null)) continue;
    if (paisFiltro && item.country !== paisFiltro) continue;
    if (kindsFiltro && !kindsFiltro.has(item.kind)) continue;
    const score = scoreRelevancia(item, termos, coringa);
    if (score === null) continue;

    const faixa = faixaDe(item);
    const mesmaUnidade =
      args.unidadeDaQuantidade == null || item.unit === args.unidadeDaQuantidade;
    const naFaixa =
      args.quantidade == null ||
      faixa == null ||
      !mesmaUnidade ||
      (args.quantidade >= faixa.min && args.quantidade <= faixa.max);
    if (naFaixa) {
      candidatos.push({ item, score });
    } else if (faixa) {
      fora.push({ id: item.id, name: item.name, school: item.school, minQtd: faixa.min, maxQtd: faixa.max, unit: item.unit });
    }
  }

  candidatos.sort(
    (a, b) =>
      a.score - b.score ||
      a.item.school.localeCompare(b.item.school, "pt-BR") ||
      a.item.name.localeCompare(b.item.name, "pt-BR"),
  );
  return { resultados: candidatos.map((c) => c.item), foraDaFaixa: fora };
}

/** Rotulo da unidade, no plural conforme a quantidade. */
export function labelUnidade(unit: string, n: number): string {
  const um = n === 1;
  switch (unit) {
    case "week": return um ? "1 semana" : `${n} semanas`;
    case "day": return um ? "1 noite" : `${n} noites`;
    case "month": return um ? "1 mês" : `${n} meses`;
    default: return um ? "1 unidade" : `${n} unidades`;
  }
}

/** Rotulo curto do tipo de produto, para o selo do card. */
export const KIND_LABEL: Record<string, string> = {
  program: "Curso",
  accommodation: "Acomodação",
  insurance: "Seguro",
  service: "Serviço",
  other: "Outro",
};
