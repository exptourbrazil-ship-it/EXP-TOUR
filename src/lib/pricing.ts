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

/**
 * Base de cobranca do template (espelha `price_template.price_basis`, secao
 * 3.6). Hoje so 'fixed' muda o calculo no motor: as demais ('duration',
 * 'quantity', 'per_person') preservam o comportamento historico (flat ou
 * progressivo, sempre `unitPrice x quantity`).
 */
export type PriceBasis = "duration" | "quantity" | "fixed" | "per_person";

/** Template de preco com janela de vigencia (datas ISO 'YYYY-MM-DD', nulo = aberto). */
export type Template = {
  name?: string;
  tiers: Tier[];
  validFrom?: string | null;
  validUntil?: string | null;
  /**
   * 'fixed' = preco de PACOTE FECHADO: o valor da faixa aplicavel (por
   * min_quantity) e o total, sem multiplicar pela quantidade contratada (ex.:
   * internship/volunteering da Twin Group, onde 750 EUR vale o mesmo para 4 ou
   * 20 semanas). Ausente/demais valores = comportamento historico
   * (`unitPrice x quantity`).
   */
  priceBasis?: PriceBasis;
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
  /**
   * Presente quando a promocao de unidades gratuitas foi IGNORADA por nao
   * fazer sentido para o produto (ex.: discount_on_booked em price_basis=
   * 'fixed', ver applyFreeUnits). O chamador deve levar isto para `warnings`.
   */
  warning?: string;
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
  /** `fee.id` de origem, para a cotacao apontar de volta ao catalogo. */
  id?: string;
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
  /**
   * `fee.id` de origem. Ausente quando a linha nao vem de UMA taxa so (ex.: a
   * matricula multi-curso, que funde varias).
   */
  feeId?: string;
  /**
   * Ids das taxas FUNDIDAS nesta linha. Sem isto, uma promocao de isencao de
   * matricula funcionava com um curso e sumia em silencio com dois, porque a
   * linha fundida nao tem `feeId` e a promocao nao achava o alvo.
   */
  mergedFeeIds?: string[];
  name: string;
  amount: number;
  currency: string;
  basis: string;
  /**
   * Reembolsavel: `true`/`false` do catalogo, `undefined` = DESCONHECIDO.
   * Viaja ate a cotacao porque decide duas coisas para o cliente: a etiqueta
   * "(nao reembolsavel)" na proposta e se a taxa entra na ENTRADA. Perder essa
   * flag no caminho fazia toda taxa chegar como desconhecida.
   */
  isRefundable?: boolean;
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
  /** So para promoType 'free_units'. Default: bonus_on_top. */
  freeUnitsSemantics?: FreeUnitSemantics;
  /**
   * So para 'free_units': quantidade usada para escolher a FAIXA DE PRECO, no
   * lugar da contratada. A VanWest da 4 semanas gratis a quem contrata 24, mas
   * cobra a semana "pela tarifa aplicavel ao periodo de 12 a 23 semanas" — que
   * e MAIS CARA que a faixa de 24. Sem isto, o desconto sairia maior do que a
   * escola concede e a diferenca ficaria com a agencia.
   */
  freeUnitsTierQuantity?: number;
  minQuantity?: number;
  /**
   * Teto de quantidade (inclusivo). Espelha minQuantity e existe porque uma
   * promocao de faixa e um INTERVALO: "material gratis ate 12 semanas" ou "de
   * 12 a 23 semanas o preco e outro". Sem o teto, so da para dizer "a partir
   * de", e duas faixas de preco se sobreporiam na mesma cotacao.
   */
  maxQuantity?: number;
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
  /**
   * Valor COBRADO de cada taxa, por `fee.id`. E o que permite uma promocao
   * mirar UMA taxa ("material didatico gratis") em vez de todas. Sem isto,
   * isentar o material derrubaria tambem a matricula.
   */
  feeAmountById?: Record<string, number>;
};

/** Linha de desconto calculada (rastro auditavel). */
export type DiscountLine = {
  name: string;
  amount: number;
  appliesTo: string;
  // Identidade e PRAZO da promocao que gerou a linha (secao 4.5), para a cotacao
  // congelar e exibir "valida ate". Ausentes em descontos que nao vem de promocao
  // (ex.: semanas gratis por faixa).
  promotionId?: string;
  validUntil?: string; // = promotion.bookingUntil (ISO 'YYYY-MM-DD')
};

/** Semantica das unidades gratuitas embutidas na requisicao. */
export type PriceRequestFreeUnits = { semantics: FreeUnitSemantics; units: number; tierQuantity?: number };

/** Politica de conversao cambial da requisicao (secao 4.1). */
export type PriceRequestFx = {
  referenceRate: number;
  markupPercent?: number;
  rounding?: FxRounding;
  presentmentCurrency: string;
};

/** Como ratear o ajuste sazonal: por noite ou semana cheia. */
export type SeasonalProration = "nightly" | "full_week";

/**
 * Ponto de um periodo sazonal. Sem `year` = RECORRENTE (vale todo ano, como as
 * escolas publicam: "alta temporada 14/jun a 23/ago"); com `year` vale so
 * naquele ano ("26/jun a 30/ago/2026"). Mesma forma de `PeriodoPonto` em
 * sazonalidade.ts (o parser do texto do fornecedor), por compatibilidade
 * estrutural — pricing.ts nao importa nada local de proposito.
 */
export type SeasonalPeriod = { month: number; day: number; year?: number };

/** Ajuste sazonal de acomodacao por semana (positivo = suplemento, negativo = desconto). */
export type SeasonalAdjustment = {
  name: string;
  amountPerWeek: number;
  from: SeasonalPeriod;
  to: SeasonalPeriod; // INCLUSIVO: a noite de `to` conta
};

/** Linha de ajuste sazonal (rastro auditavel; nunca embutida na acomodacao). */
export type SeasonalLine = {
  name: string;
  amount: number;
  nights: number;
  weeksCharged?: number; // so em full_week: blocos de 7 noites cobrados
  from: string; // data ISO da primeira noite efetivamente aplicada
  to: string; // data ISO da ultima noite efetivamente aplicada
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
  seasonalAdjustments?: SeasonalAdjustment[]; // ajustes de temporada da acomodacao
  seasonalProration?: SeasonalProration; // default "nightly"
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
  seasonal?: SeasonalLine[]; // linhas de temporada (ausente quando nao ha ajuste)
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

/**
 * Precificacao de PACOTE FECHADO (price_basis='fixed'): o preco e o unitPrice
 * da faixa aplicavel, SEM multiplicar pela quantidade — e um valor total, nao
 * uma tarifa por unidade. `tierQuantity` segue a mesma logica de priceFlat
 * (faixa escolhida pela quantidade TOTAL contratada, nao pelo segmento).
 */
export function priceFixed(tiers: Tier[], quantity: number, tierQuantity?: number): number {
  const q = tierQuantity ?? quantity;
  return round2(tierFor(tiers, q).unitPrice);
}

/**
 * Despacha entre flat, progressive e fixed. `priceBasis === 'fixed'` vence
 * qualquer valor de `chargeInTiers` (pacote fechado nao tem nocao de
 * progressivo). Ausente/demais valores preservam o despacho historico.
 */
export function priceTier(
  tiers: Tier[],
  quantity: number,
  chargeInTiers: boolean,
  tierQuantity?: number,
  priceBasis?: PriceBasis
): number {
  if (priceBasis === "fixed") {
    return priceFixed(tiers, quantity, tierQuantity);
  }
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
    const amount = priceTier(tpl.tiers, weeks, chargeInTiers, totalQuantity, tpl.priceBasis);
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
  // EXCECAO: price_basis='fixed' nao tem "preco por segmento" pra somar entre
  // templates — cobrar em pedacos por template diferente somaria PACOTES
  // INTEIROS (ex.: 750 do template antigo + 900 do template novo = 1650 em
  // vez de UM pacote). Um pacote fechado nao se divide: ancora num template
  // so, o vigente no inicio (mesmo comportamento de use_start_date_price).
  const idxAncoraFixa = templateIndexAt(templates, startDate);
  if (idxAncoraFixa >= 0 && templates[idxAncoraFixa].priceBasis === "fixed") {
    const tpl = templates[idxAncoraFixa];
    const amount = priceTier(tpl.tiers, weeks, chargeInTiers, totalQuantity, tpl.priceBasis);
    const segment: PriceSegment = {
      templateIndex: idxAncoraFixa,
      templateName: tpl.name,
      startDate,
      weeks,
      // Pacote fechado nao tem preco unitario por semana (ver priceFixed).
      unitPrice: null,
      amount,
    };
    return { amount, segments: [segment], totalQuantity };
  }

  const segments: PriceSegment[] = [];
  let runStart = 0;
  let runIdx = -2; // sentinela: nada aberto ainda

  const flush = (fromWeek: number, toWeekExclusive: number, idx: number) => {
    const tpl = templates[idx];
    const segWeeks = toWeekExclusive - fromWeek;
    // Cada segmento e precificado pelo seu template usando a FAIXA do total.
    const amount = priceTier(tpl.tiers, segWeeks, chargeInTiers, totalQuantity, tpl.priceBasis);
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
/** Alvos de promocao que casam com cada tipo de produto. */
const ALVO_POR_KIND: Record<string, PromoAppliesTo[]> = {
  program: ["tuition", "total"],
  accommodation: ["accommodation", "total"],
  insurance: ["insurance", "total"],
};

/**
 * Escolhe a promocao de UNIDADES GRATUITAS aplicavel ao cenario. O motor ja
 * sabia calcular semanas gratis (applyFreeUnits), mas nada ligava isso a tabela
 * de promocoes: a escola oferecia "24 semanas, 4 gratis" e a cotacao cobrava as
 * 28. Empate resolve por priority, depois pela MAIOR quantidade e por fim pelo
 * id — sem o ultimo criterio, a ordem do banco decidiria o preco.
 *
 * Tres recusas que NAO sao detalhe:
 * - `appliesTo` precisa casar com o kind do produto. As promocoes vem do
 *   FORNECEDOR, nao do produto: sem isto, "4 semanas gratis de curso" daria
 *   tambem 4 semanas de casa de familia do mesmo campus.
 * - `units` precisa ser inteiro e MENOR que a quantidade contratada. Com
 *   `discount_on_booked`, 4 gratis em 2 semanas cobradas gera quantidade -2 e
 *   valor NEGATIVO — credito para o estudante, sem nenhum aviso.
 */
export function escolherUnidadesGratuitas(
  promotions: Promotion[],
  ctx: PromoContext,
  opts: { kind: string; quantity: number; warnings?: string[] },
): { freeUnits: PriceRequestFreeUnits; promo: Promotion } | undefined {
  const alvosValidos = ALVO_POR_KIND[opts.kind] ?? ["total"];
  const candidatas = promotions
    .filter((p) => p.promoType === "free_units")
    .filter((p) => alvosValidos.includes(p.appliesTo))
    .filter((p) => isPromotionApplicable(p, ctx))
    .filter((p) => {
      const v = p.value ?? 0;
      if (!Number.isInteger(v) || v <= 0) return false;
      if (v >= opts.quantity) {
        opts.warnings?.push(
          `Promocao "${p.name}" oferece ${v} unidade(s) gratuita(s) para ${opts.quantity} contratada(s); ignorada.`,
        );
        return false;
      }
      return true;
    })
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        (b.value ?? 0) - (a.value ?? 0) ||
        (a.id ?? "").localeCompare(b.id ?? ""),
    );
  const escolhida = candidatas[0];
  if (!escolhida) return undefined;
  return {
    freeUnits: {
      units: escolhida.value as number,
      semantics: escolhida.freeUnitsSemantics ?? "bonus_on_top",
      ...(escolhida.freeUnitsTierQuantity != null
        ? { tierQuantity: escolhida.freeUnitsTierQuantity }
        : {}),
    },
    promo: escolhida,
  };
}

/**
 * Escolhe a promocao de PRECO PROMOCIONAL (override_price) aplicavel a ESTE
 * produto e ESTA quantidade. Ao contrario de free_units, override_price NAO
 * desconta sobre o preco calculado: e uma tabela de preco paralela ("Business
 * English 30 custa 220/semana ate 30/06/2026" em vez de 495/450/425/385) — cada
 * FAIXA de quantidade e uma LINHA separada de promotion, com seu proprio
 * minQuantity/maxQuantity/value.
 *
 * DECISAO: reaproveita isPromotionApplicable inteira (janelas de booking/
 * travel, targets e a faixa min/maxQuantity) em vez de reimplementar o
 * confronto de faixa aqui. Isso so e seguro porque `ctx.billableQuantity` ja
 * chega preenchido com a quantidade CONTRATADA antes deste ponto — e assim que
 * catalog-service.ts monta o PromoContext (`billableQuantity: quantity`) e e
 * assim que priceProduct recebe `request.context`. Se um dia a quantidade de
 * faixa precisar divergir da contratada (como free_units/freeUnitsTierQuantity
 * faz), quem chamar esta funcao precisa montar um ctx com o billableQuantity
 * certo, do mesmo jeito que applyPromotions ja faz com `ctxFaixa`.
 *
 * Desempate: menor priority vence; empate de priority (faixas sobrepostas por
 * erro de cadastro, que nao deveria acontecer) desempata por id — sem isto o
 * motor quebraria ou a ordem do banco decidiria o preco.
 */
export function escolherPrecoPromocional(
  promotions: Promotion[],
  ctx: PromoContext,
  opts: { productId?: string } = {},
): Promotion | undefined {
  const productId = opts.productId ?? ctx.productId;
  if (productId == null) return undefined;
  const candidatas = promotions
    .filter((p) => p.promoType === "override_price")
    .filter((p) => p.appliesTo === "specific_product" && p.appliesToRefId === productId)
    .filter((p) => p.value != null && p.value > 0)
    .filter((p) => isPromotionApplicable(p, ctx))
    .sort(
      (a, b) => a.priority - b.priority || (a.id ?? "").localeCompare(b.id ?? ""),
    );
  return candidatas[0];
}

export function applyFreeUnits(params: {
  tiers: Tier[];
  bookedQuantity: number;
  freeUnits: number;
  semantics: FreeUnitSemantics;
  chargeInTiers?: boolean;
  /** Faixa a usar no lugar de N (ver Promotion.freeUnitsTierQuantity). */
  tierQuantity?: number;
  /** price_basis do template escolhido (ver Template.priceBasis). */
  priceBasis?: PriceBasis;
}): FreeUnitsResult {
  const { tiers, bookedQuantity: n, freeUnits: f, semantics } = params;
  const chargeInTiers = params.chargeInTiers ?? false;
  // Cobra N unidades, mas pela faixa de `tierQuantity` quando a promocao manda.
  const qFaixa = params.tierQuantity ?? n;

  const grossAmount = priceTier(tiers, n, chargeInTiers, qFaixa, params.priceBasis);
  const tierUnit = tierFor(tiers, qFaixa).unitPrice;

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
  // price_basis='fixed': `tierUnit` aqui e o preco do PACOTE INTEIRO (nao um
  // valor por semana, ver priceFixed) — multiplicar isso por `f` semanas
  // gratis nao desconta uma FRACAO do pacote, desconta multiplos do pacote
  // inteiro, o que pode derrubar o liquido abaixo de zero (2 semanas gratis x
  // 750 = 1500 de "desconto" sobre um pacote de 750). "Semanas gratis" nao
  // tem sentido conceitual para um pacote fechado (Internship/Volunteering
  // nao tem preco por semana pra descontar): ignora a promocao com um aviso
  // em vez de calcular um valor negativo/absurdo em silencio.
  if (params.priceBasis === "fixed") {
    return {
      billableQuantity: n,
      deliveredQuantity: n,
      grossAmount,
      discountAmount: 0,
      netAmount: grossAmount,
      warning:
        "Semanas gratis nao se aplicam a produto de preco fixo (price_basis=fixed); promocao ignorada.",
    };
  }
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
/**
 * Combina o `isRefundable` de varias taxas fundidas numa linha so.
 * So e reembolsavel se TODAS forem explicitamente reembolsaveis; qualquer uma
 * nao reembolsavel torna a linha nao reembolsavel; se sobrar desconhecida, a
 * linha fica desconhecida. Nunca inventa `true`: dizer que e reembolsavel tira
 * a taxa da entrada, e a agencia receberia a menos.
 */
export function combinarReembolsavel(valores: (boolean | undefined)[]): boolean | undefined {
  if (valores.some((v) => v === false)) return false;
  if (valores.some((v) => v === undefined)) return undefined;
  return valores.length > 0 ? true : undefined;
}

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
      feeId: fee.id,
      name: fee.name,
      amount: round2(feeRawAmount(fee, ctx)),
      currency: fee.currency,
      basis: fee.chargeBasis,
      isRefundable: fee.isRefundable,
    });
  }

  // Agrega as N matriculas numa unica linha (charge_all soma; highest/lowest
  // escolhem um valor). Reaproveita aggregateRegistrationFee sobre os amounts.
  if (registrationFees.length > 0) {
    const amounts = registrationFees.map((f) => f.amount);
    lines.push({
      // Sem `feeId`: a linha funde varias taxas, nenhuma e "a" origem. Os ids
      // viajam em `mergedFeeIds` para a promocao de isencao continuar achando
      // o alvo.
      name: "Matricula (multi-curso)",
      mergedFeeIds: registrationFees.map((f) => f.id).filter((x): x is string => x != null),
      amount: aggregateRegistrationFee(amounts, ctx.multiCourseRule),
      currency: registrationFees[0].currency,
      basis: `registration:${ctx.multiCourseRule}`,
      isRefundable: combinarReembolsavel(registrationFees.map((f) => f.isRefundable)),
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

  // Quantidade minima e maxima (as duas inclusivas).
  if (promo.minQuantity != null && ctx.billableQuantity < promo.minQuantity) {
    return false;
  }
  if (promo.maxQuantity != null && ctx.billableQuantity > promo.maxQuantity) {
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
    // Taxa ESPECIFICA: base e o valor ja cobrado daquela taxa. Sem o id do
    // alvo ou com a taxa ausente da conta, base 0 — nao gera linha.
    case "specific_fee":
      return promo.appliesToRefId != null
        ? (bases.feeAmountById?.[promo.appliesToRefId] ?? 0)
        : 0;
    // specific_product ainda exige a linha do produto, que nao existe neste
    // escopo puro.
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
 * Tipos suportados: percent_off (value = percentual, ex.: 30 = 30%), fixed_off
 * (value = valor absoluto) e waive_fee (desconta a base inteira — com
 * appliesTo='specific_fee' isenta UMA taxa). free_units e override_price sao
 * resolvidos antes, no bruto (priceProduct). free_product segue fora do escopo.
 */
export function applyPromotions(
  promotions: Promotion[],
  bases: PromoBases,
  ctx: PromoContext,
  /**
   * Promocoes ja aplicadas FORA desta funcao — hoje, a de unidades gratuitas,
   * resolvida antes do bruto. Sem isto ela nao entrava na conta do
   * empilhamento, e uma promocao "4 semanas gratis" NAO empilhavel convivia com
   * um "10% off" tambem nao empilhavel: a escola dava os dois.
   */
  jaAplicadas: Promotion[] = [],
  /**
   * Contexto com a QUANTIDADE DE FAIXA, quando ela difere da contratada (ver
   * Promotion.freeUnitsTierQuantity). Vale so para as promocoes que incidem
   * sobre PRECO; as de taxa continuam olhando a duracao real, senao "material
   * gratis ate 12 semanas" passaria a valer numa reserva de 24.
   */
  ctxFaixa?: PromoContext,
): { discounts: DiscountLine[]; totalDiscount: number; warnings: string[] } {
  // Desempate por id: a consulta do banco nao garante ordem, e sem um criterio
  // final duas cotacoes identicas podiam sair com precos diferentes.
  const sorted = [...promotions].sort(
    (a, b) => a.priority - b.priority || (a.id ?? "").localeCompare(b.id ?? ""),
  );
  const discounts: DiscountLine[] = [];
  const applied: Promotion[] = [...jaAplicadas];
  const warnings: string[] = [];

  const ALVOS_DE_PRECO: PromoAppliesTo[] = ["tuition", "accommodation", "insurance"];
  for (const promo of sorted) {
    if (promo.promoType === "free_units") continue; // resolvida antes do bruto
    if (promo.promoType === "override_price") continue; // idem: resolvida antes do bruto
    if (applied.some((p) => p.id != null && p.id === promo.id)) continue;
    const ctxDaVez =
      ctxFaixa && ALVOS_DE_PRECO.includes(promo.appliesTo) ? ctxFaixa : ctx;
    if (!isPromotionApplicable(promo, ctxDaVez)) continue;

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
    } else if (promo.promoType === "waive_fee") {
      // Isencao: o desconto e a propria base — a taxa inteira. Com
      // appliesTo='specific_fee' isenta uma taxa; com 'fees', todas.
      amount = round2(base);
    } else {
      // Fora deste escopo: free_units e override_price (tratados antes do
      // bruto, em priceProduct) e free_product.
      continue;
    }

    // Teto por promocao.
    if (promo.maxDiscountAmount != null && amount > promo.maxDiscountAmount) {
      amount = round2(promo.maxDiscountAmount);
    }
    // Nenhum desconto pode passar da propria base: um fixed_off de 50 sobre uma
    // taxa de 20 viraria credito de 30 para o estudante.
    if (amount > base) amount = round2(base);

    if (amount <= 0) continue; // sem base valida (ex.: specific_*) nao gera linha

    discounts.push({
      name: promo.name,
      amount,
      appliesTo: promo.appliesTo,
      ...(promo.id ? { promotionId: promo.id } : {}),
      ...(promo.bookingUntil ? { validUntil: promo.bookingUntil } : {}),
    });
    applied.push(promo);
  }

  // TETO AGREGADO. O teto por promocao limita cada linha a sua propria base,
  // mas nada limitava a SOMA: duas isencoes empilhaveis sobre a mesma taxa, ou
  // dois percentuais de 60%, deixavam o liquido negativo em silencio.
  let total = sumMoney(discounts.map((d) => d.amount));
  if (total > bases.total && bases.total > 0) {
    const excedente = round2(total - bases.total);
    const ultima = discounts[discounts.length - 1];
    ultima.amount = round2(ultima.amount - excedente);
    if (ultima.amount <= 0) discounts.pop();
    total = sumMoney(discounts.map((d) => d.amount));
    warnings.push(
      `Descontos somavam mais que o valor da cotacao; o total foi limitado a ${bases.total}.`,
    );
  }
  return { discounts, totalDiscount: total, warnings };
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
// Ajuste sazonal de acomodacao — linha SEPARADA na cotacao
// ---------------------------------------------------------------------------

const MS_POR_DIA = 86400000;

/** Data ISO 'YYYY-MM-DD' -> dia absoluto (UTC), para aritmetica sem fuso. */
function toEpochDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_POR_DIA;
}

/** Dia absoluto -> data ISO 'YYYY-MM-DD'. */
function fromEpochDay(day: number): string {
  return new Date(day * MS_POR_DIA).toISOString().slice(0, 10);
}

/** Ultimo dia do mes (28/29 em fevereiro conforme o ano). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Dia absoluto de (ano, mes, dia) com o dia LIMITADO ao ultimo do mes: um
 * periodo publicado ate "29/fev" num ano nao bissexto vira 28/fev, sem quebrar.
 */
function clampedEpochDay(year: number, month: number, day: number): number {
  const safeDay = Math.min(day, lastDayOfMonth(year, month));
  return Date.UTC(year, month - 1, safeDay) / MS_POR_DIA;
}

/** (mes, dia) de `to` vem antes de `from`? Entao o periodo cruza a virada do ano. */
function crossesYearEnd(a: SeasonalAdjustment): boolean {
  return a.to.month < a.from.month || (a.to.month === a.from.month && a.to.day < a.from.day);
}

/**
 * Ocorrencias concretas [inicio, fim] (dias absolutos, fim INCLUSIVO) de um
 * ajuste que podem tocar a estadia.
 * - Sem ano em `from` e `to`: RECORRENTE; gera uma ocorrencia por ano candidato
 *   (do ano anterior ao inicio ate o ano seguinte ao fim da estadia), porque um
 *   periodo curto pode ser tocado DUAS vezes por uma estadia longa.
 * - Com ano em qualquer ponta: periodo FIXO, uma unica ocorrencia. O ano que
 *   faltar e inferido da outra ponta (+1 quando o periodo cruza o ano novo).
 */
function seasonalOccurrences(
  adjustment: SeasonalAdjustment,
  stayFirstNight: number,
  stayLastNight: number
): Array<{ start: number; end: number }> {
  const cross = crossesYearEnd(adjustment);
  const occurrences: Array<{ start: number; end: number }> = [];

  const buildFor = (fromYear: number, toYear: number) => {
    const start = clampedEpochDay(fromYear, adjustment.from.month, adjustment.from.day);
    const end = clampedEpochDay(toYear, adjustment.to.month, adjustment.to.day);
    if (end >= start) occurrences.push({ start, end });
  };

  if (adjustment.from.year != null || adjustment.to.year != null) {
    const fromYear = adjustment.from.year ?? (adjustment.to.year as number) - (cross ? 1 : 0);
    const toYear = adjustment.to.year ?? fromYear + (cross ? 1 : 0);
    buildFor(fromYear, toYear);
    return occurrences;
  }

  const firstYear = Number(fromEpochDay(stayFirstNight).slice(0, 4)) - 1;
  const lastYear = Number(fromEpochDay(stayLastNight).slice(0, 4)) + 1;
  for (let y = firstYear; y <= lastYear; y++) {
    buildFor(y, cross ? y + 1 : y);
  }
  return occurrences;
}

/**
 * Aplica os ajustes de temporada sobre a estadia (secao 4.2: o ajuste compoe o
 * valor da acomodacao ANTES das promocoes, mas sai como LINHA SEPARADA na
 * cotacao — nunca embutido no valor da acomodacao).
 *
 * A estadia ocupa `weeks * 7` NOITES a partir de `startDate`: a noite de
 * startDate conta e a data de saida NAO.
 * - nightly:   amount = round2(amountPerWeek x noitesSobrepostas / 7).
 * - full_week: a estadia e dividida em blocos de 7 noites a partir de
 *   startDate; todo bloco com ao menos UMA noite dentro do periodo cobra a
 *   semana inteira (`weeksCharged` = blocos cobrados).
 *
 * Um ajuste que nao toca a estadia NAO gera linha. Varias ocorrencias do mesmo
 * ajuste viram UMA linha (noites somadas; `from`/`to` = primeira e ultima noite
 * efetivamente aplicadas). O total e a soma das linhas ja arredondadas.
 */
export function applySeasonalAdjustments(params: {
  startDate: string;
  weeks: number;
  adjustments: SeasonalAdjustment[];
  proration: SeasonalProration;
}): { lines: SeasonalLine[]; total: number } {
  const { startDate, weeks, adjustments, proration } = params;
  const nights = Math.round(weeks * 7);
  if (nights <= 0 || adjustments.length === 0) return { lines: [], total: 0 };

  const firstNight = toEpochDay(startDate);
  const lastNight = firstNight + nights - 1;
  const lines: SeasonalLine[] = [];

  for (const adjustment of adjustments) {
    let overlappingNights = 0;
    let firstApplied: number | null = null;
    let lastApplied: number | null = null;
    // Blocos de 7 noites (indice do bloco) tocados pelo ajuste, sem repetir
    // quando duas ocorrencias caem no mesmo bloco.
    const chargedBlocks = new Set<number>();

    for (const occ of seasonalOccurrences(adjustment, firstNight, lastNight)) {
      const start = Math.max(occ.start, firstNight);
      const end = Math.min(occ.end, lastNight);
      if (end < start) continue; // ocorrencia fora da estadia

      overlappingNights += end - start + 1;
      if (firstApplied === null || start < firstApplied) firstApplied = start;
      if (lastApplied === null || end > lastApplied) lastApplied = end;

      const firstBlock = Math.floor((start - firstNight) / 7);
      const lastBlock = Math.floor((end - firstNight) / 7);
      for (let b = firstBlock; b <= lastBlock; b++) chargedBlocks.add(b);
    }

    if (overlappingNights === 0 || firstApplied === null || lastApplied === null) {
      continue; // ajuste nao toca a estadia: sem linha
    }

    const weeksCharged = chargedBlocks.size;
    // full_week arredonda a semana inteira PARA CIMA. Isso so pode favorecer a
    // escola num SUPLEMENTO; num desconto de baixa temporada devolveria ao aluno
    // mais do que a escola concede (uma noite tocada viraria semana cheia de
    // desconto). Valor negativo, portanto, e sempre proporcional as noites.
    const porSemanaCheia = proration === "full_week" && adjustment.amountPerWeek > 0;
    const amount = porSemanaCheia
      ? round2(adjustment.amountPerWeek * weeksCharged)
      : round2((adjustment.amountPerWeek * overlappingNights) / 7);

    lines.push({
      name: adjustment.name,
      amount,
      nights: overlappingNights,
      ...(porSemanaCheia ? { weeksCharged } : {}),
      from: fromEpochDay(firstApplied),
      to: fromEpochDay(lastApplied),
    });
  }

  return { lines, total: sumMoney(lines.map((l) => l.amount)) };
}

// ---------------------------------------------------------------------------
// Orquestracao de topo — secao 4.1/4.2
// ---------------------------------------------------------------------------

/**
 * Precifica um item de cotacao (secao 4.1) seguindo a sequencia da secao 4.2:
 * disponibilidade -> bruto (override_price, ou com/sem unidades gratuitas
 * respeitando a transicao de template) -> taxas -> promocoes ->
 * medias/arredondamento -> conversao.
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
    context,
  } = request;
  const chargeInTiers = request.chargeInTiers ?? false;
  const currency = product.currency;
  const warnings: string[] = [];
  // override_price (tabela de preco promocional paralela) vence qualquer outra
  // trilha de bruto: se aplica, nem unidades gratuitas nem transicao de
  // template entram em jogo para este item (ver escolherPrecoPromocional).
  const escolhaOverride = escolherPrecoPromocional(promotions, context);
  // `request.freeUnits` explicito continua vencendo sobre a tabela de
  // promocoes (usado por testes e pelo preview); mas nada disso importa quando
  // ha override_price aplicavel.
  const escolhaGratis = escolhaOverride || request.freeUnits
    ? undefined
    : escolherUnidadesGratuitas(promotions, context, {
        // Sem kind conhecido, so promocao de alvo 'total' passa — falha fechada:
        // nao da semanas gratis por engano num produto que nao sabemos o que e.
        kind: product.kind ?? "",
        quantity,
        warnings,
      });
  const freeUnits = escolhaOverride
    ? undefined
    : request.freeUnits ?? escolhaGratis?.freeUnits;

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

  // 2) Bruto. Tres trilhas: override_price, unidades gratuitas ou transicao
  // de template — nesta ordem de precedencia.
  let billableQuantity: number;
  let deliveredQuantity: number;
  let grossAmount: number;
  let breakdown: unknown;
  // Desconto ja embutido em applyFreeUnits (semantica discount_on_booked).
  const freeUnitsDiscounts: DiscountLine[] = [];

  if (escolhaOverride) {
    // override_price: o preco unitario da PROMOCAO substitui o do template por
    // completo. Nao ha faixa progressiva nem transicao — o valor bruto e
    // simplesmente value x quantidade contratada.
    billableQuantity = quantity;
    deliveredQuantity = quantity;
    grossAmount = round2((escolhaOverride.value ?? 0) * quantity);
    breakdown = { source: "override_price", promotionId: escolhaOverride.id };

    // Sanidade: override_price nao tem moeda propria nem teto relativo a base
    // (ele SUBSTITUI o bruto, nao desconta dele) — um valor cadastrado na
    // moeda errada ou com ordem de grandeza errada (ex.: centavos em vez de
    // unidade) produziria um preco absurdo em silencio. Compara contra o
    // preco tiered regular da MESMA quantidade so para este alerta; se o
    // calculo regular falhar (buraco de cobertura), a comparacao e pulada —
    // isto e so um alarme, nunca pode virar um bloqueio novo.
    try {
      const regular = calcWithTransition({
        startDate,
        weeks: quantity,
        templates,
        strategy: transitionRule,
        chargeInTiers,
        bookingDate: request.bookingDate,
      });
      if (regular.amount > 0) {
        const razao = grossAmount / regular.amount;
        if (razao < 0.15 || razao > 4) {
          warnings.push(
            `Preco promocional (${grossAmount} ${currency}) muito diferente do preco regular para a mesma quantidade (${regular.amount} ${currency}) — confira moeda e valor cadastrados na promocao "${escolhaOverride.name}".`,
          );
        }
      }
    } catch {
      // Sem cobertura de template para comparar — nao e o problema desta
      // promocao, e o aviso de bloqueio correspondente so aparece na trilha
      // normal (quando NAO ha override_price aplicavel).
    }
  } else if (freeUnits) {
    // Faixa/bruto pela quantidade contratada, usando o template vigente no inicio.
    const idx = templateIndexAt(templates, startDate);
    // Esta trilha NAO faz transicao de template. Era caminho morto (ninguem
    // preenchia freeUnits); virou o caminho normal de toda promocao de semanas
    // gratis — que sao as reservas longas, as que mais atravessam virada de
    // tabela. Avisa em vez de cobrar tudo pela tabela velha em silencio.
    if (unit === "week" && templates.length > 1) {
      const idxFim = templateIndexAt(templates, addDays(startDate, quantity * 7));
      if (idxFim !== idx) {
        warnings.push(
          "Periodo atravessa troca de tabela de preco, mas a promocao de unidades gratuitas cobra tudo pela tabela do inicio.",
        );
      }
    }
    const templateEscolhido = idx >= 0 ? templates[idx] : templates[0];
    const tiers = templateEscolhido?.tiers ?? [];
    const fu = applyFreeUnits({
      tiers,
      bookedQuantity: quantity,
      freeUnits: freeUnits.units,
      semantics: freeUnits.semantics,
      chargeInTiers,
      tierQuantity: freeUnits.tierQuantity,
      priceBasis: templateEscolhido?.priceBasis,
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
    if (fu.warning) {
      warnings.push(fu.warning);
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

  // 4b) Ajuste sazonal da acomodacao. Sai como LINHA SEPARADA (decisao do
  // negocio: nunca embutido no valor da acomodacao) e entra no liquido pela
  // soma ALGEBRICA (suplemento aumenta, baixa temporada reduz). So faz sentido
  // em estadias contadas em semanas; a estadia usa a quantidade ENTREGUE
  // (deliveredQuantity), que e o periodo realmente ocupado.
  const seasonalAdjustments = request.seasonalAdjustments ?? [];
  const seasonalResult =
    seasonalAdjustments.length > 0 && unit === "week"
      ? applySeasonalAdjustments({
          startDate,
          weeks: deliveredQuantity,
          adjustments: seasonalAdjustments,
          proration: request.seasonalProration ?? "nightly",
        })
      : { lines: [] as SeasonalLine[], total: 0 };

  // 5) Promocoes.
  // DECISAO (ver docs/decisions.md, ADR "Ajuste sazonal e base de promocoes"):
  // o ajuste sazonal compoe o valor da ACOMODACAO antes das promocoes, entao
  // entra em bases.accommodation e em bases.total — mas NUNCA em bases.tuition,
  // que e curso. Assim uma promocao sobre acomodacao incide sobre o valor com
  // temporada, e uma promocao sobre curso ignora a temporada.
  const ehAcomodacao = product.kind === "accommodation";
  // As unidades gratuitas ja abateram parte do bruto (semantica
  // discount_on_booked). A promocao percentual precisa incidir sobre o que
  // SOBROU, nao sobre o bruto cheio: "24 semanas pagando 20, com 52% de
  // desconto" tem que dar 20 semanas a 52% — cobrando os dois sobre o bruto de
  // 24 o desconto vira quase 70% e a agencia paga a diferenca.
  const brutoAposGratis = round2(
    grossAmount - sumMoney(freeUnitsDiscounts.map((d) => d.amount)),
  );
  const bases: PromoBases = {
    tuition: brutoAposGratis,
    // Base de acomodacao = bruto do proprio item (quando ele E acomodacao) + o
    // sazonal. So o sazonal, como estava, fazia uma promocao "sobre acomodacao"
    // incidir apenas sobre o suplemento — um desconto de poucos euros, enganoso.
    accommodation: ehAcomodacao ? round2(brutoAposGratis + seasonalResult.total) : seasonalResult.total,
    insurance: 0,
    fees: feesResult.total,
    // A linha FUNDIDA (matricula multi-curso) responde por todos os ids que ela
    // absorveu, com o valor da linha — senao a isencao de matricula sumiria
    // justamente na cotacao de dois cursos.
    feeAmountById: Object.fromEntries(
      feesResult.fees.flatMap((l) =>
        (l.feeId != null ? [l.feeId] : (l.mergedFeeIds ?? [])).map((id) => [id, l.amount] as const),
      ),
    ),
    total: round2(brutoAposGratis + feesResult.total + seasonalResult.total),
  };
  const promoResult = applyPromotions(
    promotions,
    bases,
    context,
    // A promocao ja resolvida (override_price OU free_units, nunca as duas)
    // entra como "ja aplicada": bloqueia reconsideracao dela mesma no loop e
    // impede outra promocao nao-empilhavel de incidir sobre um valor que ja E
    // promocional.
    escolhaOverride ? [escolhaOverride] : escolhaGratis ? [escolhaGratis.promo] : [],
    freeUnits?.tierQuantity != null
      ? { ...context, billableQuantity: freeUnits.tierQuantity }
      : undefined,
  );
  warnings.push(...promoResult.warnings);
  // Descontos de unidades gratuitas somam aos descontos de promocao.
  const discounts: DiscountLine[] = [...freeUnitsDiscounts, ...promoResult.discounts];
  const totalDiscounts = sumMoney(discounts.map((d) => d.amount));

  // 6) Media por unidade cobravel (secao 14.1: media ANTES do desconto).
  const avgUnitPrice = averageUnitPrice(grossAmount, billableQuantity);

  // Cadastro errado (desconto de temporada maior que a diaria) zeraria ou
  // inverteria o item: avisa em vez de emitir um orcamento negativo em silencio.
  if (seasonalResult.total < 0 && Math.abs(seasonalResult.total) > grossAmount) {
    warnings.push(
      `Warning bloqueante: desconto de temporada (${Math.abs(seasonalResult.total)}) maior que o valor da acomodacao (${grossAmount}).`
    );
  }

  // 7) Liquido = bruto + taxas + sazonal (algebrico) - descontos.
  const netAmount = round2(
    grossAmount + feesResult.total + seasonalResult.total - totalDiscounts
  );

  const result: PricedItem = {
    billableQuantity,
    deliveredQuantity,
    endDate,
    grossAmount,
    averageUnitPrice: avgUnitPrice,
    currency,
    fees: feesResult.fees,
    discounts,
    // Sem ajuste sazonal o campo nem aparece (item identico ao de antes).
    ...(seasonalResult.lines.length > 0 ? { seasonal: seasonalResult.lines } : {}),
    netAmount,
    breakdown: {
      ...(breakdown as object),
      fees: feesResult.fees,
      discounts,
      ...(seasonalResult.lines.length > 0
        ? { seasonal: seasonalResult.lines, seasonalTotal: seasonalResult.total }
        : {}),
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
