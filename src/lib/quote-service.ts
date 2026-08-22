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
};

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

  if (args.copyFromOptionId) {
    await copyOptionContents(supabase, args.tenantId, args.copyFromOptionId, optionId);
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.option.added",
    alvo: optionId,
    detalhe: { quoteId: args.quoteId, copyFromOptionId: args.copyFromOptionId ?? null },
    ip: actor.ip ?? null,
  });

  return { optionId };
}

/**
 * Duplica itens (+ taxas + descontos de item) e descontos de opcao da origem
 * para a nova opcao. Inserts sequenciais; sem atomicidade.
 * TODO: mover para RPC/funcao Postgres para atomicidade.
 */
async function copyOptionContents(
  supabase: SupabaseClient,
  tenantId: string,
  sourceOptionId: string,
  targetOptionId: string,
): Promise<void> {
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
      const { id, created_at: dc, ...drest } = disc as any;
      await supabase.from("quote_discount").insert({
        ...drest,
        quote_option_id: targetOptionId,
        quote_item_id: newItemId,
      });
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
    const { id, created_at: dc, ...drest } = disc as any;
    await supabase
      .from("quote_discount")
      .insert({ ...drest, quote_option_id: targetOptionId });
  }
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
};

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
): Promise<{ discountId: string; amount: number }> {
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
    const { data: item } = await supabase
      .from("quote_item")
      .select("gross_amount, currency")
      .eq("tenant_id", args.tenantId)
      .eq("id", args.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item nao encontrado para este tenant.");
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

  return { discountId: discount.id as string, amount };
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
