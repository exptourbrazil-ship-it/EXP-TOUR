// Servicos de EMISSAO e PORTAL DO ESTUDANTE (Marco 5). Server-only: usa a
// service role do Supabase (as rotas criam o cliente e o passam). NUNCA importe
// em componente client.
//
// Fluxo: issueQuote congela cambio + gera token publico + status 'issued' +
// evento; revokeQuoteToken/reissueQuote gerenciam o token; getPublicQuote serve
// uma fotografia SANITIZADA (sem ids internos, so o 1o nome do estudante);
// recordQuoteEvent/selectQuoteOption registram o comportamento do estudante.
//
// Invariante: cotacao emitida NAO muda de valor porque o cambio mudou — a taxa
// e congelada aqui e o portal so le quote.fx_rate.
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/pricing";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { enviarAvisoInternoEmail } from "@/lib/email";
import {
  podeEmitir,
  converterPelaTaxa,
  validadeCambioQuote,
  cambioVencidoPorData,
  jaEmitida,
  moedaOrigemUnica,
  type PrecondicoesEmissao,
} from "@/lib/quote-issue";

export type ServiceActor = { usuario: string; ip?: string | null };

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Erro tipado: a emissao foi barrada por pre-condicoes (spec 5.1). */
export class EmissaoBloqueada extends Error {
  motivos: string[];
  constructor(motivos: string[]) {
    super(`Emissao bloqueada: ${motivos.join(" ")}`);
    this.name = "EmissaoBloqueada";
    this.motivos = motivos;
  }
}

// ---------------------------------------------------------------------------
// Totais por opcao (bruto - descontos + taxas). Reaproveitado por emissao e
// pela fotografia publica.
// ---------------------------------------------------------------------------

type OptionRow = {
  id: string;
  label: string;
  sort: number;
  is_recommended: boolean;
  deposit_amount: number | null;
  deposit_currency: string | null;
};

type TotaisOpcao = {
  option: OptionRow;
  currency: string;
  bruto: number;
  descontos: number;
  taxas: number;
  liquido: number;
  itens: Array<{
    grupo: string;
    nome: string;
    startDate: string | null;
    endDate: string | null;
    quantity: number;
    unit: string;
    grossAmount: number;
    currency: string;
  }>;
  moedas: string[]; // moedas de origem vistas nos itens (para detectar mistura)
};

async function carregarTotaisPorOpcao(
  supabase: SupabaseClient,
  tenantId: string,
  quoteId: string,
): Promise<TotaisOpcao[]> {
  const { data: options } = await supabase
    .from("quote_option")
    .select("id, label, sort, is_recommended, deposit_amount, deposit_currency")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quoteId)
    .order("sort", { ascending: true });

  const resultado: TotaisOpcao[] = [];
  for (const option of (options ?? []) as OptionRow[]) {
    const { data: items } = await supabase
      .from("quote_item")
      .select("id, \"group\", product_snapshot, start_date, end_date, quantity, unit, gross_amount, currency, sort")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id)
      .order("sort", { ascending: true });

    let bruto = 0;
    let currency = "";
    const moedas: string[] = [];
    const itens: TotaisOpcao["itens"] = [];
    for (const it of items ?? []) {
      const snap = (it.product_snapshot ?? {}) as Record<string, unknown>;
      bruto += toNum(it.gross_amount);
      currency = (it.currency as string) || currency;
      if (it.currency) moedas.push(it.currency as string);
      itens.push({
        grupo: it.group as string,
        nome: (snap.name as string) ?? (snap.nome as string) ?? (it.group as string),
        startDate: (it.start_date as string) ?? null,
        endDate: (it.end_date as string) ?? null,
        quantity: toNum(it.quantity),
        unit: it.unit as string,
        grossAmount: toNum(it.gross_amount),
        currency: (it.currency as string) ?? currency,
      });
    }

    // Descontos e taxas da opcao.
    const { data: discounts } = await supabase
      .from("quote_discount")
      .select("amount")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id);
    const descontos = (discounts ?? []).reduce((s, d) => s + toNum(d.amount), 0);

    const { data: itemIdsRows } = await supabase
      .from("quote_item")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id);
    const itemIds = (itemIdsRows ?? []).map((r) => r.id as string);
    let taxas = 0;
    if (itemIds.length > 0) {
      const { data: fees } = await supabase
        .from("quote_item_fee")
        .select("amount")
        .eq("tenant_id", tenantId)
        .in("quote_item_id", itemIds);
      taxas = (fees ?? []).reduce((s, f) => s + toNum(f.amount), 0);
    }

    const liquido = round2(bruto - descontos + taxas);
    resultado.push({
      option,
      currency: currency || "BRL",
      bruto: round2(bruto),
      descontos: round2(descontos),
      taxas: round2(taxas),
      liquido,
      itens,
      moedas,
    });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// issueQuote — congela cambio + snapshot, gera token, status 'issued'.
// Idempotente por quoteId: se ja emitida (token vivo), devolve o existente.
// ---------------------------------------------------------------------------

export type IssueQuoteArgs = { tenantId: string; quoteId: string; validadeDias?: number };
export type IssueQuoteResult = {
  token: string;
  status: string;
  issueDate: string;
  validUntil: string;
  fxRate: number | null;
  reused: boolean;
};

export async function issueQuote(
  supabase: SupabaseClient,
  args: IssueQuoteArgs,
  actor: ServiceActor,
): Promise<IssueQuoteResult> {
  const { data: quote, error: qErr } = await supabase
    .from("quote")
    .select(
      "id, status, presentment_currency, source_currency, issue_date, valid_until, public_token, fx_rate",
    )
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId)
    .maybeSingle();
  if (qErr) throw new Error(`Falha ao carregar cotacao: ${qErr.message}`);
  if (!quote) throw new Error("Cotacao nao encontrada para este tenant.");

  // Idempotencia: ja emitida e com token vivo -> devolve o mesmo.
  if (jaEmitida(quote.status as string) && quote.public_token) {
    return {
      token: quote.public_token as string,
      status: quote.status as string,
      issueDate: (quote.issue_date as string) ?? "",
      validUntil: (quote.valid_until as string) ?? "",
      fxRate: quote.fx_rate != null ? toNum(quote.fx_rate) : null,
      reused: true,
    };
  }
  if (quote.status !== "draft") {
    throw new Error(`So e possivel emitir cotacao em rascunho (status atual: ${quote.status}).`);
  }

  const presentment = (quote.presentment_currency as string) || "BRL";
  const totais = await carregarTotaisPorOpcao(supabase, args.tenantId, args.quoteId);

  // Moeda de origem (dos itens) e necessidade de conversao.
  const todasMoedas = totais.flatMap((t) => t.moedas);
  const source = moedaOrigemUnica(todasMoedas, presentment);
  const fxMoedasMisturadas = source === null;
  const fxNecessario = !fxMoedasMisturadas && source !== presentment;

  // Idade maxima da cotacao_vet (em DIAS) tolerada para congelar. Vem da politica
  // do tenant (max_rate_age_hours -> dias, arredondando pra cima); o cron diario
  // mantem a VET do dia, e a folga cobre fim de semana/feriado/falha do job.
  const { data: policy } = await supabase
    .from("tenant_fx_policy")
    .select("max_rate_age_hours")
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  const maxRateAgeHours = policy?.max_rate_age_hours != null ? toNum(policy.max_rate_age_hours) : 72;
  const maxDiasCambio = Math.max(1, Math.ceil(maxRateAgeHours / 24));

  const issueDate = hojeBrasilISO();

  // Congela a MESMA cotacao_vet que o contrato usa na cobranca (cotacoes_cambio:
  // PTAX do BACEN + spread + IOF, modelo aditivo; NZD via BCE). Fonte unica ->
  // o BRL exibido na cotacao casa, por construcao, com a regra da parcela. A VET
  // ja embute spread/IOF, entao NAO ha markup adicional aqui.
  let fxRate: number | null = null;
  let fxRateAt: string | null = null;
  let fxSource: string | null = null;
  let fxPresente = false;
  let fxVencido = false;
  if (fxNecessario && source) {
    const { data: vetRow } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet, data")
      .eq("moeda", source)
      .lte("data", issueDate)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (vetRow && vetRow.cotacao_vet != null) {
      fxPresente = true;
      fxRate = toNum(vetRow.cotacao_vet);
      fxRateAt = `${(vetRow.data as string).slice(0, 10)}T00:00:00.000Z`;
      fxSource = "BACEN PTAX + spread/IOF (cotacoes_cambio); NZD via BCE";
      fxVencido = cambioVencidoPorData(vetRow.data as string, issueDate, maxDiasCambio);
    }
  }

  // Pre-condicoes de emissao.
  const precond: PrecondicoesEmissao = {
    numOpcoes: totais.length,
    itensPorOpcao: totais.map((t) => t.itens.length),
    temValidUntil: true, // definimos a validade abaixo se faltar
    fxNecessario,
    fxPresente,
    fxVencido,
    fxMoedasMisturadas,
    warningsBloqueantes: 0,
  };
  const veredito = podeEmitir(precond);
  if (!veredito.ok) throw new EmissaoBloqueada(veredito.motivos);

  // Validade: o cambio congelado so vale ate min(emissao+10, ultimo dia do mes).
  // Um valid_until manual EARLIER e respeitado; nunca alem da janela do cambio.
  const cambioValidade = validadeCambioQuote(issueDate);
  const manual = quote.valid_until as string | null;
  const validUntil = manual && manual < cambioValidade ? manual : cambioValidade;
  const token = randomBytes(32).toString("base64url");

  // Guard de corrida: so emite se ainda estiver em draft. Duas emissoes
  // concorrentes leriam 'draft'; a segunda casa 0 linhas e nao gera token orfao.
  const { data: emitidas, error: upErr } = await supabase
    .from("quote")
    .update({
      status: "issued",
      public_token: token,
      token_revoked_at: null,
      issue_date: issueDate,
      valid_until: validUntil,
      source_currency: source,
      fx_rate: fxRate,
      fx_rate_at: fxRateAt,
      fx_source: fxSource,
      fx_markup_percent: null, // VET ja embute spread + IOF; sem markup separado
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId)
    .eq("status", "draft")
    .select("id");
  if (upErr) throw new Error(`Falha ao emitir cotacao: ${upErr.message}`);
  if (!emitidas || emitidas.length !== 1) {
    // Perdeu a corrida: outra emissao ja rodou. Devolve o token vigente (idempotente).
    const { data: atual } = await supabase
      .from("quote")
      .select("status, public_token, issue_date, valid_until, fx_rate")
      .eq("tenant_id", args.tenantId)
      .eq("id", args.quoteId)
      .maybeSingle();
    if (atual?.public_token) {
      return {
        token: atual.public_token as string,
        status: atual.status as string,
        issueDate: (atual.issue_date as string) ?? issueDate,
        validUntil: (atual.valid_until as string) ?? validUntil,
        fxRate: atual.fx_rate != null ? toNum(atual.fx_rate) : null,
        reused: true,
      };
    }
    throw new Error("Nao foi possivel emitir a cotacao (estado mudou durante a emissao).");
  }

  await supabase.from("quote_event").insert({
    tenant_id: args.tenantId,
    quote_id: args.quoteId,
    kind: "issued",
    actor_type: "user",
    metadata: { fxRate, source, presentment },
  });

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.issued",
    alvo: args.quoteId,
    detalhe: { issueDate, validUntil, fxRate, source, presentment },
    ip: actor.ip ?? null,
  });

  return { token, status: "issued", issueDate, validUntil, fxRate, reused: false };
}

// ---------------------------------------------------------------------------
// revokeQuoteToken — invalida o link publico (token_revoked_at).
// ---------------------------------------------------------------------------

export async function revokeQuoteToken(
  supabase: SupabaseClient,
  args: { tenantId: string; quoteId: string },
  actor: ServiceActor,
): Promise<{ revokedAt: string }> {
  const { data: quote } = await supabase
    .from("quote")
    .select("id, public_token")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId)
    .maybeSingle();
  if (!quote) throw new Error("Cotacao nao encontrada para este tenant.");

  const revokedAt = new Date().toISOString();
  const { error } = await supabase
    .from("quote")
    .update({ token_revoked_at: revokedAt, updated_at: revokedAt })
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId);
  if (error) throw new Error(`Falha ao revogar token: ${error.message}`);

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.token.revoked",
    alvo: args.quoteId,
    detalhe: {},
    ip: actor.ip ?? null,
  });
  return { revokedAt };
}

// ---------------------------------------------------------------------------
// reissueQuote — nova emissao com cambio recongelado e NOVO token; arquiva o
// token anterior (evento 'reissued'). Usado quando a cotacao emitida precisou
// de ajuste. Volta a 'issued' e limpa a escolha anterior.
// ---------------------------------------------------------------------------

export async function reissueQuote(
  supabase: SupabaseClient,
  args: IssueQuoteArgs,
  actor: ServiceActor,
): Promise<IssueQuoteResult> {
  const { data: quote } = await supabase
    .from("quote")
    .select("id, status, public_token")
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId)
    .maybeSingle();
  if (!quote) throw new Error("Cotacao nao encontrada para este tenant.");
  if (!jaEmitida(quote.status as string)) {
    throw new Error("So se reemite uma cotacao ja emitida. Use emitir para a primeira vez.");
  }

  const tokenAnterior = quote.public_token as string | null;
  // Volta para draft internamente para reutilizar issueQuote (que congela tudo).
  await supabase
    .from("quote")
    .update({
      status: "draft",
      selected_option_id: null,
      public_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", args.tenantId)
    .eq("id", args.quoteId);

  // Higiene: limpa a marca de escolha das opcoes; a reemissao zera a escolha.
  await supabase
    .from("quote_option")
    .update({ selected_at: null })
    .eq("tenant_id", args.tenantId)
    .eq("quote_id", args.quoteId);

  const emitido = await issueQuote(supabase, args, actor);

  await supabase.from("quote_event").insert({
    tenant_id: args.tenantId,
    quote_id: args.quoteId,
    kind: "reissued",
    actor_type: "user",
    metadata: { tokenAnteriorArquivado: !!tokenAnterior },
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: actor.usuario,
    acao: "quote.reissued",
    alvo: args.quoteId,
    detalhe: { validUntil: emitido.validUntil },
    ip: actor.ip ?? null,
  });
  return emitido;
}

// ---------------------------------------------------------------------------
// getPublicQuote — fotografia SANITIZADA para o portal (sem auth, por token).
// Nao expoe ids internos: as opcoes sao indexadas (0..n) para a escolha.
// ---------------------------------------------------------------------------

export type PublicQuote = {
  reference: string;
  locale: string;
  studentFirstName: string;
  brand: string;
  brandSlug: string | null;
  logoUrl: string | null;
  consultant: { nome: string | null; email: string | null } | null;
  validUntil: string | null;
  status: string;
  selectedIndex: number | null;
  fx: {
    necessario: boolean;
    rate: number | null;
    rateAt: string | null;
    source: string | null;
    sourceCurrency: string | null;
    presentmentCurrency: string;
    disclaimer: string;
  };
  options: Array<{
    index: number;
    label: string;
    isRecommended: boolean;
    currency: string;
    bruto: number;
    descontos: number;
    taxas: number;
    liquido: number;
    liquidoConvertido: number | null;
    depositAmount: number | null;
    depositCurrency: string | null;
    itens: Array<{
      grupo: string;
      nome: string;
      startDate: string | null;
      endDate: string | null;
      quantity: number;
      unit: string;
      grossAmount: number;
      currency: string;
    }>;
  }>;
};

/** Busca a cotacao pelo token, aplicando as regras de visibilidade publica. */
async function carregarQuotePorToken(supabase: SupabaseClient, token: string) {
  const { data } = await supabase
    .from("quote")
    .select(
      "id, tenant_id, reference, locale, status, presentment_currency, source_currency, fx_rate, fx_rate_at, fx_source, valid_until, token_revoked_at, selected_option_id, student_id, owner_user_id",
    )
    .eq("public_token", token)
    .maybeSingle();
  return data;
}

/** Cotacao "visivel" no portal: emitida, token nao revogado, nao expirada/cancelada. */
function visivelNoPortal(status: string, tokenRevokedAt: string | null): boolean {
  if (tokenRevokedAt) return false;
  return status === "issued" || status === "viewed" || status === "option_selected";
}

export async function getPublicQuote(
  supabase: SupabaseClient,
  token: string,
): Promise<PublicQuote | null> {
  const quote = await carregarQuotePorToken(supabase, token);
  if (!quote) return null;
  if (!visivelNoPortal(quote.status as string, quote.token_revoked_at as string | null)) {
    return null;
  }

  const tenantId = quote.tenant_id as string;
  const presentment = (quote.presentment_currency as string) || "BRL";

  // Estudante: SOMENTE o primeiro nome (spec 9).
  const { data: student } = await supabase
    .from("student")
    .select("first_name")
    .eq("tenant_id", tenantId)
    .eq("id", quote.student_id as string)
    .maybeSingle();

  // Marca (nome/slug/logo do tenant) e disclaimer de cambio. O slug seleciona
  // os tokens visuais da instancia no portal (ver src/lib/tenant-brand.ts).
  const { data: tenant } = await supabase
    .from("tenant")
    .select("name, slug, logo_url")
    .eq("id", tenantId)
    .maybeSingle();
  const { data: policy } = await supabase
    .from("tenant_fx_policy")
    .select("disclaimer")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  // Consultor (cartao): nome/e-mail do dono. Sem id interno.
  let consultant: PublicQuote["consultant"] = null;
  if (quote.owner_user_id) {
    const { data: owner } = await supabase
      .from("admin_users")
      .select("nome, email")
      .eq("id", quote.owner_user_id as string)
      .maybeSingle();
    if (owner) consultant = { nome: (owner.nome as string) ?? null, email: (owner.email as string) ?? null };
  }

  const totais = await carregarTotaisPorOpcao(supabase, tenantId, quote.id as string);
  const fxRate = quote.fx_rate != null ? toNum(quote.fx_rate) : null;
  const sourceCurrency = (quote.source_currency as string) ?? null;
  const fxNecessario = !!sourceCurrency && sourceCurrency !== presentment;

  const selectedId = quote.selected_option_id as string | null;
  let selectedIndex: number | null = null;

  const options = totais.map((t, index) => {
    if (selectedId && t.option.id === selectedId) selectedIndex = index;
    const liquidoConvertido =
      fxNecessario && fxRate ? converterPelaTaxa(t.liquido, fxRate) : null;
    return {
      index,
      label: t.option.label,
      isRecommended: !!t.option.is_recommended,
      currency: t.currency,
      bruto: t.bruto,
      descontos: t.descontos,
      taxas: t.taxas,
      liquido: t.liquido,
      liquidoConvertido,
      depositAmount: t.option.deposit_amount != null ? toNum(t.option.deposit_amount) : null,
      depositCurrency: t.option.deposit_currency ?? null,
      itens: t.itens,
    };
  });

  return {
    reference: quote.reference as string,
    locale: (quote.locale as string) || "pt-BR",
    studentFirstName: (student?.first_name as string) ?? "",
    brand: (tenant?.name as string) ?? "EXP Tour",
    brandSlug: (tenant?.slug as string) ?? null,
    logoUrl: (tenant?.logo_url as string) ?? null,
    consultant,
    validUntil: (quote.valid_until as string) ?? null,
    status: quote.status as string,
    selectedIndex,
    fx: {
      necessario: fxNecessario,
      rate: fxRate,
      rateAt: (quote.fx_rate_at as string) ?? null,
      source: (quote.fx_source as string) ?? null,
      sourceCurrency,
      presentmentCurrency: presentment,
      disclaimer: (policy?.disclaimer as string) ?? "",
    },
    options,
  };
}

// ---------------------------------------------------------------------------
// recordQuoteEvent — registra comportamento do estudante (opened/option_viewed/
// downloaded). Publico. Primeiro 'opened' promove 'issued' -> 'viewed'.
// ---------------------------------------------------------------------------

const KINDS_PUBLICOS = new Set(["opened", "option_viewed", "downloaded"]);

export async function recordQuoteEvent(
  supabase: SupabaseClient,
  token: string,
  kind: string,
  metadata?: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  if (!KINDS_PUBLICOS.has(kind)) throw new Error("Evento nao permitido pelo portal.");
  const quote = await carregarQuotePorToken(supabase, token);
  if (!quote) return { ok: false };
  if (!visivelNoPortal(quote.status as string, quote.token_revoked_at as string | null)) {
    return { ok: false };
  }

  await supabase.from("quote_event").insert({
    tenant_id: quote.tenant_id as string,
    quote_id: quote.id as string,
    kind,
    actor_type: "student",
    metadata: metadata ?? {},
  });

  // Primeiro 'opened' marca a cotacao como vista.
  if (kind === "opened" && quote.status === "issued") {
    await supabase
      .from("quote")
      .update({ status: "viewed", updated_at: new Date().toISOString() })
      .eq("tenant_id", quote.tenant_id as string)
      .eq("id", quote.id as string)
      .eq("status", "issued"); // condicional: nao regride de option_selected
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// selectQuoteOption — escolha do estudante (2 etapas, irreversivel por ele).
// Recebe o INDICE publico da opcao; mapeia para o id server-side.
// ---------------------------------------------------------------------------

export async function selectQuoteOption(
  supabase: SupabaseClient,
  token: string,
  optionIndex: number,
  confirmar: boolean,
): Promise<{ ok: boolean; selectedIndex: number }> {
  if (!confirmar) throw new Error("Confirmacao necessaria para escolher a opcao.");
  const quote = await carregarQuotePorToken(supabase, token);
  if (!quote) throw new Error("Cotacao nao encontrada.");
  if (!visivelNoPortal(quote.status as string, quote.token_revoked_at as string | null)) {
    throw new Error("Este link nao esta mais disponivel.");
  }
  if (quote.status === "option_selected") {
    throw new Error("Uma opcao ja foi escolhida. A escolha e irreversivel pelo portal.");
  }

  const tenantId = quote.tenant_id as string;
  const { data: options } = await supabase
    .from("quote_option")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quote.id as string)
    .order("sort", { ascending: true });
  const lista = options ?? [];
  if (optionIndex < 0 || optionIndex >= lista.length) {
    throw new Error("Opcao inexistente.");
  }
  const chosen = lista[optionIndex].id as string;

  const agora = new Date().toISOString();
  // Corrida: so o primeiro grava. Um update que casa 0 linhas NAO retorna erro
  // no supabase-js, entao conferimos as linhas afetadas (.select) ANTES de tocar
  // opcao/evento/e-mail — senao uma segunda escolha concorrente daria sucesso
  // falso e dispararia evento/e-mail para uma opcao que nao foi registrada.
  const { data: gravadas, error } = await supabase
    .from("quote")
    .update({ status: "option_selected", selected_option_id: chosen, updated_at: agora })
    .eq("tenant_id", quote.tenant_id as string)
    .eq("id", quote.id as string)
    .neq("status", "option_selected")
    .select("id");
  if (error) throw new Error(`Falha ao registrar escolha: ${error.message}`);
  if (!gravadas || gravadas.length !== 1) {
    // Outra requisicao ja escolheu entre a leitura e a gravacao.
    throw new Error("Uma opcao ja foi escolhida. A escolha e irreversivel pelo portal.");
  }

  await supabase
    .from("quote_option")
    .update({ selected_at: agora })
    .eq("tenant_id", tenantId)
    .eq("id", chosen);

  await supabase.from("quote_event").insert({
    tenant_id: tenantId,
    quote_id: quote.id as string,
    kind: "option_selected",
    actor_type: "student",
    metadata: { optionIndex },
  });

  // Notifica o consultor dono (alerta interno).
  try {
    if (quote.owner_user_id) {
      const { data: owner } = await supabase
        .from("admin_users")
        .select("email, nome")
        .eq("id", quote.owner_user_id as string)
        .maybeSingle();
      const ref = quote.reference as string;
      await enviarAvisoInternoEmail(
        `Cotacao ${ref}: opcao escolhida pelo estudante`,
        `O estudante escolheu a opcao ${optionIndex + 1} na cotacao ${ref}.` +
          (owner?.nome ? ` Consultor: ${owner.nome}.` : ""),
      );
    }
  } catch {
    // Notificacao e best-effort: nao derruba a escolha por falha de e-mail.
  }

  return { ok: true, selectedIndex: optionIndex };
}

// ---------------------------------------------------------------------------
// dadosConversaoCotacao — dados SERVER-SIDE da opcao escolhida, para o checkout
// (Fatia 2). Deriva do BANCO (nunca de input do estudante) o total liquido, a
// moeda de origem, a entrada, a data de inicio, o estudante, o pais e o
// fornecedor da opcao SELECIONADA. So retorna quando a cotacao esta apta a
// converter (option_selected, token vivo). Retorna null caso contrario.
// ---------------------------------------------------------------------------

export type DadosConversao = {
  tenantId: string;
  quoteId: string;
  optionIndex: number;
  currency: string; // moeda de origem da opcao (o contrato nasce nela)
  liquido: number; // total da opcao na moeda de origem
  entrada: number; // deposit na MESMA moeda (0 se moeda difere/ausente)
  dataInicio: string | null; // menor start_date dos itens da opcao
  studentId: string | null; // o nome completo e resolvido no servico de checkout
  paisDestino: string | null;
  supplierId: string | null;
  contratoNome: string;
};

export async function dadosConversaoCotacao(
  supabase: SupabaseClient,
  token: string,
): Promise<DadosConversao | null> {
  const quote = await carregarQuotePorToken(supabase, token);
  if (!quote) return null;
  if (quote.token_revoked_at) return null;
  if (quote.status !== "option_selected") return null;
  const selectedId = quote.selected_option_id as string | null;
  if (!selectedId) return null;
  const tenantId = quote.tenant_id as string;

  const totais = await carregarTotaisPorOpcao(supabase, tenantId, quote.id as string);
  const optionIndex = totais.findIndex((t) => t.option.id === selectedId);
  if (optionIndex < 0) return null;
  const t = totais[optionIndex];

  const currency = t.currency;
  const liquido = t.liquido;
  const deposit = t.option.deposit_amount != null ? toNum(t.option.deposit_amount) : 0;
  const depositCur = t.option.deposit_currency ?? null;
  // Entrada so entra na MESMA moeda da opcao (senao viraria mistura de moedas).
  const entrada = deposit > 0 && (!depositCur || depositCur === currency) ? deposit : 0;

  // Data de inicio: menor start_date entre os itens (define a janela de parcelas).
  const datas = t.itens.map((i) => i.startDate).filter(Boolean) as string[];
  const dataInicio = datas.length ? datas.slice().sort()[0] : null;

  // Nome do contrato: nome do item de programa; senao 1o item; senao referencia.
  const progItem = t.itens.find((i) => i.grupo === "program") ?? t.itens[0];
  const contratoNome = (progItem?.nome as string) || (quote.reference as string) || "Programa";

  // O nome completo do estudante e resolvido no servico de checkout (fora do
  // servico do portal publico, que so pode expor o first_name). Aqui devolvemos
  // apenas o id.
  const studentId = (quote.student_id as string) ?? null;

  // Fornecedor + pais: via campus do item de programa da opcao selecionada.
  let supplierId: string | null = null;
  let paisDestino: string | null = null;
  const { data: itensOpcao } = await supabase
    .from("quote_item")
    .select("\"group\", campus_id, product_snapshot")
    .eq("tenant_id", tenantId)
    .eq("quote_option_id", selectedId);
  const prog = (itensOpcao ?? []).find((i) => i.group === "program") ?? (itensOpcao ?? [])[0];
  if (prog?.campus_id) {
    const { data: campus } = await supabase
      .from("campus")
      .select("supplier_id, country_code")
      .eq("tenant_id", tenantId)
      .eq("id", prog.campus_id as string)
      .maybeSingle();
    supplierId = (campus?.supplier_id as string) ?? null;
    paisDestino = (campus?.country_code as string) ?? null;
  }

  return {
    tenantId,
    quoteId: quote.id as string,
    optionIndex,
    currency,
    liquido,
    entrada,
    dataInicio,
    studentId,
    paisDestino,
    supplierId,
    contratoNome,
  };
}
