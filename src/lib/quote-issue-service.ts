// Servicos de EMISSAO e PORTAL DO ESTUDANTE (Marco 5). Server-only: usa a
// service role do Supabase (as rotas criam o cliente e o passam). NUNCA importe
// em componente client.
//
// Fluxo: issueQuote congela cambio + gera token publico + status 'issued' +
// evento; revokeQuoteToken/reissueQuote gerenciam o token; getPublicQuote serve
// uma fotografia SANITIZADA (sem ids internos, so o 1o nome do estudante);
// recordQuoteEvent/selectQuoteOption registram o comportamento do estudante.
//
// Moeda/preco: o VALOR NA MOEDA DO CURSO (bruto/taxas/liquido) e congelado na
// emissao (o preco da escola nao muda). O CAMBIO, porem, e FLUTUANTE: o portal
// converte para R$ pela cotacao_vet do DIA em que o link e aberto (regra de
// negocio — se a cotacao for encaminhada dias depois, o R$ reflete o cambio
// daquele dia; mesma regra do Pix na Area do Cliente). quote.fx_rate fica so
// como registro/fallback. (Isto substitui o antigo invariante de "congelar o
// cambio no portal".)
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "@/lib/pricing";
import { fichaDoSnapshot, detalhesDoSnapshot, ehUrlHttp, sanitizarHtml, type FichaProduto, type DetalhesSnapshot, type ContentLocale } from "@/lib/produto-conteudo";
import { converterParaBRL } from "@/lib/cambio";
import { parseRedes, urlFavicon, type LinkSocial } from "@/lib/redes-sociais";
import { entradaDaOpcao } from "@/lib/entrada-cotacao";
import { inicioAlemDoIntake } from "@/lib/anexo3-entidades";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { enviarAvisoInternoEmail } from "@/lib/email";
import {
  podeEmitir,
  validadeCambioQuote,
  cambioVencidoPorData,
  jaEmitida,
  liquidoDaOpcao,
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

type TaxaLinha = {
  nome: string;
  amount: number;
  currency: string;
  isRefundable: boolean | null;
  /** charge_basis congelado no item: once_per_item | once_per_quote | per_unit. */
  basis: string | null;
  /**
   * Posicao do item a que a taxa pertence, na ordem de `itens`. Permite mostrar
   * a taxa LOGO ABAIXO do que ela encarece (como a matricula abaixo do curso),
   * em vez de num bolo no fim — que e o que faz o cliente perguntar "taxa de que?".
   * null = taxa sem item identificado.
   */
  itemIndex: number | null;
};

type ParcelaPlano = {
  sequence: number;
  dueDate: string;
  amount: number;
  currency: string;
  description: string | null;
};

type PlanoPagamento = {
  installmentsCount: number;
  firstDueDate: string | null;
  method: string | null;
  notes: string | null;
  parcelas: ParcelaPlano[];
} | null;

// Linha de desconto detalhada (F5): promocao com PRAZO congelado ("valida ate") ou
// desconto manual do consultor. `validoAte` = quote_discount.valid_until.
export type DescontoLinha = {
  nome: string;
  amount: number;
  currency: string;
  validoAte: string | null; // ISO 'YYYY-MM-DD'
  promocao: boolean; // veio de promotion (promotion_id) vs. manual
};

type TotaisOpcao = {
  option: OptionRow;
  currency: string;
  bruto: number;
  descontos: number;
  descontosDetalhados: DescontoLinha[];
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
    ficha: FichaProduto | null; // conteúdo editorial (do snapshot), já sanitizado
    detalhes: DetalhesSnapshot; // quick info / acomodação / escola (Fase A2)
  }>;
  taxasDetalhadas: TaxaLinha[]; // taxas linha a linha (nome + reembolsável) para o "Price"
  planoPagamento: PlanoPagamento; // parcelas congeladas da opção, quando houver
  moedas: string[]; // moedas de origem vistas nos itens (para detectar mistura)
};

async function carregarTotaisPorOpcao(
  supabase: SupabaseClient,
  tenantId: string,
  quoteId: string,
  locale: ContentLocale = "pt-BR",
): Promise<TotaisOpcao[]> {
  const { data: options } = await supabase
    .from("quote_option")
    .select("id, label, sort, is_recommended, deposit_amount, deposit_currency")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quoteId)
    .order("sort", { ascending: true });

  const resultado: TotaisOpcao[] = [];
  for (const option of (options ?? []) as OptionRow[]) {
    // Erro de leitura NAO pode virar lista vazia: os itens somem, as taxas somem
    // junto e o cliente ve uma proposta com total errado, sem nenhum aviso.
    const { data: items, error: itensErr } = await supabase
      .from("quote_item")
      .select("id, \"group\", product_snapshot, start_date, end_date, quantity, unit, gross_amount, currency, sort")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id)
      .order("sort", { ascending: true })
      .order("id", { ascending: true }); // desempate estavel: `sort` repete
    if (itensErr) throw new Error(`Falha ao carregar itens da opcao: ${itensErr.message}`);

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
        ficha: fichaDoSnapshot(snap.content, locale, snap.media),
        detalhes: detalhesDoSnapshot(snap, locale),
      });
    }

    // Descontos e taxas da opcao.
    const { data: discounts } = await supabase
      .from("quote_discount")
      .select("name, amount, currency, promotion_id, valid_until, is_manual, created_at")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id)
      .order("created_at", { ascending: true });
    const descontos = (discounts ?? []).reduce((s, d) => s + toNum(d.amount), 0);
    // Linha a linha (F5): promocao com prazo congelado, ou desconto manual.
    // Desconto MANUAL: `name` e o `reason` do consultor — justificativa de AUDITORIA
    // (ex.: "gestor liberou 12%"), nao texto para o cliente. Sai com rotulo generico.
    const descontosDetalhados: DescontoLinha[] = (discounts ?? []).map((d) => ({
      nome: d.is_manual ? "Desconto comercial" : ((d.name as string) ?? "Desconto"),
      amount: round2(toNum(d.amount)),
      currency: (d.currency as string) || currency || "BRL",
      validoAte: (d.valid_until as string | null) ?? null,
      // So e "Promocao" o que veio de uma promotion de verdade. Automaticos sem
      // vinculo (legado antes do F5, ou semanas gratis por faixa) sao "Desconto".
      promocao: !!d.promotion_id,
    }));

    // A ordem aqui e a MESMA de `itens` acima (mesma consulta, mesmo `sort`):
    // e ela que liga cada taxa a posicao do item que ela encarece.
    const itemIds = (items ?? []).map((r) => r.id as string);
    const posicaoDoItem = new Map<string, number>(itemIds.map((id, idx) => [id, idx]));
    let taxas = 0;
    const taxasDetalhadas: TaxaLinha[] = [];
    if (itemIds.length > 0) {
      const { data: fees, error: feesErr } = await supabase
        .from("quote_item_fee")
        .select("name, amount, currency, is_refundable, basis, quote_item_id")
        .eq("tenant_id", tenantId)
        .in("quote_item_id", itemIds)
        // Sem ordem explicita, duas aberturas do mesmo link listam as taxas em
        // ordens diferentes — numa proposta de preco isso gera desconfianca.
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      if (feesErr) throw new Error(`Falha ao carregar taxas da opcao: ${feesErr.message}`);
      for (const f of fees ?? []) {
        const amount = toNum(f.amount);
        taxas += amount;
        taxasDetalhadas.push({
          nome: (f.name as string) ?? "Taxa",
          amount: round2(amount),
          currency: (f.currency as string) || currency || "BRL",
          isRefundable: f.is_refundable == null ? null : !!f.is_refundable,
          basis: (f.basis as string) ?? null,
          itemIndex: posicaoDoItem.get(f.quote_item_id as string) ?? null,
        });
      }
    }

    // Plano de pagamento congelado da opcao (parcelas), quando houver.
    let planoPagamento: PlanoPagamento = null;
    const { data: plano } = await supabase
      .from("quote_payment_plan")
      .select("id, installments_count, first_due_date, method, notes")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id)
      .maybeSingle();
    if (plano) {
      const { data: parcelasRows } = await supabase
        .from("quote_payment_installment")
        .select("sequence, due_date, amount, currency, description")
        .eq("plan_id", plano.id as string)
        .order("sequence", { ascending: true });
      planoPagamento = {
        installmentsCount: Number(plano.installments_count) || (parcelasRows?.length ?? 0),
        firstDueDate: (plano.first_due_date as string) ?? null,
        method: (plano.method as string) ?? null,
        notes: (plano.notes as string) ?? null,
        parcelas: (parcelasRows ?? []).map((p) => ({
          sequence: Number(p.sequence) || 0,
          dueDate: p.due_date as string,
          amount: round2(toNum(p.amount)),
          currency: (p.currency as string) || currency || "BRL",
          description: (p.description as string) ?? null,
        })),
      };
    }

    const liquido = liquidoDaOpcao({ bruto, descontos, taxas });
    resultado.push({
      option,
      currency: currency || "BRL",
      bruto: round2(bruto),
      descontos: round2(descontos),
      descontosDetalhados,
      taxas: round2(taxas),
      liquido,
      itens,
      taxasDetalhadas,
      planoPagamento,
      moedas,
    });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Totais LÍQUIDOS por opção — versão LEVE (só o dinheiro, sem fichas), para o
// construtor mostrar o preço final (bruto - descontos + taxas) que o cliente
// verá. Mesma agregação e mesma fórmula (`liquidoDaOpcao`) da emissão, então o
// número exibido casa com o congelado na fotografia. Leitura por tenant.
// ---------------------------------------------------------------------------
export type LiquidoOpcao = {
  optionId: string;
  currency: string;
  bruto: number;
  descontos: number;
  taxas: number;
  liquido: number;
  moedas: string[]; // moedas de origem vistas (para detectar mistura)
};

export async function carregarLiquidoPorOpcao(
  supabase: SupabaseClient,
  tenantId: string,
  quoteId: string,
): Promise<LiquidoOpcao[]> {
  const { data: options } = await supabase
    .from("quote_option")
    .select("id, sort")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quoteId)
    .order("sort", { ascending: true });

  const out: LiquidoOpcao[] = [];
  for (const option of options ?? []) {
    const { data: items } = await supabase
      .from("quote_item")
      .select("id, gross_amount, currency")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id);

    let bruto = 0;
    let currency = "";
    const moedas: string[] = [];
    const itemIds: string[] = [];
    for (const it of items ?? []) {
      bruto += toNum(it.gross_amount);
      if (it.currency) {
        currency = it.currency as string;
        moedas.push(it.currency as string);
      }
      itemIds.push(it.id as string);
    }

    const { data: discounts } = await supabase
      .from("quote_discount")
      .select("amount")
      .eq("tenant_id", tenantId)
      .eq("quote_option_id", option.id);
    const descontos = (discounts ?? []).reduce((s, d) => s + toNum(d.amount), 0);

    let taxas = 0;
    if (itemIds.length > 0) {
      const { data: fees } = await supabase
        .from("quote_item_fee")
        .select("amount")
        .eq("tenant_id", tenantId)
        .in("quote_item_id", itemIds);
      taxas = (fees ?? []).reduce((s, f) => s + toNum(f.amount), 0);
    }

    out.push({
      optionId: option.id as string,
      currency: currency || "BRL",
      bruto: round2(bruto),
      descontos: round2(descontos),
      taxas: round2(taxas),
      liquido: liquidoDaOpcao({ bruto, descontos, taxas }),
      moedas,
    });
  }
  return out;
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

// Bloqueio §7 (Contrato v3.1): não emitir cotação cujo início do CURSO seja
// posterior ao horizonte de preço confirmado do campus (campus_politica.
// intake_maximo_vendavel) — vender além disso transfere o risco de reajuste à
// Forio (Cláusula 6.1.1). Fail-safe: sem intake cadastrado, não bloqueia.
async function checarIntakeMaximo(
  supabase: SupabaseClient,
  tenantId: string,
  quoteId: string,
): Promise<{ bloqueado: boolean; motivo?: string }> {
  const { data: ops } = await supabase
    .from("quote_option")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quoteId);
  const opIds = (ops ?? []).map((o) => o.id as string);
  if (opIds.length === 0) return { bloqueado: false };

  const { data: itens } = await supabase
    .from("quote_item")
    .select("campus_id, start_date")
    .eq("tenant_id", tenantId)
    .eq("group", "program")
    .in("quote_option_id", opIds);
  const programItens = (itens ?? []).filter((i) => i.campus_id && i.start_date);
  if (programItens.length === 0) return { bloqueado: false };

  const campusIds = Array.from(new Set(programItens.map((i) => i.campus_id as string)));
  const { data: pols } = await supabase
    .from("campus_politica")
    .select("campus_id, intake_maximo_vendavel")
    .eq("tenant_id", tenantId)
    .in("campus_id", campusIds);
  const intakePorCampus = new Map(
    (pols ?? []).map((p) => [p.campus_id as string, (p.intake_maximo_vendavel as string) ?? null]),
  );

  for (const it of programItens) {
    const intake = intakePorCampus.get(it.campus_id as string) ?? null;
    if (inicioAlemDoIntake(it.start_date as string, intake)) {
      return {
        bloqueado: true,
        motivo: `Início do curso em ${(it.start_date as string).slice(0, 10)} é posterior ao horizonte de preço confirmado do campus (até ${intake}). Ajuste a data de início ou atualize o intake máximo vendável do campus antes de emitir.`,
      };
    }
  }
  return { bloqueado: false };
}

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

  // Bloqueio §7: início além do horizonte de preço confirmado do campus.
  const intake = await checarIntakeMaximo(supabase, args.tenantId, args.quoteId);
  if (intake.bloqueado) throw new Error(intake.motivo);

  const presentment = (quote.presentment_currency as string) || "BRL";
  const totais = await carregarTotaisPorOpcao(supabase, args.tenantId, args.quoteId);

  // Moedas de origem. Moedas diferentes ENTRE opcoes sao permitidas: cada opcao
  // e convertida pelo VET da sua propria moeda, pela mesma formula do contrato
  // (PTAX + spread + IOF). O que nao tem solucao e uma MESMA opcao com itens em
  // moedas diferentes — nao existe um total para ela.
  const todasMoedas = totais.flatMap((t) => t.moedas);
  const source = moedaOrigemUnica(todasMoedas, presentment); // null quando ha mistura
  // A conta do total e `bruto - descontos + taxas`: taxa e desconto entram na
  // soma igual aos itens, entao a moeda deles conta na verificacao de mistura.
  const moedasDaOpcao = (t: (typeof totais)[number]) =>
    new Set(
      [
        ...t.moedas,
        ...t.taxasDetalhadas.map((x) => x.currency),
        ...t.descontosDetalhados.map((x) => x.currency),
      ].filter(Boolean),
    );
  const opcoesComMoedaMisturada = totais.filter((t) => moedasDaOpcao(t).size > 1).length;
  // Moedas que precisam de conversao (todas as de origem, exceto a de apresentacao).
  const moedasParaConverter = Array.from(
    new Set(totais.flatMap((t) => [...moedasDaOpcao(t)]).filter((m) => m !== presentment)),
  ).sort();

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
  // Uma consulta por moeda: TODAS precisam de cotacao, senao alguma opcao sairia
  // sem valor em real na proposta.
  const moedasSemTaxa: string[] = [];
  const moedasVencidas: string[] = [];
  let fxRate: number | null = null;
  let fxRateAt: string | null = null;
  let fxSource: string | null = null;
  for (const moeda of moedasParaConverter) {
    const { data: vetRow } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet, data")
      .eq("moeda", moeda)
      .lte("data", issueDate)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!vetRow || vetRow.cotacao_vet == null) {
      moedasSemTaxa.push(moeda);
      continue;
    }
    if (cambioVencidoPorData(vetRow.data as string, issueDate, maxDiasCambio)) {
      moedasVencidas.push(moeda);
      continue;
    }
    // `quote.fx_rate` guarda UMA taxa: so faz sentido quando a cotacao inteira
    // esta numa moeda so. Com varias, o portal usa o VET por opcao (o campo fica
    // nulo em vez de guardar a taxa de uma das moedas e fingir que vale para todas).
    if (moeda === source) {
      fxRate = toNum(vetRow.cotacao_vet);
      fxRateAt = `${(vetRow.data as string).slice(0, 10)}T00:00:00.000Z`;
      fxSource = "BACEN PTAX + spread/IOF (cotacoes_cambio); NZD via BCE";
    }
  }

  // Pre-condicoes de emissao.
  const precond: PrecondicoesEmissao = {
    numOpcoes: totais.length,
    itensPorOpcao: totais.map((t) => t.itens.length),
    temValidUntil: true, // definimos a validade abaixo se faltar
    opcoesComMoedaMisturada,
    moedasSemTaxa,
    moedasVencidas,
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
  issuedOn: string | null; // data de emissao (header "Issued On")
  validUntil: string | null;
  status: string;
  selectedIndex: number | null;
  // Aba "About Us": institucional da agencia (HTML sanitizado) + contato do tenant.
  aboutUs: {
    html: string | null;
    website: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    chatUrl: string | null; // link do chat (Altus AI), so http/https
  };
  // Aba "Notes": observacoes do consultor por cotacao (HTML sanitizado). null = sem notas.
  notesHtml: string | null;
  /**
   * Notas POS-EMISSAO: recados datados, publicados sem reemitir. Aparecem na
   * mesma aba, DEPOIS da observacao original — que fica congelada porque e
   * parte da proposta enviada. Mais recente primeiro. Retratadas nao vem.
   */
  notas: Array<{ ref: string; bodyHtml: string; createdAt: string }>;
  /**
   * Dados de CONTATO da escola por campus, lidos AO VIVO (nao do snapshot).
   *
   * O snapshot congela o que foi VENDIDO — preco, descricao, fotos da epoca.
   * Um link para o site da escola nao e termo comercial, e ponteiro: congela-lo
   * faria uma proposta antiga apontar para uma URL que a escola ja trocou, e
   * impediria que cotacoes ja emitidas ganhassem o link sem reemissao.
   * Mesma logica do cambio, que tambem e resolvido na abertura.
   */
  escolas: Record<string, { nome: string | null; website: string | null; favicon: string | null; social: LinkSocial[] }>;
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
    // F5: cada promocao com o PRAZO congelado ("valida ate") + descontos manuais
    // (rotulo generico). Cotacoes anteriores ao F5 tem as linhas SEM prazo
    // (validoAte null, promocao=false) — aparecem como "Desconto: <nome>".
    descontosDetalhados: DescontoLinha[];
    taxas: number;
    liquido: number;
    liquidoConvertido: number | null;
    depositAmount: number | null;
    depositCurrency: string | null;
    /** Entrada na moeda da opcao (deposito do consultor, ou taxas unicas nao
     *  reembolsaveis). Base do simulador de parcelas do portal. */
    entrada: number;
    /**
     * VET usado para converter ESTA opcao (BRL por 1 unidade da moeda dela), e
     * a data dessa cotacao. `fx.rate` no topo e so da moeda PRIMARIA da
     * cotacao — usa-lo numa opcao de outra moeda daria um R$ errado. null
     * quando nao ha cotacao para a moeda da opcao (nao da para simular).
     */
    vet: number | null;
    vetAt: string | null;
    itens: Array<{
      grupo: string;
      nome: string;
      startDate: string | null;
      endDate: string | null;
      quantity: number;
      unit: string;
      grossAmount: number;
      currency: string;
      ficha: FichaProduto | null;
      detalhes: DetalhesSnapshot;
    }>;
    taxasDetalhadas: Array<{ nome: string; amount: number; currency: string; isRefundable: boolean | null; basis: string | null; itemIndex: number | null }>;
    planoPagamento: {
      installmentsCount: number;
      firstDueDate: string | null;
      method: string | null;
      notes: string | null;
      parcelas: Array<{ sequence: number; dueDate: string; amount: number; currency: string; description: string | null }>;
    } | null;
  }>;
};

/** Busca a cotacao pelo token, aplicando as regras de visibilidade publica. */
async function carregarQuotePorToken(supabase: SupabaseClient, token: string) {
  const { data } = await supabase
    .from("quote")
    .select(
      "id, tenant_id, reference, locale, status, presentment_currency, source_currency, fx_rate, fx_rate_at, fx_source, issue_date, valid_until, token_revoked_at, selected_option_id, student_id, owner_user_id, notes_html",
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

// ---------------------------------------------------------------------------
// getQuoteConvertida — snapshot MINIMO (so marca + 1o nome + referencia) para o
// estado terminal "matricula ja confirmada" quando o link e reaberto DEPOIS da
// conversao (status 'converted'). Sem precos nem ids internos. Sem PII alem do
// primeiro nome. Retorna null se a cotacao nao esta convertida.
// ---------------------------------------------------------------------------

export type QuoteConvertida = {
  brand: string;
  brandSlug: string | null;
  logoUrl: string | null;
  studentFirstName: string;
  reference: string;
};

export async function getQuoteConvertida(
  supabase: SupabaseClient,
  token: string,
): Promise<QuoteConvertida | null> {
  const quote = await carregarQuotePorToken(supabase, token);
  if (!quote) return null;
  if (quote.status !== "converted") return null;

  const tenantId = quote.tenant_id as string;
  const { data: student } = await supabase
    .from("student")
    .select("first_name")
    .eq("tenant_id", tenantId)
    .eq("id", quote.student_id as string)
    .maybeSingle();
  const { data: tenant } = await supabase
    .from("tenant")
    .select("name, slug, logo_url")
    .eq("id", tenantId)
    .maybeSingle();

  return {
    brand: (tenant?.name as string) ?? "EXP Tour",
    brandSlug: (tenant?.slug as string) ?? null,
    logoUrl: (tenant?.logo_url as string) ?? null,
    studentFirstName: (student?.first_name as string) ?? "",
    reference: (quote.reference as string) ?? "",
  };
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
    .select("name, slug, logo_url, website, address, contact_email, contact_phone, about_us_html, chat_url")
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

  const localeQuote = ((quote.locale as string) || "pt-BR") as ContentLocale;
  const totais = await carregarTotaisPorOpcao(supabase, tenantId, quote.id as string, localeQuote);

  // CÂMBIO FLUTUANTE: o R$ é convertido pela cotacao_vet do DIA em que o link é
  // aberto (não pela taxa congelada na emissão). A dívida fica na moeda do curso
  // (valores de origem intactos) e o R$ acompanha o câmbio do dia — mesma regra
  // do Pix na Área do Cliente. Se o link for reaberto/encaminhado dias depois,
  // o R$ reflete o câmbio daquele dia.
  const frozenFxRate = quote.fx_rate != null ? toNum(quote.fx_rate) : null; // fallback
  const sourceCurrency = (quote.source_currency as string) ?? null;
  const hoje = hojeBrasilISO();
  const moedasOrigem = Array.from(new Set(totais.map((t) => t.currency).filter((c) => !!c && c !== presentment)));
  const vetPorMoeda = new Map<string, { vet: number; data: string }>();
  for (const moeda of moedasOrigem) {
    const { data: row } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet, data")
      .eq("moeda", moeda)
      .lte("data", hoje)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row && row.cotacao_vet != null) {
      vetPorMoeda.set(moeda, { vet: toNum(row.cotacao_vet), data: (row.data as string).slice(0, 10) });
    }
  }
  // Conversao e necessaria se QUALQUER opcao esta em moeda diferente da de
  // apresentacao. Antes dependia de haver uma moeda de origem unica: numa
  // cotacao com Londres (GBP) e Vancouver (CAD), `source_currency` e nulo e o
  // portal escondia a regua de parcelas e o valor em real das duas opcoes.
  const fxNecessario = moedasOrigem.length > 0;
  const vetPrimaria = sourceCurrency ? vetPorMoeda.get(sourceCurrency) ?? null : null;
  // Taxa do dia para a moeda de origem primária (com fallback ao congelado).
  const rateExibida = vetPrimaria?.vet ?? frozenFxRate;

  const selectedId = quote.selected_option_id as string | null;
  let selectedIndex: number | null = null;

  const options = totais.map((t, index) => {
    if (selectedId && t.option.id === selectedId) selectedIndex = index;
    const v = vetPorMoeda.get(t.currency);
    const vet = v?.vet ?? (t.currency === sourceCurrency ? frozenFxRate : null); // fallback só p/ moeda primária
    const liquidoConvertido =
      t.currency !== presentment && vet ? converterParaBRL(t.liquido, vet) : null;
    return {
      index,
      label: t.option.label,
      isRecommended: !!t.option.is_recommended,
      currency: t.currency,
      bruto: t.bruto,
      descontos: t.descontos,
      descontosDetalhados: t.descontosDetalhados,
      taxas: t.taxas,
      liquido: t.liquido,
      liquidoConvertido,
      depositAmount: t.option.deposit_amount != null ? toNum(t.option.deposit_amount) : null,
      depositCurrency: t.option.deposit_currency ?? null,
      entrada: entradaDaOpcao({
        moeda: t.currency,
        deposit: t.option.deposit_amount != null ? toNum(t.option.deposit_amount) : null,
        depositCurrency: (t.option.deposit_currency as string) ?? null,
        taxas: t.taxasDetalhadas,
      }),
      // Moeda da opcao == moeda de apresentacao: nao ha conversao, VET = 1.
      vet: t.currency === presentment ? 1 : vet,
      vetAt: t.currency === presentment ? null : v?.data ?? null,
      itens: t.itens,
      taxasDetalhadas: t.taxasDetalhadas,
      planoPagamento: t.planoPagamento,
    };
  });

  // Notas do consultor (aba "Notes") — HTML sanitizado; null quando vazio.
  const notesBruto = (quote.notes_html as string) ?? "";
  const notesHtml = notesBruto.trim() ? sanitizarHtml(notesBruto) || null : null;

  // Contato da escola (site), por campus presente na cotacao. AO VIVO — ver o
  // comentario do campo `escolas` em PublicQuote.
  const campusIds = Array.from(
    new Set(
      options
        .flatMap((o) => o.itens)
        .map((it) => it.detalhes?.escola?.campusId)
        .filter((id): id is string => !!id),
    ),
  );
  const escolas: Record<string, { nome: string | null; website: string | null; favicon: string | null; social: LinkSocial[] }> = {};
  if (campusIds.length > 0) {
    const { data: campusContato } = await supabase
      .from("campus")
      .select("id, website, supplier:supplier_id(display_name, website, favicon_url, social)")
      .eq("tenant_id", tenantId)
      .in("id", campusIds)
      .is("archived_at", null);
    for (const c of (campusContato ?? []) as any[]) {
      const sup = Array.isArray(c.supplier) ? c.supplier[0] : c.supplier;
      // Site do campus vence o da escola: nos 23 campi do tenant ele esta
      // sempre preenchido e e mais especifico (pagina daquela unidade).
      const bruto = ((c.website as string) || (sup?.website as string) || "").trim();
      // Defesa em profundidade no ponto de render: so http/https vai para href.
      escolas[c.id as string] = {
        // Nome da ESCOLA, nao o do campus: o snapshot guarda "Vancouver" (a
        // unidade), e o cliente precisa ler "VanWest College" na linha do preco.
        nome: ((sup?.display_name as string) ?? "").trim() || null,
        website: bruto && ehUrlHttp(bruto) ? bruto : null,
        // Favicon e redes sao da ESCOLA (supplier), nao da unidade.
        favicon: urlFavicon(sup?.favicon_url),
        social: parseRedes(sup?.social),
      };
    }
  }

  // Notas POS-EMISSAO (recados datados, sem reemitir). Retratadas ficam fora.
  //
  // NAO re-sanitizar aqui: `body_html` so e escrito por `addQuoteNote`, que
  // monta o HTML a partir de TEXTO PURO escapando uma unica vez, e o trigger
  // `quote_note_append_only` impede que a coluna seja alterada depois. Passar
  // por `sanitizarHtml` de novo escaparia o `&` outra vez (a funcao nao e
  // idempotente) e o aluno leria "Taxa &amp; seguro".
  //
  // O teto de 50 protege a pagina publica: nada impede que uma cotacao antiga
  // acumule notas, e todas iriam para o HTML.
  const { data: notasRows } = await supabase
    .from("quote_note")
    .select("id, body_html, created_at")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quote.id)
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  const notas = (notasRows ?? [])
    .map((n: any, i: number) => ({
      // Ordinal, nao o uuid: esta pagina nao publica identificador interno.
      ref: `n${i}`,
      bodyHtml: ((n.body_html as string) ?? "").trim(),
      createdAt: n.created_at as string,
    }))
    .filter((n) => n.bodyHtml !== "");
  // Institucional (aba "About Us") — HTML sanitizado.
  const aboutHtmlBruto = (tenant?.about_us_html as string) ?? "";
  const aboutHtml = aboutHtmlBruto.trim() ? sanitizarHtml(aboutHtmlBruto) || null : null;

  return {
    reference: quote.reference as string,
    locale: (quote.locale as string) || "pt-BR",
    studentFirstName: (student?.first_name as string) ?? "",
    brand: (tenant?.name as string) ?? "EXP Tour",
    brandSlug: (tenant?.slug as string) ?? null,
    logoUrl: (tenant?.logo_url as string) ?? null,
    consultant,
    issuedOn: (quote.issue_date as string) ?? null,
    validUntil: (quote.valid_until as string) ?? null,
    status: quote.status as string,
    selectedIndex,
    aboutUs: {
      html: aboutHtml,
      website: (tenant?.website as string) ?? null,
      address: (tenant?.address as string) ?? null,
      email: (tenant?.contact_email as string) ?? null,
      phone: (tenant?.contact_phone as string) ?? null,
      chatUrl: /^https?:\/\/[^\s]+$/i.test((tenant?.chat_url as string) ?? "") ? (tenant?.chat_url as string) : null,
    },
    notesHtml,
    notas,
    escolas,
    fx: {
      necessario: fxNecessario,
      rate: rateExibida,
      rateAt: vetPrimaria ? `${vetPrimaria.data}T00:00:00.000Z` : ((quote.fx_rate_at as string) ?? null),
      source: "BACEN PTAX + IOF 3,5% + spread 5% — cotação do dia",
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
  reference: string;
  optionIndex: number;
  currency: string; // moeda de origem da opcao (o contrato nasce nela)
  liquido: number; // total da opcao na moeda de origem
  entrada: number; // deposit na MESMA moeda (0 se moeda difere/ausente)
  dataInicio: string | null; // início do CURSO (item program); canônica p/ prazos (Cláusula 1.1.b)
  studentId: string | null; // o nome completo e resolvido no servico de checkout
  paisDestino: string | null;
  supplierId: string | null;
  contratoNome: string;
  // Linhas da opcao (com fornecedor resolvido) para semear o Anexo III multi-item.
  itens: Array<{
    grupo: string;
    nome: string | null;
    valor: number;
    moeda: string;
    startDate: string | null;
    fornecedor: string | null;
    politicaPagamento: string | null; // payment_terms do acordo vigente do fornecedor
  }>;
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

  // Data de inicio CANONICA (Clausula 1.1.b): a data de inicio do CURSO (item
  // 'program'), ainda que a acomodacao comece antes. Todos os prazos (quitacao
  // D-30, arrependimento, janela de parcelas) derivam dela. Fallback ao menor
  // start_date de todos os itens so quando nao ha item de programa com data.
  const inicioCurso = t.itens.find((i) => i.grupo === "program" && i.startDate)?.startDate ?? null;
  const datas = t.itens.map((i) => i.startDate).filter(Boolean) as string[];
  const dataInicio = inicioCurso ?? (datas.length ? datas.slice().sort()[0] : null);

  // Nome do contrato: nome do item de programa; senao 1o item; senao referencia.
  const progItem = t.itens.find((i) => i.grupo === "program") ?? t.itens[0];
  const contratoNome = (progItem?.nome as string) || (quote.reference as string) || "Programa";

  // O nome completo do estudante e resolvido no servico de checkout (fora do
  // servico do portal publico, que so pode expor o first_name). Aqui devolvemos
  // apenas o id.
  const studentId = (quote.student_id as string) ?? null;

  // Linhas da opcao + fornecedor por linha (resolvido em lote: campus->supplier).
  const { data: itensOpcao } = await supabase
    .from("quote_item")
    .select("\"group\", campus_id, product_snapshot, gross_amount, currency, start_date")
    .eq("tenant_id", tenantId)
    .eq("quote_option_id", selectedId)
    .order("sort", { ascending: true });
  const linhas = itensOpcao ?? [];

  // campus -> {supplier_id, country_code}
  const campusIds = Array.from(new Set(linhas.map((i) => i.campus_id as string).filter(Boolean)));
  const campusMap = new Map<string, { supplierId: string | null; country: string | null }>();
  if (campusIds.length > 0) {
    const { data: campi } = await supabase
      .from("campus")
      .select("id, supplier_id, country_code")
      .eq("tenant_id", tenantId)
      .in("id", campusIds);
    for (const c of campi ?? []) {
      campusMap.set(c.id as string, {
        supplierId: (c.supplier_id as string) ?? null,
        country: (c.country_code as string) ?? null,
      });
    }
  }
  // supplier -> display_name
  const supplierIds = Array.from(
    new Set(Array.from(campusMap.values()).map((c) => c.supplierId).filter(Boolean) as string[]),
  );
  const supplierNome = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: sups } = await supabase
      .from("supplier")
      .select("id, display_name")
      .eq("tenant_id", tenantId)
      .in("id", supplierIds);
    for (const s of sups ?? []) supplierNome.set(s.id as string, (s.display_name as string) ?? "");
  }

  // supplier -> payment_terms do ACORDO VIGENTE (pre-preenche a politica do Anexo
  // III). Vigente = valid_from <= hoje e (valid_until nulo ou >= hoje), nao
  // arquivado; entre os validos, o de valid_from mais recente. Batch por supplier.
  const hojePol = hojeBrasilISO();
  const supplierTermos = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: acordos } = await supabase
      .from("supplier_agreement")
      .select("supplier_id, payment_terms, valid_until")
      .eq("tenant_id", tenantId)
      .in("supplier_id", supplierIds)
      .is("archived_at", null)
      .lte("valid_from", hojePol)
      .order("valid_from", { ascending: false });
    for (const a of acordos ?? []) {
      const sid = a.supplier_id as string;
      if (supplierTermos.has(sid)) continue; // ja fixamos o mais recente valido
      const ate = (a.valid_until as string) ?? null;
      if (ate && ate < hojePol) continue; // vencido
      const termos = ((a.payment_terms as string) ?? "").trim();
      if (termos) supplierTermos.set(sid, termos);
    }
  }

  // Programa: define supplier/pais do contrato.
  const progLinha = linhas.find((i) => i.group === "program") ?? linhas[0];
  const progCampus = progLinha?.campus_id ? campusMap.get(progLinha.campus_id as string) : undefined;
  const supplierId = progCampus?.supplierId ?? null;
  const paisDestino = progCampus?.country ?? null;

  // Uma linha de Anexo III por item. O fornecedor sai do campus DA PROPRIA linha;
  // linha sem campus (ex.: seguro/servico de outro provedor) fica 'a confirmar'
  // (no motor puro) — melhor honesto do que atribuir a escola do programa por engano.
  const itens = linhas.map((i) => {
    const snap = (i.product_snapshot ?? {}) as Record<string, unknown>;
    const camp = i.campus_id ? campusMap.get(i.campus_id as string) : undefined;
    const sid = camp?.supplierId ?? null;
    const fornecedor = sid ? supplierNome.get(sid) ?? null : null;
    const politicaPagamento = sid ? supplierTermos.get(sid) ?? null : null;
    return {
      grupo: i.group as string,
      nome: (snap.name as string) ?? (snap.nome as string) ?? null,
      valor: toNum(i.gross_amount),
      moeda: (i.currency as string) || currency,
      startDate: (i.start_date as string) ?? null,
      fornecedor,
      politicaPagamento,
    };
  });

  return {
    tenantId,
    quoteId: quote.id as string,
    reference: (quote.reference as string) || "",
    optionIndex,
    currency,
    liquido,
    entrada,
    dataInicio,
    studentId,
    paisDestino,
    supplierId,
    contratoNome,
    itens,
  };
}
