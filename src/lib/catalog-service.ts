// Loaders de banco + servicos de catalogo/preco (Marco 4, fatia "a").
//
// NB: modulo SERVER-ONLY. Usa a service role do Supabase (as rotas criam o
// cliente com createClient(url, SUPABASE_SERVICE_ROLE_KEY) e o passam como
// argumento). NUNCA importe este arquivo em codigo client.
//
// REGRAS (ver CLAUDE.md e ADR-001):
// - A regra de negocio de PRECO pertence a src/lib/pricing.ts (motor puro) e a
//   resolucao de mercado/elegibilidade a src/lib/catalog.ts. Este arquivo apenas
//   CARREGA do banco e MONTA a entrada do motor; nao reimplementa calculo.
// - Identificadores/tipos/colunas em INGLES; comentarios/erros em portugues.
// - Nada de PII em console.log; segredo nunca no cliente.
// - As funcoes recebem o cliente supabase como argumento; nao criam cliente.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  priceProduct,
  type PriceRequest,
  type PricedItem,
  type Template,
  type Fee,
  type Promotion,
  type PromotionTarget,
  type TransitionStrategy,
  type PromoContext,
} from "@/lib/pricing";
import {
  resolveMarket,
  evaluateEligibility,
  type Market,
  type EligibilityRule,
  type StudentContext,
} from "@/lib/catalog";

// ---------------------------------------------------------------------------
// Utilitarios internos
// ---------------------------------------------------------------------------

/** Converte valor numerico do PostgREST (numeric chega como string) em number. */
function toNum(v: unknown): number {
  return v == null ? 0 : Number(v);
}

/** Idem, preservando null/undefined (para colunas opcionais). */
function toNumOrUndef(v: unknown): number | undefined {
  return v == null ? undefined : Number(v);
}

/**
 * Valida que a string e uma data 'YYYY-MM-DD'. CRITICO: startDate/quoteDate sao
 * interpolados em filtros .or() do PostgREST (ex.: valid_until.gte.<startDate>);
 * sem esta checagem, um valor com virgula/operador injetaria condicoes no filtro
 * (nao cruza tenant — tenant_id e .eq separado — mas poderia alargar a vigencia).
 */
function assertDataISO(v: string, campo: string): void {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${campo} invalida (esperado YYYY-MM-DD).`);
  }
}

/** Soma dias a uma data ISO 'YYYY-MM-DD' em UTC (evita deslocamento de fuso). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// loadPricingInputs — carrega tudo e monta o PriceRequest do motor de preco
// ---------------------------------------------------------------------------

export type LoadPricingArgs = {
  tenantId: string;
  productId: string;
  startDate: string; // 'YYYY-MM-DD'
  quantity: number;
  unit: string;
  quoteDate: string; // 'YYYY-MM-DD' (data de emissao/reserva, para promocoes)
  nationalityCode?: string;
  /** Sobrepoe o charge_in_tiers derivado do template quando informado. */
  chargeInTiers?: boolean;
};

/**
 * Carrega do banco (produto, campus, templates de preco vigentes, taxas,
 * promocoes, regra de transicao) e monta o PriceRequest puro para o motor.
 *
 * Selecao de template (spec 3.6): status='active', vigencia candidata ao periodo
 * [startDate, endDate], e market_id = mercado resolvido OU nulo — preferindo os
 * com market_id preenchido. A moeda de origem vem do template escolhido; na
 * ausencia, de campus.base_currency.
 */
export async function loadPricingInputs(
  supabase: SupabaseClient,
  args: LoadPricingArgs,
): Promise<PriceRequest> {
  const { tenantId, productId, startDate, quantity, unit, quoteDate } = args;

  // Blindagem contra injecao de filtro PostgREST (datas entram em .or()).
  assertDataISO(startDate, "startDate");
  assertDataISO(quoteDate, "quoteDate");

  // 1) Produto -------------------------------------------------------------
  const { data: product, error: prodErr } = await supabase
    .from("product")
    .select(
      "id, kind, campus_id, name, min_duration, max_duration, available_from, available_until, default_unit, status, visibility",
    )
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .maybeSingle();
  if (prodErr) throw new Error(`Falha ao carregar produto: ${prodErr.message}`);
  if (!product) throw new Error("Produto nao encontrado para este tenant.");

  // 2) Campus + configuracoes ---------------------------------------------
  const { data: campus, error: campusErr } = await supabase
    .from("campus")
    .select("id, supplier_id, base_currency")
    .eq("tenant_id", tenantId)
    .eq("id", product.campus_id)
    .maybeSingle();
  if (campusErr) throw new Error(`Falha ao carregar campus: ${campusErr.message}`);
  if (!campus) throw new Error("Campus do produto nao encontrado.");

  const { data: campusSettings } = await supabase
    .from("campus_settings")
    .select("multi_course_fee_rule")
    .eq("campus_id", campus.id)
    .maybeSingle();
  const multiCourseRule =
    (campusSettings?.multi_course_fee_rule as
      | "charge_highest"
      | "charge_lowest"
      | "charge_all"
      | undefined) ?? "charge_highest";

  // 3) Mercado resolvido pela nacionalidade (spec 3.3) --------------------
  const { data: marketRows } = await supabase
    .from("market")
    .select("id, name, country_codes, is_default")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);
  const markets: Market[] = (marketRows ?? []).map((m: any) => ({
    id: m.id,
    name: m.name,
    countryCodes: m.country_codes ?? [],
    isDefault: m.is_default ?? false,
  }));
  const market = resolveMarket(args.nationalityCode, markets);
  const marketId = market?.id;

  // 4) Templates de preco vigentes ----------------------------------------
  // endDate candidato: startDate + quantity semanas (unit 'week'); senao startDate.
  const endDate = unit === "week" ? addDays(startDate, quantity * 7) : startDate;

  const { data: ptp } = await supabase
    .from("price_template_product")
    .select("price_template_id")
    .eq("product_id", productId);
  const templateIds = (ptp ?? []).map((r: any) => r.price_template_id);

  let templates: Template[] = [];
  let sourceCurrency = campus.base_currency as string;
  let derivedChargeInTiers = false;

  if (templateIds.length > 0) {
    let q = supabase
      .from("price_template")
      .select(
        "id, name, currency, charge_in_tiers, market_id, valid_from, valid_until, status, price_tier(min_quantity, unit_price, sort)",
      )
      .eq("tenant_id", tenantId)
      .in("id", templateIds)
      .eq("status", "active")
      .is("archived_at", null)
      // Vigencia candidata: comeca ate o fim do periodo e nao terminou antes do inicio.
      .lte("valid_from", endDate)
      .or(`valid_until.is.null,valid_until.gte.${startDate}`);
    // market_id = mercado resolvido OU nulo.
    q = marketId
      ? q.or(`market_id.is.null,market_id.eq.${marketId}`)
      : q.is("market_id", null);

    const { data: tplRows, error: tplErr } = await q;
    if (tplErr) throw new Error(`Falha ao carregar tabelas de preco: ${tplErr.message}`);

    const rows = tplRows ?? [];
    // Prefere os templates com market_id preenchido (mais especificos).
    const withMarket = rows.filter((r: any) => r.market_id != null);
    const chosen = withMarket.length > 0 ? withMarket : rows;

    templates = chosen.map((r: any) => ({
      name: r.name,
      tiers: (r.price_tier ?? [])
        .map((t: any) => ({
          minQuantity: toNum(t.min_quantity),
          unitPrice: toNum(t.unit_price),
        }))
        .sort((a: any, b: any) => a.minQuantity - b.minQuantity),
      validFrom: r.valid_from ?? null,
      validUntil: r.valid_until ?? null,
    }));

    if (chosen.length > 0) {
      sourceCurrency = (chosen[0].currency as string) ?? sourceCurrency;
      derivedChargeInTiers = Boolean(chosen[0].charge_in_tiers);
    }
  }

  const chargeInTiers = args.chargeInTiers ?? derivedChargeInTiers;

  // 5) Taxas do campus aplicaveis ao kind (ou vinculadas ao produto) ------
  // Escopo v1: apenas taxas com `amount` fixo. Taxas com price_template_id
  // (valor derivado de tabela) ficam FORA deste escopo — comentado a proposito.
  const { data: feesByKind } = await supabase
    .from("fee")
    .select(
      "id, name, fee_type, charge_basis, amount, currency, is_refundable, price_template_id, applies_to_kinds, valid_from, valid_until, archived_at",
    )
    .eq("tenant_id", tenantId)
    .eq("campus_id", campus.id)
    .is("archived_at", null)
    .contains("applies_to_kinds", [product.kind]);

  const { data: feeProductLinks } = await supabase
    .from("fee_product")
    .select("fee_id")
    .eq("product_id", productId);
  const linkedFeeIds = (feeProductLinks ?? []).map((r: any) => r.fee_id);
  let feesByProduct: any[] = [];
  if (linkedFeeIds.length > 0) {
    const { data } = await supabase
      .from("fee")
      .select(
        "id, name, fee_type, charge_basis, amount, currency, is_refundable, price_template_id, applies_to_kinds, valid_from, valid_until, archived_at",
      )
      .eq("tenant_id", tenantId)
      .in("id", linkedFeeIds)
      .is("archived_at", null);
    feesByProduct = data ?? [];
  }

  // Une por id (dedupe), mantem so as com amount fixo e vigentes na data.
  const feeById = new Map<string, any>();
  for (const f of [...(feesByKind ?? []), ...feesByProduct]) feeById.set(f.id, f);
  const fees: Fee[] = [];
  for (const f of feeById.values()) {
    if (f.amount == null) continue; // fora do escopo v1 (price_template_id)
    if (f.valid_from != null && startDate < f.valid_from) continue;
    if (f.valid_until != null && startDate > f.valid_until) continue;
    fees.push({
      name: f.name,
      feeType: f.fee_type,
      chargeBasis: f.charge_basis,
      amount: toNum(f.amount),
      currency: (f.currency as string) ?? sourceCurrency,
      isRefundable: f.is_refundable ?? undefined,
    });
  }

  // 6) Promocoes ativas do fornecedor do campus ---------------------------
  const { data: promoRows } = await supabase
    .from("promotion")
    .select(
      "id, name, promo_type, value, applies_to, applies_to_ref_id, min_quantity, max_discount_amount, is_stackable, priority, booking_from, booking_until, travel_from, travel_until, status, campus_id",
    )
    .eq("tenant_id", tenantId)
    .eq("supplier_id", campus.supplier_id)
    .eq("status", "active")
    .is("archived_at", null)
    .or(`campus_id.is.null,campus_id.eq.${campus.id}`);

  const promoIds = (promoRows ?? []).map((p: any) => p.id);
  const targetsByPromo = new Map<string, PromotionTarget[]>();
  if (promoIds.length > 0) {
    const { data: targetRows } = await supabase
      .from("promotion_target")
      .select("promotion_id, dimension, value")
      .in("promotion_id", promoIds);
    for (const t of targetRows ?? []) {
      const list = targetsByPromo.get(t.promotion_id) ?? [];
      list.push({ dimension: t.dimension, value: t.value });
      targetsByPromo.set(t.promotion_id, list);
    }
  }
  const promotions: Promotion[] = (promoRows ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    promoType: p.promo_type,
    value: toNumOrUndef(p.value),
    appliesTo: p.applies_to,
    appliesToRefId: p.applies_to_ref_id ?? undefined,
    minQuantity: p.min_quantity ?? undefined,
    maxDiscountAmount: toNumOrUndef(p.max_discount_amount),
    isStackable: Boolean(p.is_stackable),
    priority: p.priority ?? 100,
    status: p.status,
    bookingFrom: p.booking_from ?? undefined,
    bookingUntil: p.booking_until ?? undefined,
    travelFrom: p.travel_from ?? undefined,
    travelUntil: p.travel_until ?? undefined,
    targets: targetsByPromo.get(p.id) ?? [],
  }));

  // 7) Regra de transicao (campus -> tenant -> split_by_period) -----------
  const { data: transitionRows } = await supabase
    .from("price_transition_rule")
    .select("strategy, campus_id, applies_to_kind")
    .eq("tenant_id", tenantId)
    .or(`campus_id.is.null,campus_id.eq.${campus.id}`);
  const rules = transitionRows ?? [];
  const pickRule =
    rules.find(
      (r: any) =>
        r.campus_id === campus.id &&
        (r.applies_to_kind == null || r.applies_to_kind === product.kind),
    ) ??
    rules.find(
      (r: any) =>
        r.campus_id == null &&
        (r.applies_to_kind == null || r.applies_to_kind === product.kind),
    );
  const transitionRule: TransitionStrategy =
    (pickRule?.strategy as TransitionStrategy) ?? "split_by_period";

  // 8) educationType do contexto (so programas) ---------------------------
  let educationType: string | undefined;
  if (product.kind === "program") {
    const { data: pd } = await supabase
      .from("program_detail")
      .select("education_type")
      .eq("product_id", productId)
      .maybeSingle();
    educationType = pd?.education_type ?? undefined;
  }

  // 9) Monta o PriceRequest ------------------------------------------------
  const context: PromoContext = {
    quoteDate,
    startDate,
    billableQuantity: quantity,
    marketId,
    nationalityCode: args.nationalityCode,
    campusId: campus.id,
    productId,
    educationType,
  };

  const request: PriceRequest = {
    product: {
      currency: sourceCurrency,
      kind: product.kind,
      minDuration: product.min_duration ?? undefined,
      maxDuration: product.max_duration ?? undefined,
      availableFrom: product.available_from ?? undefined,
      availableUntil: product.available_until ?? undefined,
    },
    startDate,
    quantity,
    unit,
    templates,
    transitionRule,
    chargeInTiers,
    fees,
    feeContext: { multiCourseRule },
    promotions,
    context,
  };

  return request;
}

// ---------------------------------------------------------------------------
// priceProductFromDb — carrega + precifica + anexa avisos de elegibilidade
// ---------------------------------------------------------------------------

export type PriceProductArgs = LoadPricingArgs & {
  /** Contexto do estudante para avaliar elegibilidade (spec 3.5). */
  studentContext?: StudentContext;
};

/**
 * Carrega os insumos, chama o motor de preco puro e concatena aos warnings do
 * item os avisos de elegibilidade (evaluateEligibility sobre eligibility_rule).
 */
export async function priceProductFromDb(
  supabase: SupabaseClient,
  args: PriceProductArgs,
): Promise<PricedItem> {
  const request = await loadPricingInputs(supabase, args);
  const priced = priceProduct(request);

  // Elegibilidade (spec 3.5): carrega regras do produto e avalia o contexto.
  const { data: ruleRows } = await supabase
    .from("eligibility_rule")
    .select("group_index, attribute, operator, value, is_blocking")
    .eq("tenant_id", args.tenantId)
    .eq("product_id", args.productId);

  const rules: EligibilityRule[] = (ruleRows ?? []).map((r: any) => ({
    groupIndex: r.group_index ?? 0,
    attribute: r.attribute,
    operator: r.operator,
    value: r.value,
    isBlocking: r.is_blocking ?? false,
  }));

  if (rules.length > 0) {
    const context: StudentContext = {
      nationalityCode: args.nationalityCode,
      ...(args.studentContext ?? {}),
    };
    const elig = evaluateEligibility(rules, context, args.startDate);
    if (!elig.eligible) {
      const grupos = elig.failedGroups.join(", ");
      if (elig.blocking) {
        priced.warnings.push(
          `Warning bloqueante: estudante nao elegivel para este produto (grupos: ${grupos}).`,
        );
      } else {
        priced.warnings.push(
          `Estudante pode nao ser elegivel para este produto (grupos: ${grupos}).`,
        );
      }
    }
  }

  return priced;
}

// ---------------------------------------------------------------------------
// searchProducts — busca contextual no catalogo interno
// ---------------------------------------------------------------------------

export type SearchProductsFilters = {
  tenantId: string;
  campusIds?: string[];
  kinds?: string[];
  keyword?: string;
  limit?: number;
  offset?: number;
};

export type ProductSummary = {
  id: string;
  name: string;
  kind: string;
  campusId: string;
  visibility: string;
};

/**
 * Lista produtos cotaveis/vendaveis e ativos do tenant, com filtros opcionais
 * por campus, kind e palavra-chave (ilike no nome) e paginacao simples.
 *
 * TODO: preco calculado por item na listagem (exige contexto do estudante e
 * chamada ao motor por linha) fica para uma fatia seguinte deste marco.
 */
export async function searchProducts(
  supabase: SupabaseClient,
  filters: SearchProductsFilters,
): Promise<ProductSummary[]> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  let q = supabase
    .from("product")
    .select("id, name, kind, campus_id, visibility")
    .eq("tenant_id", filters.tenantId)
    .eq("status", "active")
    .in("visibility", ["quotable", "sellable"])
    .is("archived_at", null);

  if (filters.campusIds && filters.campusIds.length > 0) {
    q = q.in("campus_id", filters.campusIds);
  }
  if (filters.kinds && filters.kinds.length > 0) {
    q = q.in("kind", filters.kinds);
  }
  if (filters.keyword && filters.keyword.trim() !== "") {
    q = q.ilike("name", `%${filters.keyword.trim()}%`);
  }

  q = q.order("name", { ascending: true }).range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) throw new Error(`Falha ao buscar produtos: ${error.message}`);

  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    campusId: p.campus_id,
    visibility: p.visibility,
  }));
}
