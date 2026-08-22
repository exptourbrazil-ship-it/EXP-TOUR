// Servicos de cotacao (Marco 4, fatia "a"): criacao de cotacao, opcoes, itens,
// descontos manuais, plano de pagamento e recalculo.
//
// NB: modulo SERVER-ONLY. Usa a service role do Supabase (as rotas criam o
// cliente e o passam como argumento). NUNCA importe este arquivo em client.
//
// REGRAS (ver CLAUDE.md e ADR-001):
// - Identificadores/tabelas/colunas em INGLES; comentarios/erros em portugues.
// - Toda MUTACAO grava trilha de auditoria (registrarAuditoriaAdmin). Desconto
//   manual exige `reason` e registra o autor.
// - Preco/snapshot: o item guarda product_snapshot e price_breakdown para que a
//   cotacao emitida nao mude de valor depois. Calculo via priceProductFromDb
//   (que usa o motor puro src/lib/pricing) — nao reimplementar aqui.
//
// TRANSACOES: o supabase-js nao faz transacao multi-statement no cliente. Os
// inserts sao sequenciais; em falha no meio faz-se limpeza best-effort.
// TODO: mover os fluxos multi-tabela para RPC/funcao Postgres para atomicidade.
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/pricing";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { priceProductFromDb } from "@/lib/catalog-service";

/** Autor da acao (para a trilha de auditoria). */
export type ServiceActor = { usuario: string; ip?: string | null };

/** Data de hoje no fuso do Brasil, 'YYYY-MM-DD' (negocio brasileiro, servidor UTC). */
function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
}

function toNum(v: unknown): number {
  return v == null ? 0 : Number(v);
}

// ---------------------------------------------------------------------------
// createStudent (quick-create minimo para cotar; spec 3.7)
// ---------------------------------------------------------------------------

export type CreateStudentArgs = {
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string;
  nationalityCode?: string;
  birthDate?: string; // 'YYYY-MM-DD'
};

/**
 * Cria um estudante minimo (status 'lead') para viabilizar a cotacao. Nao e a
 * ficha completa (spec 3.7) — apenas o suficiente para cotar; a gestao de
 * estudante fica para uma fatia futura.
 */
export async function createStudent(
  supabase: SupabaseClient,
  args: CreateStudentArgs,
  actor: ServiceActor,
): Promise<{ studentId: string }> {
  const firstName = (args.firstName ?? "").trim();
  const lastName = (args.lastName ?? "").trim();
  if (!args.tenantId || !firstName || !lastName) {
    throw new Error("tenantId, firstName e lastName sao obrigatorios.");
  }

  const { data: student, error } = await supabase
    .from("student")
    .insert({
      tenant_id: args.tenantId,
      first_name: firstName,
      last_name: lastName,
      email: args.email?.trim() || null,
      nationality_code: args.nationalityCode?.trim().toUpperCase() || null,
      birth_date: args.birthDate || null,
      status: "lead",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar estudante: ${error.message}`);
  const studentId = student.id as string;

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "student.created",
    alvo: studentId,
    // Sem PII sensivel no detalhe: so a nacionalidade (dado nao identificante).
    detalhe: { nationalityCode: args.nationalityCode ?? null },
    ip: actor.ip ?? null,
  });

  return { studentId };
}

// ---------------------------------------------------------------------------
// createQuote
// ---------------------------------------------------------------------------

export type CreateQuoteArgs = {
  tenantId: string;
  studentId: string;
  ownerUserId: string;
  locale?: string;
  presentmentCurrency?: string;
};

/**
 * Cria uma cotacao em rascunho. A `reference` e sequencial por tenant dentro do
 * ano: `{ano}-{n}`, onde n = (quantidade de cotacoes do tenant com prefixo do
 * ano) + 1.
 *
 * TODO: o calculo de sequencia por contagem tem corrida sob concorrencia; mover
 * para RPC/funcao Postgres (sequence por tenant/ano) para atomicidade.
 */
export async function createQuote(
  supabase: SupabaseClient,
  args: CreateQuoteArgs,
  actor: ServiceActor,
): Promise<{ quoteId: string; reference: string }> {
  if (!args.tenantId || !args.studentId || !args.ownerUserId) {
    throw new Error("tenantId, studentId e ownerUserId sao obrigatorios.");
  }

  // Posse do estudante dentro do tenant: a cotacao nao pode apontar para um
  // estudante de outro tenant (hoje single-tenant, mas o join de PII em telas
  // usa service role sem filtro; a checagem fecha o vazamento antes que o tenant
  // passe a sair do contexto do usuario).
  const { data: student, error: stErr } = await supabase
    .from("student")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.studentId)
    .maybeSingle();
  if (stErr) throw new Error(`Falha ao verificar estudante: ${stErr.message}`);
  if (!student) throw new Error("Estudante nao encontrado para este tenant.");

  const year = Number(hojeBrasilISO().slice(0, 4));
  const { count, error: countErr } = await supabase
    .from("quote")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", args.tenantId)
    .like("reference", `${year}-%`);
  if (countErr) throw new Error(`Falha ao contar cotacoes: ${countErr.message}`);
  const reference = `${year}-${(count ?? 0) + 1}`;

  const { data: quote, error: insErr } = await supabase
    .from("quote")
    .insert({
      tenant_id: args.tenantId,
      reference,
      student_id: args.studentId,
      owner_user_id: args.ownerUserId,
      locale: args.locale ?? "pt-BR",
      presentment_currency: args.presentmentCurrency ?? "BRL",
      status: "draft",
      student_context: {},
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Falha ao criar cotacao: ${insErr.message}`);

  const quoteId = quote.id as string;

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.created",
    alvo: quoteId,
    detalhe: { reference, studentId: args.studentId },
    ip: actor.ip ?? null,
  });

  // Evento 'created' (kind valido no CHECK de quote_event).
  await supabase.from("quote_event").insert({
    tenant_id: args.tenantId,
    quote_id: quoteId,
    kind: "created",
    actor_type: "user",
    actor_user_id: args.ownerUserId,
  });

  return { quoteId, reference };
}

// ---------------------------------------------------------------------------
// addQuoteOption
// ---------------------------------------------------------------------------

export type AddQuoteOptionArgs = {
  tenantId: string;
  quoteId: string;
  label?: string;
  copyFromOptionId?: string;
  /** Teto (%) de desconto manual do ator; usado ao herdar descontos na copia. */
  tetoPercent?: number;
  /** Ator pode manter descontos manuais acima do teto (gestor). */
  permitirOverride?: boolean;
};

/**
 * Regra pura (testavel): um desconto MANUAL da opcao de origem so pode ser
 * herdado numa duplicacao se o ator conseguiria recria-lo. Assim um consultor
 * nao herda, via "Duplicar", um override que so um gestor poderia conceder.
 *
 * - Descontos nao-manuais (promocoes) nunca passam por aqui (sempre copiados).
 * - Gestor (permitirOverride) herda qualquer manual.
 * - Nao-gestor herda apenas `percent` com value <= teto. `fixed`/`free_units`
 *   nao sao verificaveis sem a base aqui, entao sao descartados por seguranca.
 */
export function manualDiscountCopiavel(
  disc: { discount_type: string; value: number | string },
  opts: { tetoPercent?: number; permitirOverride?: boolean },
): boolean {
  if (opts.permitirOverride) return true;
  if (disc.discount_type !== "percent") return false;
  const teto = opts.tetoPercent;
  if (teto == null || !Number.isFinite(teto)) return false;
  return toNum(disc.value) <= teto;
}

/**
 * Adiciona uma opcao a uma cotacao. Com `copyFromOptionId`, duplica os itens da
 * opcao de origem (novos ids), incluindo as taxas (quote_item_fee) e os
 * descontos (quote_discount) de item e de opcao.
 *
 * NB: quote_event nao tem kind para "opcao adicionada" (CHECK restringe os
 * kinds), entao registra-se apenas a trilha de auditoria.
 */
export async function addQuoteOption(
  supabase: SupabaseClient,
  args: AddQuoteOptionArgs,
  actor: ServiceActor,
): Promise<{ optionId: string }> {
  // Valida posse: a cotacao pertence ao tenant.
  const { data: quote, error: qErr } = await supabase
    .from("quote")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId)
    .maybeSingle();
  if (qErr) throw new Error(`Falha ao carregar cotacao: ${qErr.message}`);
  if (!quote) throw new Error("Cotacao nao encontrada para este tenant.");

  // Posse da opcao de origem DENTRO da mesma cotacao: nao basta ser do tenant,
  // senao daria para copiar itens/descontos de outra cotacao do tenant.
  if (args.copyFromOptionId) {
    const { data: src, error: srcErr } = await supabase
      .from("quote_option")
      .select("id")
      .eq("tenant_id", args.tenantId)
      .eq("id", args.copyFromOptionId)
      .eq("quote_id", args.quoteId)
      .maybeSingle();
    if (srcErr) throw new Error(`Falha ao carregar opcao de origem: ${srcErr.message}`);
    if (!src) throw new Error("Opcao de origem nao pertence a esta cotacao.");
  }

  const { count } = await supabase
    .from("quote_option")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", args.quoteId);
  const sort = count ?? 0;
  const label = args.label ?? `Opcao ${sort + 1}`;

  const { data: option, error: insErr } = await supabase
    .from("quote_option")
    .insert({
      tenant_id: args.tenantId,
      quote_id: args.quoteId,
      label,
      sort,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Falha ao criar opcao: ${insErr.message}`);
  const optionId = option.id as string;

  let copia: CopySummary | null = null;
  if (args.copyFromOptionId) {
    copia = await copyOptionContents(supabase, args.tenantId, args.copyFromOptionId, optionId, {
      tetoPercent: args.tetoPercent,
      permitirOverride: args.permitirOverride,
    });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.option.added",
    alvo: optionId,
    detalhe: {
      quoteId: args.quoteId,
      copyFromOptionId: args.copyFromOptionId ?? null,
      // Trilha da herança de descontos manuais: quais foram copiados e quais
      // descartados por estarem acima do que o ator poderia recriar (teto/papel).
      manuaisCopiados: copia?.manuaisCopiados ?? [],
      manuaisDescartados: copia?.manuaisDescartados ?? [],
    },
    ip: actor.ip ?? null,
  });

  return { optionId };
}

type CopyOpts = { tetoPercent?: number; permitirOverride?: boolean };
type CopySummary = { manuaisCopiados: string[]; manuaisDescartados: string[] };

/**
 * Decide e insere a copia de um desconto da origem, aplicando a politica de
 * herança de descontos MANUAIS (ver `manualDiscountCopiavel`). Descontos
 * nao-manuais sempre passam. Retorna o id de origem em `copiados`/`descartados`
 * conforme o desfecho, para a trilha de auditoria.
 */
async function copiarDesconto(
  supabase: SupabaseClient,
  disc: any,
  targetOptionId: string,
  newItemId: string | null,
  opts: CopyOpts,
  sum: CopySummary,
): Promise<void> {
  const ehManual = disc.is_manual === true;
  if (ehManual && !manualDiscountCopiavel(disc, opts)) {
    sum.manuaisDescartados.push(disc.id as string);
    return; // nao herda: o ator nao poderia recriar este desconto.
  }
  const { id, created_at: dc, ...drest } = disc as any;
  await supabase.from("quote_discount").insert({
    ...drest,
    quote_option_id: targetOptionId,
    quote_item_id: newItemId,
  });
  if (ehManual) sum.manuaisCopiados.push(id as string);
}

/**
 * Duplica itens (+ taxas + descontos de item) e descontos de opcao da origem
 * para a nova opcao. Inserts sequenciais; sem atomicidade.
 * Descontos manuais so sao herdados se o ator conseguiria recria-los (teto/papel)
 * — o resto e descartado e registrado. TODO: mover para RPC para atomicidade.
 */
async function copyOptionContents(
  supabase: SupabaseClient,
  tenantId: string,
  sourceOptionId: string,
  targetOptionId: string,
  opts: CopyOpts,
): Promise<CopySummary> {
  const sum: CopySummary = { manuaisCopiados: [], manuaisDescartados: [] };
  const { data: items } = await supabase
    .from("quote_item")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("quote_option_id", sourceOptionId);

  for (const item of items ?? []) {
    const { id: oldItemId, created_at, updated_at, ...rest } = item as any;
    const { data: newItem, error } = await supabase
      .from("quote_item")
      .insert({ ...rest, quote_option_id: targetOptionId })
      .select("id")
      .single();
    if (error || !newItem) continue; // best-effort
    const newItemId = newItem.id as string;

    // Taxas do item.
    const { data: fees } = await supabase
      .from("quote_item_fee")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("quote_item_id", oldItemId);
    for (const fee of fees ?? []) {
      const { id, ...frest } = fee as any;
      await supabase
        .from("quote_item_fee")
        .insert({ ...frest, quote_item_id: newItemId });
    }

    // Descontos de item.
    const { data: itemDiscounts } = await supabase
      .from("quote_discount")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("quote_item_id", oldItemId);
    for (const disc of itemDiscounts ?? []) {
      await copiarDesconto(supabase, disc, targetOptionId, newItemId, opts, sum);
    }
  }

  // Descontos no nivel da opcao (sem item associado).
  const { data: optionDiscounts } = await supabase
    .from("quote_discount")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("quote_option_id", sourceOptionId)
    .is("quote_item_id", null);
  for (const disc of optionDiscounts ?? []) {
    await copiarDesconto(supabase, disc, targetOptionId, null, opts, sum);
  }

  return sum;
}

// ---------------------------------------------------------------------------
// addQuoteItem
// ---------------------------------------------------------------------------

export type AddQuoteItemArgs = {
  tenantId: string;
  optionId: string;
  productId: string;
  startDate: string;
  quantity: number;
  unit: string;
  quoteDate: string;
  nationalityCode?: string;
};

/**
 * Precifica um produto (via priceProductFromDb) e grava o item da cotacao com
 * snapshot congelado do produto, breakdown do calculo, taxas e descontos.
 * TODO: mover o conjunto item+taxas+descontos para RPC/funcao Postgres.
 */
export async function addQuoteItem(
  supabase: SupabaseClient,
  args: AddQuoteItemArgs,
  actor: ServiceActor,
): Promise<{ itemId: string; priced: Awaited<ReturnType<typeof priceProductFromDb>> }> {
  // Valida posse da opcao.
  const { data: option, error: optErr } = await supabase
    .from("quote_option")
    .select("id, quote_id")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.optionId)
    .maybeSingle();
  if (optErr) throw new Error(`Falha ao carregar opcao: ${optErr.message}`);
  if (!option) throw new Error("Opcao nao encontrada para este tenant.");

  // Precifica.
  const priced = await priceProductFromDb(supabase, {
    tenantId: args.tenantId,
    productId: args.productId,
    startDate: args.startDate,
    quantity: args.quantity,
    unit: args.unit,
    quoteDate: args.quoteDate,
    nationalityCode: args.nationalityCode,
  });

  // Snapshot congelado do produto (produto + conteudo multilingue).
  const { data: product, error: prodErr } = await supabase
    .from("product")
    .select("*")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.productId)
    .maybeSingle();
  if (prodErr) throw new Error(`Falha ao carregar produto: ${prodErr.message}`);
  if (!product) throw new Error("Produto nao encontrado para este tenant.");

  const { data: content } = await supabase
    .from("product_content")
    .select("*")
    .eq("product_id", args.productId);

  const productSnapshot = { ...product, content: content ?? [] };

  // Ordem do item na opcao.
  const { count } = await supabase
    .from("quote_item")
    .select("id", { count: "exact", head: true })
    .eq("quote_option_id", args.optionId);
  const sort = count ?? 0;

  const { data: item, error: itemErr } = await supabase
    .from("quote_item")
    .insert({
      tenant_id: args.tenantId,
      quote_option_id: args.optionId,
      group: product.kind,
      product_id: args.productId,
      campus_id: product.campus_id,
      product_snapshot: productSnapshot,
      start_date: args.startDate,
      end_date: priced.endDate,
      quantity: args.quantity,
      delivered_quantity: priced.deliveredQuantity,
      unit: args.unit,
      unit_price: priced.averageUnitPrice,
      gross_amount: priced.grossAmount,
      currency: priced.currency,
      price_breakdown: priced.breakdown,
      sort,
    })
    .select("id")
    .single();
  if (itemErr) throw new Error(`Falha ao gravar item: ${itemErr.message}`);
  const itemId = item.id as string;

  // Taxas do item (priced.fees). FeeLine nao carrega fee_id nem is_refundable,
  // entao fee_id fica nulo. TODO: propagar fee_id/is_refundable do motor.
  for (const fee of priced.fees) {
    await supabase.from("quote_item_fee").insert({
      tenant_id: args.tenantId,
      quote_item_id: itemId,
      fee_id: null,
      name: fee.name,
      amount: fee.amount,
      currency: fee.currency,
      is_refundable: null,
      basis: fee.basis,
    });
  }

  // Descontos (priced.discounts) — automaticos (is_manual=false). DiscountLine
  // traz apenas valor absoluto; discount_type='fixed'. TODO: propagar
  // promotion_id/discount_type do motor de preco.
  for (const disc of priced.discounts) {
    await supabase.from("quote_discount").insert({
      tenant_id: args.tenantId,
      quote_option_id: args.optionId,
      quote_item_id: itemId,
      promotion_id: null,
      name: disc.name,
      discount_type: "fixed",
      value: disc.amount,
      applies_to: disc.appliesTo,
      amount: disc.amount,
      currency: priced.currency,
      is_manual: false,
    });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.item.added",
    alvo: itemId,
    detalhe: {
      optionId: args.optionId,
      productId: args.productId,
      grossAmount: priced.grossAmount,
      currency: priced.currency,
    },
    ip: actor.ip ?? null,
  });

  return { itemId, priced };
}

// ---------------------------------------------------------------------------
// addManualDiscount
// ---------------------------------------------------------------------------

export type AddManualDiscountArgs = {
  tenantId: string;
  optionId: string;
  itemId?: string;
  type: "percent" | "fixed" | "free_units";
  value: number;
  appliesTo: string;
  reason: string;
  /** Teto (%) de desconto manual para papeis nao-gestor. Se ausente, sem teto. */
  tetoPercent?: number;
  /** Papel pode ultrapassar o teto (gestor). O override e sinalizado no retorno. */
  permitirOverride?: boolean;
};

/**
 * Erro tipado: o desconto manual equivale a mais que o teto permitido ao papel.
 * A rota traduz para 403 (`acima_do_teto`) — nao e erro interno.
 */
export class DescontoAcimaDoTeto extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DescontoAcimaDoTeto";
  }
}

/**
 * Grava um desconto MANUAL (is_manual=true). O `reason` e obrigatorio e vai para
 * a trilha de auditoria com o autor (spec 3.8 / 2.6). O valor absoluto e
 * derivado do tipo: `fixed` usa o proprio valor; `percent` incide sobre a base
 * (item, ou soma dos itens da opcao).
 */
export async function addManualDiscount(
  supabase: SupabaseClient,
  args: AddManualDiscountArgs,
  actor: ServiceActor,
): Promise<{ discountId: string; amount: number; overrideTeto: boolean }> {
  if (!args.reason || args.reason.trim() === "") {
    throw new Error("Motivo (reason) e obrigatorio para desconto manual.");
  }

  // Valida posse da opcao e resolve moeda/base.
  const { data: option, error: optErr } = await supabase
    .from("quote_option")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.optionId)
    .maybeSingle();
  if (optErr) throw new Error(`Falha ao carregar opcao: ${optErr.message}`);
  if (!option) throw new Error("Opcao nao encontrada para este tenant.");

  let base = 0;
  let currency = "BRL";
  if (args.itemId) {
    // Posse do item DENTRO da opcao: nao basta pertencer ao tenant, o item tem
    // de ser da propria opcao — senao a base viria de outra opcao/cotacao.
    const { data: item } = await supabase
      .from("quote_item")
      .select("gross_amount, currency")
      .eq("tenant_id", args.tenantId)
      .eq("id", args.itemId)
      .eq("quote_option_id", args.optionId)
      .maybeSingle();
    if (!item) throw new Error("Item nao encontrado nesta opcao.");
    base = toNum(item.gross_amount);
    currency = item.currency;
  } else {
    const { data: items } = await supabase
      .from("quote_item")
      .select("gross_amount, currency")
      .eq("tenant_id", args.tenantId)
      .eq("quote_option_id", args.optionId);
    for (const it of items ?? []) base += toNum(it.gross_amount);
    if (items && items.length > 0) currency = items[0].currency;
  }

  let amount: number;
  if (args.type === "percent") {
    amount = round2((base * args.value) / 100);
  } else if (args.type === "fixed") {
    amount = round2(args.value);
  } else {
    // free_units manual: valor absoluto nao e derivavel aqui.
    // TODO: calcular a partir do preco unitario do item quando aplicavel.
    amount = 0;
  }

  // Teto de desconto manual: qualquer tipo e convertido para % efetivo sobre a
  // base antes de comparar — assim `fixed` (e futuros tipos) nao burlam o limite
  // que hoje so pegaria `percent`. Fixo sem base positiva = ilimitado (bloqueia).
  const percentEfetivo =
    args.type === "percent"
      ? args.value
      : base > 0
        ? (amount / base) * 100
        : amount > 0
          ? Number.POSITIVE_INFINITY
          : 0;
  const excedeTeto =
    args.tetoPercent != null &&
    Number.isFinite(args.tetoPercent) &&
    percentEfetivo > args.tetoPercent;
  if (excedeTeto && !args.permitirOverride) {
    const pct = Number.isFinite(percentEfetivo)
      ? `${percentEfetivo.toFixed(1)}%`
      : "ilimitado";
    throw new DescontoAcimaDoTeto(
      `Desconto equivale a ${pct} da base (R$ ${base.toFixed(2)}), acima do teto de ${args.tetoPercent}% permitido ao seu papel.`,
    );
  }
  const overrideTeto = excedeTeto && !!args.permitirOverride;

  const { data: discount, error: insErr } = await supabase
    .from("quote_discount")
    .insert({
      tenant_id: args.tenantId,
      quote_option_id: args.optionId,
      quote_item_id: args.itemId ?? null,
      promotion_id: null,
      name: args.reason,
      discount_type: args.type,
      value: args.value,
      applies_to: args.appliesTo,
      amount,
      currency,
      is_manual: true,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Falha ao gravar desconto manual: ${insErr.message}`);

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.discount.manual",
    alvo: discount.id as string,
    detalhe: {
      optionId: args.optionId,
      itemId: args.itemId ?? null,
      type: args.type,
      value: args.value,
      appliesTo: args.appliesTo,
      amount,
      reason: args.reason,
    },
    ip: actor.ip ?? null,
  });

  return { discountId: discount.id as string, amount, overrideTeto };
}

// ---------------------------------------------------------------------------
// setPaymentPlan
// ---------------------------------------------------------------------------

export type PaymentInstallmentInput = {
  dueDate: string;
  amount: number;
  currency: string;
  description?: string;
};

export type SetPaymentPlanArgs = {
  tenantId: string;
  optionId: string;
  installments: PaymentInstallmentInput[];
  method?: "pix" | "boleto" | "card" | "bank_transfer" | "mixed";
};

/**
 * Define (upsert) o plano de pagamento de uma opcao e substitui suas parcelas.
 * TODO: mover plano+parcelas para RPC/funcao Postgres para atomicidade.
 */
export async function setPaymentPlan(
  supabase: SupabaseClient,
  args: SetPaymentPlanArgs,
  actor: ServiceActor,
): Promise<{ planId: string }> {
  if (!args.installments || args.installments.length === 0) {
    throw new Error("Informe ao menos uma parcela.");
  }

  // Valida posse da opcao.
  const { data: option, error: optErr } = await supabase
    .from("quote_option")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.optionId)
    .maybeSingle();
  if (optErr) throw new Error(`Falha ao carregar opcao: ${optErr.message}`);
  if (!option) throw new Error("Opcao nao encontrada para este tenant.");

  const firstDueDate = args.installments[0]?.dueDate ?? null;

  const { data: plan, error: planErr } = await supabase
    .from("quote_payment_plan")
    .upsert(
      {
        tenant_id: args.tenantId,
        quote_option_id: args.optionId,
        installments_count: args.installments.length,
        first_due_date: firstDueDate,
        method: args.method ?? null,
      },
      { onConflict: "quote_option_id" },
    )
    .select("id")
    .single();
  if (planErr) throw new Error(`Falha ao gravar plano: ${planErr.message}`);
  const planId = plan.id as string;

  // Substitui as parcelas do plano.
  await supabase.from("quote_payment_installment").delete().eq("plan_id", planId);
  const rows = args.installments.map((inst, idx) => ({
    plan_id: planId,
    sequence: idx + 1,
    due_date: inst.dueDate,
    amount: round2(inst.amount),
    currency: inst.currency,
    description: inst.description ?? null,
  }));
  const { error: instErr } = await supabase
    .from("quote_payment_installment")
    .insert(rows);
  if (instErr) throw new Error(`Falha ao gravar parcelas: ${instErr.message}`);

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.payment_plan.set",
    alvo: planId,
    detalhe: {
      optionId: args.optionId,
      installmentsCount: args.installments.length,
      method: args.method ?? null,
    },
    ip: actor.ip ?? null,
  });

  return { planId };
}

// ---------------------------------------------------------------------------
// recalculateQuote
// ---------------------------------------------------------------------------

export type RecalculateQuoteArgs = { tenantId: string; quoteId: string };

export type OptionTotal = { optionId: string; currency: string; total: number };

/**
 * Recalcula uma cotacao (apenas em rascunho). Re-preca cada item que tem produto
 * associado (via priceProductFromDb) e atualiza os campos do quote_item.
 * Retorna os totais brutos por opcao.
 *
 * NB: nao recalcula quote_item_fee/quote_discount nesta fatia (o breakdown do
 * item ja reflete o novo calculo). TODO: sincronizar taxas/descontos.
 */
export async function recalculateQuote(
  supabase: SupabaseClient,
  args: RecalculateQuoteArgs,
  actor: ServiceActor,
): Promise<OptionTotal[]> {
  const { data: quote, error: qErr } = await supabase
    .from("quote")
    .select("id, status, issue_date, student_context")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId)
    .maybeSingle();
  if (qErr) throw new Error(`Falha ao carregar cotacao: ${qErr.message}`);
  if (!quote) throw new Error("Cotacao nao encontrada para este tenant.");
  if (quote.status !== "draft") {
    throw new Error("So e possivel recalcular cotacao em rascunho (draft).");
  }

  const studentContext = (quote.student_context ?? {}) as Record<string, unknown>;
  const nationalityCode = studentContext.nationalityCode as string | undefined;
  const quoteDate = (quote.issue_date as string | null) ?? hojeBrasilISO();

  const { data: options } = await supabase
    .from("quote_option")
    .select("id")
    .eq("tenant_id", args.tenantId)
    .eq("quote_id", args.quoteId);

  const totals: OptionTotal[] = [];

  for (const option of options ?? []) {
    const { data: items } = await supabase
      .from("quote_item")
      .select("id, product_id, start_date, quantity, unit, currency, gross_amount")
      .eq("tenant_id", args.tenantId)
      .eq("quote_option_id", option.id);

    let total = 0;
    let currency = "BRL";

    for (const item of items ?? []) {
      if (!item.product_id || !item.start_date) {
        // Item manual (sem produto) mantem o valor atual.
        total += toNum(item.gross_amount);
        currency = item.currency ?? currency;
        continue;
      }
      const priced = await priceProductFromDb(supabase, {
        tenantId: args.tenantId,
        productId: item.product_id,
        startDate: item.start_date,
        quantity: toNum(item.quantity),
        unit: item.unit,
        quoteDate,
        nationalityCode,
      });

      await supabase
        .from("quote_item")
        .update({
          delivered_quantity: priced.deliveredQuantity,
          end_date: priced.endDate,
          unit_price: priced.averageUnitPrice,
          gross_amount: priced.grossAmount,
          currency: priced.currency,
          price_breakdown: priced.breakdown,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      total += priced.grossAmount;
      currency = priced.currency;
    }

    totals.push({ optionId: option.id, currency, total: round2(total) });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.recalculated",
    alvo: args.quoteId,
    detalhe: { options: totals.length },
    ip: actor.ip ?? null,
  });

  return totals;
}
