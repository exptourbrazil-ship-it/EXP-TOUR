// Validacao PURA do ajuste sazonal (alta/baixa temporada) vindo do formulario do
// hub. Isto E DINHEIRO que entra na cotacao, entao o validador e restritivo: mes
// e dia reais, valor diferente de zero com teto, moeda ISO, faixa de duracao
// coerente e periodo recorrente que nao vire "quase o ano inteiro" por engano.
// Testado; nao importa nada de rede/DB.

export type EntradaSazonal = {
  id?: string | null;
  productId: string;
  name: string;
  kind: "high_season" | "low_season" | "other";
  amountPerWeek: number;
  currency: string;
  fromMonth: number; fromDay: number; fromYear?: number | null;
  toMonth: number; toDay: number; toYear?: number | null;
  minWeeks?: number | null;
  maxWeeks?: number | null;
};

export type FalhaCampo = { campo: string; erro: string };
export type ResultadoValidacao =
  | { ok: true; dados: EntradaSazonal }
  | { ok: false; falhas: FalhaCampo[] };

const KINDS = ["high_season", "low_season", "other"] as const;
const DIAS_NO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Teto de seguranca: acima disso quase certamente e erro de digitacao. */
export const VALOR_MAXIMO_SEMANA = 5000;
/** Um periodo recorrente maior que isto provavelmente e par invertido. */
export const MAX_DIAS_RECORRENTE = 200;

function inteiro(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.trim()) : typeof v === "number" ? v : NaN;
  return Number.isInteger(n) ? n : null;
}

/**
 * Dinheiro digitado por gente, em pt-BR (o portal e a tabela usam pt-BR): aceita
 * "40", "-30,5", "1.200,50" e "1.200" (= mil e duzentos), alem de "1200.50".
 * Recusa o resto. O perigo que isto evita e o `Number("1.200")` cru virar 1,2.
 */
export function dinheiro(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // pt-BR: milhar com ponto, decimal com virgula.
  if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  // Simples: um separador decimal, no maximo 2 casas.
  if (/^-?\d+([.,]\d{1,2})?$/.test(t)) return Number(t.replace(",", "."));
  return null;
}

/** Dia sequencial aproximado no ano (so para medir a extensao do periodo). */
function diaDoAno(month: number, day: number): number {
  let total = day;
  for (let m = 1; m < month; m++) total += DIAS_NO_MES[m - 1];
  return total;
}

/** Extensao do periodo recorrente em dias (cruzando a virada do ano quando preciso). */
export function extensaoRecorrenteDias(
  fromMonth: number, fromDay: number, toMonth: number, toDay: number,
): number {
  const ini = diaDoAno(fromMonth, fromDay);
  const fim = diaDoAno(toMonth, toDay);
  return fim >= ini ? fim - ini + 1 : 366 - ini + fim + 1;
}

export function validarAjusteSazonal(corpo: unknown): ResultadoValidacao {
  const falhas: FalhaCampo[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;

  const productId = typeof c.productId === "string" ? c.productId.trim() : "";
  if (!productId) falhas.push({ campo: "productId", erro: "Informe o produto." });

  const name = typeof c.name === "string" ? c.name.trim().slice(0, 120) : "";
  if (!name) falhas.push({ campo: "name", erro: "Dê um nome ao ajuste (ex.: Alta temporada)." });

  const kind = typeof c.kind === "string" ? c.kind : "";
  if (!(KINDS as readonly string[]).includes(kind)) {
    falhas.push({ campo: "kind", erro: "Tipo inválido." });
  }

  const amountPerWeek = dinheiro(c.amountPerWeek);
  if (amountPerWeek === null || amountPerWeek === 0) {
    falhas.push({ campo: "amountPerWeek", erro: "Informe um valor por semana diferente de zero." });
  } else if (Math.abs(amountPerWeek) > VALOR_MAXIMO_SEMANA) {
    falhas.push({ campo: "amountPerWeek", erro: `Valor acima do limite de ${VALOR_MAXIMO_SEMANA} por semana.` });
  }

  // Suplemento e positivo; desconto de baixa temporada e negativo. Trocar o sinal
  // aqui inverteria a conta da cotacao sem ninguem perceber.
  if (amountPerWeek !== null && kind === "high_season" && amountPerWeek < 0) {
    falhas.push({ campo: "amountPerWeek", erro: "Alta temporada é suplemento: use valor positivo." });
  }
  if (amountPerWeek !== null && kind === "low_season" && amountPerWeek > 0) {
    falhas.push({ campo: "amountPerWeek", erro: "Baixa temporada é desconto: use valor negativo." });
  }

  const currency = typeof c.currency === "string" ? c.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) falhas.push({ campo: "currency", erro: "Moeda inválida (use o código de 3 letras)." });

  const pontos: Record<string, number | null> = {
    fromMonth: inteiro(c.fromMonth), fromDay: inteiro(c.fromDay),
    toMonth: inteiro(c.toMonth), toDay: inteiro(c.toDay),
  };
  for (const [campo, valor] of Object.entries(pontos)) {
    if (valor === null) falhas.push({ campo, erro: "Informe a data do período." });
  }
  const { fromMonth, fromDay, toMonth, toDay } = pontos;
  for (const [campoMes, campoDia, mes, dia] of [
    ["fromMonth", "fromDay", fromMonth, fromDay],
    ["toMonth", "toDay", toMonth, toDay],
  ] as const) {
    if (mes === null || dia === null) continue;
    if (mes < 1 || mes > 12) falhas.push({ campo: campoMes, erro: "Mês deve ficar entre 1 e 12." });
    else if (dia < 1 || dia > DIAS_NO_MES[mes - 1]) {
      falhas.push({ campo: campoDia, erro: `Dia inválido para o mês ${mes}.` });
    }
  }

  const anoOu = (v: unknown, campo: string): number | null | undefined => {
    if (v === null || v === undefined || v === "") return null;
    const n = inteiro(v);
    if (n === null || n < 2000 || n > 2100) {
      falhas.push({ campo, erro: "Ano inválido." });
      return undefined;
    }
    return n;
  };
  const fromYear = anoOu(c.fromYear, "fromYear");
  const toYear = anoOu(c.toYear, "toYear");

  // Campo preenchido com lixo ("2,5", "abc") NAO pode virar null: o ajuste
  // passaria a valer para QUALQUER duracao e cobraria a faixa errada.
  const semanas = (v: unknown, campo: string): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = inteiro(v);
    if (n === null) {
      falhas.push({ campo, erro: "Informe um número inteiro de semanas." });
      return null;
    }
    if (n < 1) {
      falhas.push({ campo, erro: "Duração deve ser de pelo menos 1 semana." });
      return null;
    }
    return n;
  };
  const minWeeks = semanas(c.minWeeks, "minWeeks");
  const maxWeeks = semanas(c.maxWeeks, "maxWeeks");
  if (minWeeks != null && maxWeeks != null && maxWeeks < minWeeks) {
    falhas.push({ campo: "maxWeeks", erro: "Duração máxima menor que a mínima." });
  }

  // Ordem e extensao do periodo. Vale para os TRES casos (sem ano, com ano em uma
  // ponta, com os dois anos): o par invertido cobraria quase o ano inteiro, e com
  // dois anos invertidos o ajuste some da cotacao sem ninguem ser avisado.
  if (
    falhas.length === 0 &&
    fromMonth !== null && fromDay !== null && toMonth !== null && toDay !== null
  ) {
    if (fromYear != null && toYear != null) {
      const ini = fromYear * 10000 + fromMonth * 100 + fromDay;
      const fim = toYear * 10000 + toMonth * 100 + toDay;
      if (fim < ini) {
        falhas.push({ campo: "toYear", erro: "A data final é anterior à inicial." });
      }
    } else {
      // Sem ano em ao menos uma ponta o periodo e tratado como recorrente/virada
      // de ano: so a extensao denuncia a inversao.
      const dias = extensaoRecorrenteDias(fromMonth, fromDay, toMonth, toDay);
      if (dias > MAX_DIAS_RECORRENTE) {
        falhas.push({
          campo: "toMonth",
          erro: `O período ficou com ${dias} dias. Confira a ordem das datas (início antes do fim).`,
        });
      }
    }
  }

  if (falhas.length > 0) return { ok: false, falhas };

  return {
    ok: true,
    dados: {
      id: typeof c.id === "string" && c.id ? c.id : null,
      productId,
      name,
      kind: kind as EntradaSazonal["kind"],
      amountPerWeek: amountPerWeek as number,
      currency,
      fromMonth: fromMonth as number, fromDay: fromDay as number, fromYear: fromYear ?? null,
      toMonth: toMonth as number, toDay: toDay as number, toYear: toYear ?? null,
      minWeeks: minWeeks ?? null,
      maxWeeks: maxWeeks ?? null,
    },
  };
}

/** Dia sequencial do par (mes,dia) — usado para medir sobreposicao de periodo. */
function seq(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * Dois periodos do mesmo escopo se sobrepoem no calendario? Cobrariam a mesma
 * noite duas vezes. Trata periodo que cruza a virada do ano (15/dez a 10/jan)
 * partindo-o em dois trechos.
 */
export function periodosSobrepostos(
  a: { fromMonth: number; fromDay: number; toMonth: number; toDay: number },
  b: { fromMonth: number; fromDay: number; toMonth: number; toDay: number },
): boolean {
  const trechos = (x: typeof a): [number, number][] => {
    const ini = seq(x.fromMonth, x.fromDay);
    const fim = seq(x.toMonth, x.toDay);
    return fim >= ini ? [[ini, fim]] : [[ini, 1231], [101, fim]];
  };
  for (const [ia, fa] of trechos(a)) {
    for (const [ib, fb] of trechos(b)) {
      if (ia <= fb && ib <= fa) return true;
    }
  }
  return false;
}

/** Faixas de duração que se sobrepõem cobrariam o mesmo período duas vezes. */
export function faixasSobrepostas(
  nova: { minWeeks?: number | null; maxWeeks?: number | null },
  existentes: { minWeeks?: number | null; maxWeeks?: number | null }[],
): boolean {
  const ini = (x: { minWeeks?: number | null }) => x.minWeeks ?? 1;
  const fim = (x: { maxWeeks?: number | null }) => x.maxWeeks ?? Number.MAX_SAFE_INTEGER;
  return existentes.some((e) => ini(nova) <= fim(e) && ini(e) <= fim(nova));
}
