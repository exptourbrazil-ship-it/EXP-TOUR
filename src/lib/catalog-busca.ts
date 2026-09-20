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
  /** 0 = sem minimo declarado. */
  minWeeks: number;
  /** 0 = sem maximo declarado; ver `faixaDe`. */
  maxWeeks: number;
  courseType: string | null;
};

export type ForaDaFaixaItem = {
  id: string;
  name: string;
  school: string;
  minWeeks: number;
  maxWeeks: number;
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
export function faixaDe(item: Pick<ItemCatalogo, "minWeeks" | "maxWeeks">): { min: number; max: number } | null {
  const min = Number(item.minWeeks) || 0;
  const max = Number(item.maxWeeks) || min;
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
  /** semanas pretendidas; null = sem filtro de duracao */
  weeks: number | null;
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
    if (paisFiltro && item.country !== paisFiltro) continue;
    if (kindsFiltro && !kindsFiltro.has(item.kind)) continue;
    const score = scoreRelevancia(item, termos, coringa);
    if (score === null) continue;

    const faixa = faixaDe(item);
    const naFaixa = args.weeks == null || faixa == null || (args.weeks >= faixa.min && args.weeks <= faixa.max);
    if (naFaixa) {
      candidatos.push({ item, score });
    } else if (faixa) {
      fora.push({ id: item.id, name: item.name, school: item.school, minWeeks: faixa.min, maxWeeks: faixa.max });
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

/** Rotulo curto do tipo de produto, para o selo do card. */
export const KIND_LABEL: Record<string, string> = {
  program: "Curso",
  accommodation: "Acomodação",
  insurance: "Seguro",
  service: "Serviço",
  other: "Outro",
};
