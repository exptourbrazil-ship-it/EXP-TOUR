// Motor de preco puro (Marco 2 da spec de Catalogo/Preco/Cotacao).
//
// REGRAS INVIOLAVEIS (ver CLAUDE.md e spec secao 4):
// - Funcoes PURAS: sem I/O, sem Supabase, sem next. Recebe objetos simples,
//   devolve objetos simples. Este arquivo nao importa nada local de proposito
//   (o runner node --test exige extensao .ts nos imports, mas o build rejeita
//   .ts em fonte; um unico arquivo sem imports locais evita o conflito).
// - Dinheiro e sempre 2 casas, arredondamento POR LINHA com "round half away
//   from zero"; o total e a SOMA das linhas arredondadas, nunca o arredondamento
//   da soma.
// - Identificadores/tipos/enums em INGLES (convencao da spec, secao 0);
//   comentarios em portugues.

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Faixa de preco por quantidade minima. */
export type Tier = { minQuantity: number; unitPrice: number };

/** Template de preco com janela de vigencia (datas ISO 'YYYY-MM-DD', nulo = aberto). */
export type Template = {
  name?: string;
  tiers: Tier[];
  validFrom?: string | null;
  validUntil?: string | null;
};

/** Estrategia de precificacao quando ha transicao de template no periodo. */
export type TransitionStrategy =
  | "split_by_period"
  | "use_start_date_price"
  | "use_booking_date_price";

/** Segmento auditavel do calculo por periodo (trilha do price_breakdown). */
export type PriceSegment = {
  templateIndex: number;
  templateName?: string;
  startDate: string;
  weeks: number;
  unitPrice: number | null; // preco unitario da faixa quando flat; null quando progressivo
  amount: number;
};

export type TransitionResult = {
  amount: number;
  segments: PriceSegment[];
  totalQuantity: number;
};

/** Semantica das unidades gratuitas. */
export type FreeUnitSemantics = "bonus_on_top" | "discount_on_booked";

export type FreeUnitsResult = {
  billableQuantity: number;
  deliveredQuantity: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
};

/** Regra de agregacao de taxa de matricula entre multiplos itens. */
export type RegistrationFeeRule = "charge_highest" | "charge_lowest" | "charge_all";

/** Modo de arredondamento do valor convertido. */
export type FxRounding = "none" | "up_1" | "up_10" | "up_100";

// ---------------------------------------------------------------------------
// Utilitarios de dinheiro
// ---------------------------------------------------------------------------

/**
 * Arredonda para 2 casas com "round half away from zero".
 * O epsilon corrige o erro de representacao binaria antes de decidir o meio
 * (ex.: 2.545 * 100 = 254.4999... deve virar 255 e nao 254).
 */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return n;
  const sign = n < 0 ? -1 : 1;
  const scaled = Math.abs(n) * 100;
  const rounded = Math.round(scaled + 1e-7);
  return (sign * rounded) / 100;
}

/**
 * Soma linhas ja arredondadas. Cada valor deve estar em 2 casas; o round2 final
 * apenas limpa o drift de ponto flutuante da soma (nunca reintroduz precisao).
 */
export function sumMoney(values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}

/** Preco unitario medio = bruto / quantidade, arredondado a 2 casas. */
export function averageUnitPrice(gross: number, quantity: number): number {
  if (quantity === 0) return 0;
  return round2(gross / quantity);
}

/** Valor do desconto = base x percentual (fracao, ex.: 0.30 = 30%), arredondado. */
export function percentOff(base: number, percent: number): number {
  return round2(base * percent);
}

// ---------------------------------------------------------------------------
// Faixas (tiers)
// ---------------------------------------------------------------------------

/** Ordena as faixas por minQuantity ascendente (copia, sem mutar a entrada). */
function sortedTiers(tiers: Tier[]): Tier[] {
  return [...tiers].sort((a, b) => a.minQuantity - b.minQuantity);
}

/**
 * Faixa aplicavel a uma quantidade: a de maior minQuantity que ainda cabe.
 * Lanca erro se a quantidade fica abaixo da faixa minima (entrada invalida).
 */
export function tierFor(tiers: Tier[], quantity: number): Tier {
  const sorted = sortedTiers(tiers);
  let chosen: Tier | undefined;
  for (const t of sorted) {
    if (t.minQuantity <= quantity) chosen = t;
  }
  if (!chosen) {
    throw new Error(
      `Quantidade ${quantity} abaixo da faixa minima (minQuantity=${sorted[0]?.minQuantity}).`
    );
  }
  return chosen;
}

/**
 * Precificacao flat (charge_in_tiers=false): TODAS as unidades ao preco da faixa
 * da quantidade total contratada. Quando tierQuantity e informado, a faixa e
 * escolhida por ele (ex.: segmento parcial cobrado pela faixa do total).
 */
export function priceFlat(tiers: Tier[], quantity: number, tierQuantity?: number): number {
  const q = tierQuantity ?? quantity;
  const unit = tierFor(tiers, q).unitPrice;
  return round2(quantity * unit);
}

/**
 * Precificacao progressiva (charge_in_tiers=true): cada unidade ao preco da sua
 * faixa. A faixa i cobre minQuantity[i]..minQuantity[i+1]-1.
 */
export function priceProgressive(tiers: Tier[], quantity: number): number {
  const sorted = sortedTiers(tiers);
  let total = 0;
  for (let unit = 1; unit <= quantity; unit++) {
    let price: number | undefined;
    for (const t of sorted) {
      if (t.minQuantity <= unit) price = t.unitPrice;
    }
    if (price === undefined) {
      throw new Error(`Unidade ${unit} abaixo da faixa minima.`);
    }
    total += price;
  }
  return round2(total);
}

/** Despacha entre flat e progressive conforme charge_in_tiers. */
export function priceTier(
  tiers: Tier[],
  quantity: number,
  chargeInTiers: boolean,
  tierQuantity?: number
): number {
  return chargeInTiers
    ? priceProgressive(tiers, quantity)
    : priceFlat(tiers, quantity, tierQuantity);
}

// ---------------------------------------------------------------------------
// Transicao de template no periodo
// ---------------------------------------------------------------------------

/** Soma dias a uma data ISO 'YYYY-MM-DD' em UTC (evita deslocamento de fuso). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Indice do template vigente numa data: validFrom<=d<=validUntil (nulos = aberto).
 * Comparacao de datas ISO por string funciona pelo formato 'YYYY-MM-DD'.
 * Retorna -1 quando nenhum template cobre a data.
 */
function templateIndexAt(templates: Template[], date: string): number {
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const fromOk = t.validFrom == null || t.validFrom <= date;
    const untilOk = t.validUntil == null || date <= t.validUntil;
    if (fromOk && untilOk) return i;
  }
  return -1;
}

/**
 * Calcula o preco do periodo (em semanas) respeitando a transicao de template.
 * Semana i comeca em startDate + i*7 dias. A faixa e sempre pela quantidade
 * TOTAL contratada (secao 4.2). Se algum trecho ficar sem template, lanca erro
 * (warning bloqueante).
 */
export function calcWithTransition(params: {
  startDate: string;
  weeks: number;
  templates: Template[];
  strategy: TransitionStrategy;
  chargeInTiers?: boolean;
  bookingDate?: string;
}): TransitionResult {
  const { startDate, weeks, templates, strategy } = params;
  const chargeInTiers = params.chargeInTiers ?? false;
  const totalQuantity = weeks;

  // Estrategias de template unico: precifica todo o periodo por um template.
  if (strategy === "use_start_date_price" || strategy === "use_booking_date_price") {
    const anchorDate =
      strategy === "use_start_date_price" ? startDate : params.bookingDate;
    if (!anchorDate) {
      throw new Error("bookingDate obrigatorio para use_booking_date_price.");
    }
    const idx = templateIndexAt(templates, anchorDate);
    if (idx < 0) {
      throw new Error(
        `Nenhum template vigente na data ${anchorDate} (warning bloqueante).`
      );
    }
    const tpl = templates[idx];
    const amount = priceTier(tpl.tiers, weeks, chargeInTiers, totalQuantity);
    const segment: PriceSegment = {
      templateIndex: idx,
      templateName: tpl.name,
      startDate,
      weeks,
      unitPrice: chargeInTiers ? null : tierFor(tpl.tiers, totalQuantity).unitPrice,
      amount,
    };
    return { amount, segments: [segment], totalQuantity };
  }

  // split_by_period: segmenta por template vigente na data de inicio de cada semana.
  const segments: PriceSegment[] = [];
  let runStart = 0;
  let runIdx = -2; // sentinela: nada aberto ainda

  const flush = (fromWeek: number, toWeekExclusive: number, idx: number) => {
    const tpl = templates[idx];
    const segWeeks = toWeekExclusive - fromWeek;
    // Cada segmento e precificado pelo seu template usando a FAIXA do total.
    const amount = priceTier(tpl.tiers, segWeeks, chargeInTiers, totalQuantity);
    segments.push({
      templateIndex: idx,
      templateName: tpl.name,
      startDate: addDays(startDate, fromWeek * 7),
      weeks: segWeeks,
      unitPrice: chargeInTiers ? null : tierFor(tpl.tiers, totalQuantity).unitPrice,
      amount,
    });
  };

  for (let w = 0; w < weeks; w++) {
    const weekDate = addDays(startDate, w * 7);
    const idx = templateIndexAt(templates, weekDate);
    if (idx < 0) {
      throw new Error(
        `Nenhum template vigente na semana que inicia em ${weekDate} (warning bloqueante).`
      );
    }
    if (idx !== runIdx) {
      if (runIdx >= 0) flush(runStart, w, runIdx);
      runStart = w;
      runIdx = idx;
    }
  }
  if (runIdx >= 0) flush(runStart, weeks, runIdx);

  // Total = soma das linhas (segmentos) ja arredondadas.
  const amount = sumMoney(segments.map((s) => s.amount));
  return { amount, segments, totalQuantity };
}

// ---------------------------------------------------------------------------
// Unidades gratuitas (free units)
// ---------------------------------------------------------------------------

/**
 * Aplica unidades gratuitas conforme a semantica:
 * - bonus_on_top: contrata/paga N, recebe N+F. Faixa por N. gross = N ao preco
 *   da faixa de N. Sem desconto.
 * - discount_on_booked: contrata N, recebe N, paga N-F. Faixa por N. gross = N
 *   ao preco da faixa de N; discount = F x preco da faixa de N; net = gross - discount.
 */
export function applyFreeUnits(params: {
  tiers: Tier[];
  bookedQuantity: number;
  freeUnits: number;
  semantics: FreeUnitSemantics;
  chargeInTiers?: boolean;
}): FreeUnitsResult {
  const { tiers, bookedQuantity: n, freeUnits: f, semantics } = params;
  const chargeInTiers = params.chargeInTiers ?? false;

  // Faixa e bruto sempre pela quantidade contratada N.
  const grossAmount = priceTier(tiers, n, chargeInTiers, n);
  const tierUnit = tierFor(tiers, n).unitPrice;

  if (semantics === "bonus_on_top") {
    return {
      billableQuantity: n,
      deliveredQuantity: n + f,
      grossAmount,
      discountAmount: 0,
      netAmount: grossAmount,
    };
  }

  // discount_on_booked
  const discountAmount = round2(f * tierUnit);
  return {
    billableQuantity: n - f,
    deliveredQuantity: n,
    grossAmount,
    discountAmount,
    netAmount: round2(grossAmount - discountAmount),
  };
}

// ---------------------------------------------------------------------------
// Taxa de matricula agregada
// ---------------------------------------------------------------------------

/** Agrega taxas de matricula de multiplos itens conforme a regra. */
export function aggregateRegistrationFee(
  amounts: number[],
  rule: RegistrationFeeRule
): number {
  if (amounts.length === 0) return 0;
  switch (rule) {
    case "charge_highest":
      return round2(Math.max(...amounts));
    case "charge_lowest":
      return round2(Math.min(...amounts));
    case "charge_all":
      return sumMoney(amounts);
  }
}

// ---------------------------------------------------------------------------
// Conversao cambial
// ---------------------------------------------------------------------------

/**
 * Converte um valor pela taxa de referencia com markup.
 * effectiveRate = referenceRate x (1 + markupPercent).
 * rounding: none (2 casas); up_1/up_10/up_100 arredondam o convertido PARA CIMA
 * ao multiplo correspondente.
 */
export function convertFx(params: {
  amount: number;
  referenceRate: number;
  markupPercent?: number;
  rounding?: FxRounding;
}): { effectiveRate: number; converted: number } {
  const { amount, referenceRate } = params;
  const markup = params.markupPercent ?? 0;
  const rounding = params.rounding ?? "none";

  // A taxa efetiva mantem precisao alta (nao e dinheiro em 2 casas).
  const effectiveRate = referenceRate * (1 + markup);
  const raw = amount * effectiveRate;

  let converted: number;
  switch (rounding) {
    case "up_1":
      converted = Math.ceil(round2(raw));
      break;
    case "up_10":
      converted = Math.ceil(round2(raw) / 10) * 10;
      break;
    case "up_100":
      converted = Math.ceil(round2(raw) / 100) * 100;
      break;
    case "none":
    default:
      converted = round2(raw);
      break;
  }

  return { effectiveRate, converted };
}
