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

/** Base de cobranca de uma taxa (secao 3.6, `fee.charge_basis`). */
export type FeeChargeBasis =
  | "once_per_quote"
  | "once_per_item"
  | "per_unit"
  | "per_person";

/** Taxa avulsa da cotacao (subconjunto puro de `fee`, secao 3.6). */
export type Fee = {
  name: string;
  feeType: string; // fee_type (registration | material | bank | ...)
  chargeBasis: FeeChargeBasis;
  amount: number;
  currency: string;
  isRefundable?: boolean;
};

/** Contexto de calculo das taxas (quantidades que multiplicam cada base). */
export type FeeContext = {
  billableQuantity: number; // unidades cobraveis (para per_unit)
  itemCount: number; // itens da opcao (para once_per_item)
  personCount: number; // pessoas (para per_person)
  programItemCount: number; // itens do tipo program (dispara regra multi-curso)
  multiCourseRule: RegistrationFeeRule; // como agregar matriculas com >1 programa
};

/** Linha de taxa calculada (rastro auditavel do price_breakdown, secao 4.7). */
export type FeeLine = {
  name: string;
  amount: number;
  currency: string;
  basis: string;
};

/** Dimensao de segmentacao de uma promocao (secao 3.6, `promotion_target`). */
export type PromotionDimension =
  | "market"
  | "nationality"
  | "campus"
  | "partner"
  | "product"
  | "education_type";

/** Alvo de segmentacao de uma promocao. */
export type PromotionTarget = { dimension: PromotionDimension; value: string };

/** Tipo de promocao (secao 3.6, `promotion.promo_type`). */
export type PromoType =
  | "percent_off"
  | "fixed_off"
  | "free_units"
  | "waive_fee"
  | "free_product"
  | "override_price";

/** Alvo do valor sobre o qual a promocao incide (`promotion.applies_to`). */
export type PromoAppliesTo =
  | "tuition"
  | "accommodation"
  | "insurance"
  | "fees"
  | "specific_fee"
  | "total"
  | "specific_product";

/** Promocao (subconjunto puro de `promotion` + `promotion_target`, secao 3.6). */
export type Promotion = {
  id?: string;
  name: string;
  promoType: PromoType;
  value?: number;
  appliesTo: PromoAppliesTo;
  appliesToRefId?: string;
  minQuantity?: number;
  maxDiscountAmount?: number;
  isStackable: boolean;
  priority: number;
  status: "draft" | "active" | "expired";
  bookingFrom?: string; // datas ISO 'YYYY-MM-DD'; ausente = aberto
  bookingUntil?: string;
  travelFrom?: string;
  travelUntil?: string;
  targets: PromotionTarget[];
};

/** Contexto de aplicabilidade da promocao (fotografia do cenario da cotacao). */
export type PromoContext = {
  quoteDate: string; // data de emissao/reserva (compara com booking_from/until)
  startDate: string; // data de inicio da viagem (compara com travel_from/until)
  billableQuantity: number;
  marketId?: string;
  nationalityCode?: string;
  campusId?: string;
  partnerId?: string;
  productId?: string;
  educationType?: string;
};

/** Bases de desconto por alvo (valores ja consolidados da opcao). */
export type PromoBases = {
  tuition: number;
  accommodation: number;
  insurance: number;
  fees: number;
  total: number;
};

/** Linha de desconto calculada (rastro auditavel). */
export type DiscountLine = { name: string; amount: number; appliesTo: string };

/** Semantica das unidades gratuitas embutidas na requisicao. */
export type PriceRequestFreeUnits = { semantics: FreeUnitSemantics; units: number };

/** Politica de conversao cambial da requisicao (secao 4.1). */
export type PriceRequestFx = {
  referenceRate: number;
  markupPercent?: number;
  rounding?: FxRounding;
  presentmentCurrency: string;
};

/** Requisicao de precificacao de um item (secao 4.1). Tudo ja carregado (puro). */
export type PriceRequest = {
  product: {
    currency: string;
    kind?: string;
    minDuration?: number;
    maxDuration?: number;
    availableFrom?: string;
    availableUntil?: string;
  };
  startDate: string;
  quantity: number;
  unit: string; // 'week' calcula endDate por semanas; outras unidades = startDate
  templates: Template[];
  transitionRule: TransitionStrategy;
  chargeInTiers?: boolean;
  fees: Fee[];
  feeContext?: Partial<FeeContext>;
  promotions: Promotion[];
  freeUnits?: PriceRequestFreeUnits;
  context: PromoContext; // PromoContext ja inclui quoteDate
  bookingDate?: string; // exigido por use_booking_date_price
  fx?: PriceRequestFx;
};

/** Item precificado (saida do motor, secao 4.1). breakdown = rastro (secao 4.7). */
export type PricedItem = {
  billableQuantity: number;
  deliveredQuantity: number;
  endDate: string;
  grossAmount: number;
  averageUnitPrice: number;
  currency: string;
  fees: FeeLine[];
  discounts: DiscountLine[];
  netAmount: number;
  breakdown: unknown;
  warnings: string[];
  presentment?: { currency: string; amount: number; effectiveRate: number };
};

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
// Taxas (fees) — secao 4.5
// ---------------------------------------------------------------------------

/** Valor bruto de uma taxa segundo sua base de cobranca (antes do round). */
function feeRawAmount(fee: Fee, ctx: FeeContext): number {
  switch (fee.chargeBasis) {
    case "once_per_quote":
      return fee.amount;
    case "once_per_item":
      return fee.amount * ctx.itemCount;
    case "per_unit":
      return fee.amount * ctx.billableQuantity;
    case "per_person":
      return fee.amount * ctx.personCount;
  }
}

/**
 * Aplica as taxas da opcao (secao 4.5). Cada linha e arredondada com round2 e o
 * total e a soma das linhas arredondadas (sumMoney), nunca o round da soma.
 *
 * Regra multi-curso: com MAIS DE UM item do tipo program (programItemCount > 1),
 * as taxas de matricula (feeType='registration') sao agregadas numa unica linha
 * via aggregateRegistrationFee conforme multiCourseRule (charge_highest/lowest/
 * all). Com um unico programa, a matricula e cobrada normalmente pela sua base.
 */
export function applyFees(
  fees: Fee[],
  ctx: FeeContext
): { fees: FeeLine[]; total: number } {
  const lines: FeeLine[] = [];
  const registrationFees: Fee[] = [];

  for (const fee of fees) {
    // Matriculas com multiplos programas entram na agregacao multi-curso.
    if (fee.feeType === "registration" && ctx.programItemCount > 1) {
      registrationFees.push(fee);
      continue;
    }
    lines.push({
      name: fee.name,
      amount: round2(feeRawAmount(fee, ctx)),
      currency: fee.currency,
      basis: fee.chargeBasis,
    });
  }

  // Agrega as N matriculas numa unica linha (charge_all soma; highest/lowest
  // escolhem um valor). Reaproveita aggregateRegistrationFee sobre os amounts.
  if (registrationFees.length > 0) {
    const amounts = registrationFees.map((f) => f.amount);
    lines.push({
      name: "Matricula (multi-curso)",
      amount: aggregateRegistrationFee(amounts, ctx.multiCourseRule),
      currency: registrationFees[0].currency,
      basis: `registration:${ctx.multiCourseRule}`,
    });
  }

  return { fees: lines, total: sumMoney(lines.map((l) => l.amount)) };
}

// ---------------------------------------------------------------------------
// Promocoes — secao 4.5
// ---------------------------------------------------------------------------

/** Valor do contexto para uma dimensao de segmentacao (nulo = nao informado). */
function promoContextValue(
  dimension: PromotionDimension,
  ctx: PromoContext
): string | undefined {
  switch (dimension) {
    case "market":
      return ctx.marketId;
    case "nationality":
      return ctx.nationalityCode;
    case "campus":
      return ctx.campusId;
    case "partner":
      return ctx.partnerId;
    case "product":
      return ctx.productId;
    case "education_type":
      return ctx.educationType;
  }
}

/**
 * Aplicabilidade de uma promocao (secao 4.5): todas as condicoes precisam valer.
 * - status = 'active';
 * - quoteDate dentro de [bookingFrom, bookingUntil] quando definidos;
 * - startDate dentro de [travelFrom, travelUntil] quando definidos;
 * - billableQuantity >= minQuantity quando definido;
 * - targets: dentro de CADA dimensao basta um valor bater (OU); entre dimensoes
 *   TODAS precisam bater (E); dimensao sem alvo nao restringe.
 * Comparacao de datas ISO por string (formato 'YYYY-MM-DD').
 */
export function isPromotionApplicable(
  promo: Promotion,
  ctx: PromoContext
): boolean {
  if (promo.status !== "active") return false;

  // Janela de reserva (booking).
  if (promo.bookingFrom != null && ctx.quoteDate < promo.bookingFrom) return false;
  if (promo.bookingUntil != null && ctx.quoteDate > promo.bookingUntil) return false;

  // Janela de viagem (travel).
  if (promo.travelFrom != null && ctx.startDate < promo.travelFrom) return false;
  if (promo.travelUntil != null && ctx.startDate > promo.travelUntil) return false;

  // Quantidade minima.
  if (promo.minQuantity != null && ctx.billableQuantity < promo.minQuantity) {
    return false;
  }

  // Targets: agrupa por dimensao (OU dentro; E entre; dimensao sem alvo nao restringe).
  const byDimension = new Map<PromotionDimension, string[]>();
  for (const t of promo.targets) {
    const list = byDimension.get(t.dimension);
    if (list) list.push(t.value);
    else byDimension.set(t.dimension, [t.value]);
  }
  for (const [dimension, values] of byDimension) {
    const ctxValue = promoContextValue(dimension, ctx);
    // A dimensao restringe: o contexto precisa ter um valor que bata (OU).
    if (ctxValue == null || !values.includes(ctxValue)) return false;
  }

  return true;
}

/** Base do desconto conforme applies_to. specific_* fica fora deste escopo (base 0). */
function promoBase(promo: Promotion, bases: PromoBases): number {
  switch (promo.appliesTo) {
    case "tuition":
      return bases.tuition;
    case "accommodation":
      return bases.accommodation;
    case "insurance":
      return bases.insurance;
    case "fees":
      return bases.fees;
    case "total":
      return bases.total;
    // specific_fee / specific_product exigem o id do alvo e o valor da linha
    // especifica, que nao existem neste escopo puro. Trata como base 0 (nao
    // gera desconto); sera implementado quando a cotacao expuser as linhas.
    case "specific_fee":
    case "specific_product":
    default:
      return 0;
  }
}

/**
 * Aplica as promocoes (secao 4.5). Ordena por priority crescente e aplica a
 * primeira aplicavel; as seguintes so entram se TODAS as ja aplicadas E a
 * candidata forem isStackable. maxDiscountAmount e teto por promocao. Cada linha
 * e arredondada com round2; o total e sumMoney das linhas.
 *
 * Tipos suportados: percent_off (value = percentual, ex.: 30 = 30%) e fixed_off
 * (value = valor absoluto). Os demais (free_units, waive_fee, free_product,
 * override_price) fogem deste escopo e sao ignorados aqui.
 */
export function applyPromotions(
  promotions: Promotion[],
  bases: PromoBases,
  ctx: PromoContext
): { discounts: DiscountLine[]; totalDiscount: number } {
  const sorted = [...promotions].sort((a, b) => a.priority - b.priority);
  const discounts: DiscountLine[] = [];
  const applied: Promotion[] = [];

  for (const promo of sorted) {
    if (!isPromotionApplicable(promo, ctx)) continue;

    // Empilhamento: a primeira sempre entra; as seguintes so se todas as ja
    // aplicadas E a candidata forem empilhaveis.
    if (applied.length > 0) {
      const allStackable = promo.isStackable && applied.every((p) => p.isStackable);
      if (!allStackable) continue;
    }

    const base = promoBase(promo, bases);
    let amount: number;
    if (promo.promoType === "percent_off") {
      amount = round2((base * (promo.value ?? 0)) / 100);
    } else if (promo.promoType === "fixed_off") {
      amount = round2(promo.value ?? 0);
    } else {
      // Tipos fora deste escopo (semanas gratis, isencao, brinde, override).
      continue;
    }

    // Teto por promocao.
    if (promo.maxDiscountAmount != null && amount > promo.maxDiscountAmount) {
      amount = round2(promo.maxDiscountAmount);
    }

    if (amount <= 0) continue; // sem base valida (ex.: specific_*) nao gera linha

    discounts.push({ name: promo.name, amount, appliesTo: promo.appliesTo });
    applied.push(promo);
  }

  return { discounts, totalDiscount: sumMoney(discounts.map((d) => d.amount)) };
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

// ---------------------------------------------------------------------------
// Orquestracao de topo — secao 4.1/4.2
// ---------------------------------------------------------------------------

/**
 * Precifica um item de cotacao (secao 4.1) seguindo a sequencia da secao 4.2:
 * disponibilidade -> bruto (com/sem unidades gratuitas, respeitando a transicao
 * de template) -> taxas -> promocoes -> medias/arredondamento -> conversao.
 *
 * E PURA: recebe tudo ja carregado (templates, fees, promotions, fx) e nao toca
 * banco. Gera `warnings` em vez de lancar; a UNICA excecao e o buraco de
 * cobertura de template (calcWithTransition lanca), que vira warning BLOQUEANTE
 * e devolve amounts 0.
 */
export function priceProduct(request: PriceRequest): PricedItem {
  const {
    product,
    startDate,
    quantity,
    unit,
    templates,
    transitionRule,
    fees,
    promotions,
    freeUnits,
    context,
  } = request;
  const chargeInTiers = request.chargeInTiers ?? false;
  const currency = product.currency;
  const warnings: string[] = [];

  // 1) Disponibilidade (nao bloqueia; apenas alerta).
  if (product.availableFrom != null && startDate < product.availableFrom) {
    warnings.push(
      `Data de inicio ${startDate} anterior ao inicio da disponibilidade (${product.availableFrom}).`
    );
  }
  if (product.availableUntil != null && startDate > product.availableUntil) {
    warnings.push(
      `Data de inicio ${startDate} posterior ao fim da disponibilidade (${product.availableUntil}).`
    );
  }
  if (product.minDuration != null && quantity < product.minDuration) {
    warnings.push(
      `Quantidade ${quantity} abaixo da duracao minima (${product.minDuration}).`
    );
  }
  if (product.maxDuration != null && quantity > product.maxDuration) {
    warnings.push(
      `Quantidade ${quantity} acima da duracao maxima (${product.maxDuration}).`
    );
  }

  // 2) Bruto. Duas trilhas: unidades gratuitas ou transicao de template.
  let billableQuantity: number;
  let deliveredQuantity: number;
  let grossAmount: number;
  let breakdown: unknown;
  // Desconto ja embutido em applyFreeUnits (semantica discount_on_booked).
  const freeUnitsDiscounts: DiscountLine[] = [];

  if (freeUnits) {
    // Faixa/bruto pela quantidade contratada, usando o template vigente no inicio.
    const idx = templateIndexAt(templates, startDate);
    const tiers = (idx >= 0 ? templates[idx] : templates[0])?.tiers ?? [];
    const fu = applyFreeUnits({
      tiers,
      bookedQuantity: quantity,
      freeUnits: freeUnits.units,
      semantics: freeUnits.semantics,
      chargeInTiers,
    });
    billableQuantity = fu.billableQuantity;
    deliveredQuantity = fu.deliveredQuantity;
    grossAmount = fu.grossAmount;
    if (fu.discountAmount > 0) {
      freeUnitsDiscounts.push({
        name: "Unidades gratuitas",
        amount: fu.discountAmount,
        appliesTo: "tuition",
      });
    }
    breakdown = { source: "free_units", freeUnits: fu };
  } else {
    // Transicao de template. So aqui pode ocorrer o warning BLOQUEANTE.
    try {
      const tr = calcWithTransition({
        startDate,
        weeks: quantity,
        templates,
        strategy: transitionRule,
        chargeInTiers,
        bookingDate: request.bookingDate,
      });
      billableQuantity = quantity;
      deliveredQuantity = quantity;
      grossAmount = tr.amount;
      breakdown = { source: "transition", segments: tr.segments };
    } catch (e) {
      // Buraco de cobertura de template: warning bloqueante, amounts 0.
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`Warning bloqueante: ${msg}`);
      return {
        billableQuantity: quantity,
        deliveredQuantity: quantity,
        endDate: startDate,
        grossAmount: 0,
        averageUnitPrice: 0,
        currency,
        fees: [],
        discounts: [],
        netAmount: 0,
        breakdown: { source: "blocked", error: msg },
        warnings,
      };
    }
  }

  // 3) endDate = inicio + deliveredQuantity semanas (unit 'week'); senao startDate.
  const endDate =
    unit === "week" ? addDays(startDate, deliveredQuantity * 7) : startDate;

  // 4) Taxas. billableQuantity default = quantidade cobravel do item.
  const feeContext: FeeContext = {
    billableQuantity: request.feeContext?.billableQuantity ?? billableQuantity,
    itemCount: request.feeContext?.itemCount ?? 1,
    personCount: request.feeContext?.personCount ?? 1,
    programItemCount: request.feeContext?.programItemCount ?? 1,
    multiCourseRule: request.feeContext?.multiCourseRule ?? "charge_highest",
  };
  const feesResult = applyFees(fees, feeContext);

  // 5) Promocoes. Base tuition = bruto do curso; fees = soma das taxas.
  const bases: PromoBases = {
    tuition: grossAmount,
    accommodation: 0,
    insurance: 0,
    fees: feesResult.total,
    total: round2(grossAmount + feesResult.total),
  };
  const promoResult = applyPromotions(promotions, bases, context);
  // Descontos de unidades gratuitas somam aos descontos de promocao.
  const discounts: DiscountLine[] = [...freeUnitsDiscounts, ...promoResult.discounts];
  const totalDiscounts = sumMoney(discounts.map((d) => d.amount));

  // 6) Media por unidade cobravel (secao 14.1: media ANTES do desconto).
  const avgUnitPrice = averageUnitPrice(grossAmount, billableQuantity);

  // 7) Liquido = bruto + taxas - descontos.
  const netAmount = round2(grossAmount + feesResult.total - totalDiscounts);

  const result: PricedItem = {
    billableQuantity,
    deliveredQuantity,
    endDate,
    grossAmount,
    averageUnitPrice: avgUnitPrice,
    currency,
    fees: feesResult.fees,
    discounts,
    netAmount,
    breakdown: {
      ...(breakdown as object),
      fees: feesResult.fees,
      discounts,
      bases,
    },
    warnings,
  };

  // 8) Conversao cambial (so quando a moeda de apresentacao difere da de origem).
  if (request.fx && request.fx.presentmentCurrency !== currency) {
    const fx = convertFx({
      amount: netAmount,
      referenceRate: request.fx.referenceRate,
      markupPercent: request.fx.markupPercent,
      rounding: request.fx.rounding,
    });
    result.presentment = {
      currency: request.fx.presentmentCurrency,
      amount: fx.converted,
      effectiveRate: fx.effectiveRate,
    };
  }

  return result;
}
