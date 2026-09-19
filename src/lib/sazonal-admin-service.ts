// Servico do AJUSTE SAZONAL (alta/baixa temporada) da acomodacao — CRUD do hub.
// Isto entra direto na cotacao do cliente, entao:
//  - POSSE em toda operacao: o produto tem que ser do TENANT e, quando o fluxo
//    vem do hub, do FORNECEDOR daquela URL (campus.supplier_id).
//  - Faixas de duracao sobrepostas sao RECUSADAS (cobrariam o mesmo periodo duas
//    vezes na mesma estadia).
//  - Arquivar em vez de apagar: cotacoes ja emitidas guardam o valor congelado,
//    mas o rastro de quem cobrava o que precisa sobreviver.
//  - Auditoria em toda mutacao.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { validarAjusteSazonal, faixasSobrepostas, periodosSobrepostos, type EntradaSazonal, type FalhaCampo } from "@/lib/sazonal-admin";

export type AjusteSazonalLinha = {
  id: string;
  /** true = ajuste do CAMPUS inteiro (product_id nulo): cobrado, mas editado no campus. */
  doCampus: boolean;
  name: string;
  kind: "high_season" | "low_season" | "other";
  amountPerWeek: number;
  currency: string;
  fromMonth: number; fromDay: number; fromYear: number | null;
  toMonth: number; toDay: number; toYear: number | null;
  minWeeks: number | null;
  maxWeeks: number | null;
  sourceText: string | null;
};

export class SazonalErro extends Error {
  constructor(
    readonly codigo: "validacao" | "produto_invalido" | "nao_encontrado" | "faixa_sobreposta" | "falha_persistir",
    readonly falhas?: FalhaCampo[],
  ) {
    super(codigo);
  }
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rotulo do periodo como a escola publica ("14/jun a 23/ago"). */
export function rotuloPeriodo(a: Pick<AjusteSazonalLinha, "fromMonth" | "fromDay" | "fromYear" | "toMonth" | "toDay" | "toYear">): string {
  const p = (m: number, d: number, y: number | null) => `${d}/${MESES[m - 1]}${y ? `/${y}` : ""}`;
  return `${p(a.fromMonth, a.fromDay, a.fromYear)} a ${p(a.toMonth, a.toDay, a.toYear)}`;
}

function mapear(r: any): AjusteSazonalLinha {
  return {
    id: r.id,
    doCampus: r.product_id == null,
    name: r.name,
    kind: r.kind,
    amountPerWeek: Number(r.amount_per_week),
    currency: r.currency,
    fromMonth: r.from_month, fromDay: r.from_day, fromYear: r.from_year ?? null,
    toMonth: r.to_month, toDay: r.to_day, toYear: r.to_year ?? null,
    minWeeks: r.min_weeks ?? null,
    maxWeeks: r.max_weeks ?? null,
    sourceText: r.source_text ?? null,
  };
}

/**
 * Confere que o produto e do tenant (e do fornecedor, quando informado) e devolve
 * o campus. Sem isso, um productId de outra escola criaria ajuste no catalogo alheio.
 */
async function produtoComPosse(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
  supplierIdEsperado?: string,
): Promise<{ campusId: string; currency: string }> {
  const { data: produto, error } = await supabase
    .from("product")
    .select("id, campus_id, kind, archived_at")
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new SazonalErro("falha_persistir");
  if (!produto || produto.archived_at) throw new SazonalErro("produto_invalido");

  const { data: campus } = await supabase
    .from("campus")
    .select("id, supplier_id, base_currency")
    .eq("tenant_id", tenantId)
    .eq("id", produto.campus_id as string)
    .maybeSingle();
  if (!campus) throw new SazonalErro("produto_invalido");
  if (supplierIdEsperado && campus.supplier_id !== supplierIdEsperado) {
    throw new SazonalErro("produto_invalido");
  }
  return { campusId: campus.id as string, currency: campus.base_currency as string };
}

/**
 * Ajustes ATIVOS que incidem sobre este produto: os dele E os do CAMPUS inteiro
 * (product_id nulo). Listar so os do produto escondia do operador um ajuste que
 * ESTA sendo cobrado — ele criava outro por cima e o aluno pagava os dois.
 * Exige o campus para o escopo; use `campusDoProduto` quando nao tiver em maos.
 */
export async function listarAjustesSazonais(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
  campusId?: string,
): Promise<AjusteSazonalLinha[]> {
  const campus = campusId ?? (await campusDoProduto(supabase, tenantId, productId));
  let q = supabase
    .from("seasonal_adjustment")
    .select("id, product_id, name, kind, amount_per_week, currency, from_month, from_day, from_year, to_month, to_day, to_year, min_weeks, max_weeks, source_text")
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  q = campus
    ? q.eq("campus_id", campus).or(`product_id.is.null,product_id.eq.${productId}`)
    : q.eq("product_id", productId);
  const { data } = await q.order("kind").order("from_month").order("from_day");
  return (data ?? []).map(mapear);
}

/** Campus do produto (nulo quando o produto nao existe neste tenant). */
export async function campusDoProduto(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("product")
    .select("campus_id")
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .maybeSingle();
  return (data?.campus_id as string | undefined) ?? null;
}

/** Cria ou edita um ajuste. `id` no corpo = edicao. */
export async function salvarAjusteSazonal(
  supabase: SupabaseClient,
  args: { tenantId: string; corpo: unknown; actor: string; ip?: string | null; supplierIdEsperado?: string },
): Promise<{ id: string; criado: boolean }> {
  const v = validarAjusteSazonal(args.corpo);
  if (!v.ok) throw new SazonalErro("validacao", v.falhas);
  const d: EntradaSazonal = v.dados;

  const { campusId, currency: moedaCampus } = await produtoComPosse(
    supabase, args.tenantId, d.productId, args.supplierIdEsperado,
  );

  // Moeda tem que ser a do campus: em moeda diferente o motor DESCARTA o ajuste
  // (nao sabe converter) e a cotacao sai sem o suplemento, em silencio.
  if (moedaCampus && d.currency !== moedaCampus) {
    throw new SazonalErro("validacao", [
      { campo: "currency", erro: `Use a moeda do campus (${moedaCampus}) — em outra moeda o ajuste não é aplicado.` },
    ]);
  }

  // Sobreposicao cobraria a mesma noite duas vezes. Compara por DATAS (nao por
  // periodo identico) contra os ajustes do produto E os do campus inteiro.
  const existentes = await listarAjustesSazonais(supabase, args.tenantId, d.productId, campusId);
  const concorrentes = existentes.filter(
    (e) => e.id !== d.id && e.kind === d.kind && periodosSobrepostos(e, d),
  );
  if (faixasSobrepostas(d, concorrentes)) throw new SazonalErro("faixa_sobreposta");

  const linha = {
    name: d.name,
    kind: d.kind,
    amount_per_week: d.amountPerWeek,
    currency: d.currency,
    from_month: d.fromMonth, from_day: d.fromDay, from_year: d.fromYear,
    to_month: d.toMonth, to_day: d.toDay, to_year: d.toYear,
    min_weeks: d.minWeeks, max_weeks: d.maxWeeks,
  };

  let id: string;
  let criado: boolean;
  let antes: AjusteSazonalLinha | null = null;
  if (d.id) {
    // Estado anterior para a trilha (CLAUDE.md: auditoria antes/depois em mutacao
    // de dinheiro) — sem isso ninguem reconstroi um 40 que virou 400.
    antes = existentes.find((e) => e.id === d.id) ?? null;
    const { data: upd, error } = await supabase
      .from("seasonal_adjustment")
      // source_text guarda o que a ESCOLA publicou. Depois de editar a mao, ele
      // deixaria de confirmar o valor mostrado — some e o rotulo desaparece.
      .update({ ...linha, source_text: null, updated_at: new Date().toISOString() })
      .eq("tenant_id", args.tenantId)
      .eq("id", d.id)
      .eq("product_id", d.productId) // guarda extra: o id tem que ser DESTE produto
      .select("id");
    if (error) {
      console.error("[sazonal] atualizar:", error.message);
      throw new SazonalErro("falha_persistir");
    }
    if (!upd || upd.length === 0) throw new SazonalErro("nao_encontrado");
    id = d.id;
    criado = false;
  } else {
    const { data, error } = await supabase
      .from("seasonal_adjustment")
      .insert({ tenant_id: args.tenantId, campus_id: campusId, product_id: d.productId, ...linha })
      .select("id")
      .single();
    if (error || !data) {
      if (error) console.error("[sazonal] criar:", error.message);
      throw new SazonalErro("falha_persistir");
    }
    id = (data as { id: string }).id;
    criado = true;
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.actor,
    acao: criado ? "sazonal.criar" : "sazonal.editar",
    alvo: id,
    detalhe: {
      product_id: d.productId,
      kind: d.kind,
      amount_per_week: d.amountPerWeek,
      currency: d.currency,
      periodo: rotuloPeriodo({ fromMonth: d.fromMonth, fromDay: d.fromDay, fromYear: d.fromYear ?? null, toMonth: d.toMonth, toDay: d.toDay, toYear: d.toYear ?? null }),
      min_weeks: d.minWeeks, max_weeks: d.maxWeeks,
      ...(antes
        ? { antes: { amount_per_week: antes.amountPerWeek, currency: antes.currency, periodo: rotuloPeriodo(antes), min_weeks: antes.minWeeks, max_weeks: antes.maxWeeks, name: antes.name } }
        : {}),
    },
    ip: args.ip ?? null,
  });

  return { id, criado };
}

/** Arquiva (para de cobrar). Idempotente; nao apaga o rastro. */
export async function arquivarAjusteSazonal(
  supabase: SupabaseClient,
  args: { tenantId: string; id: string; productId: string; actor: string; ip?: string | null; supplierIdEsperado?: string },
): Promise<void> {
  await produtoComPosse(supabase, args.tenantId, args.productId, args.supplierIdEsperado);

  const { data: upd, error } = await supabase
    .from("seasonal_adjustment")
    .update({ status: "archived", archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("tenant_id", args.tenantId)
    .eq("id", args.id)
    .eq("product_id", args.productId)
    .select("id");
  if (error) {
    console.error("[sazonal] arquivar:", error.message);
    throw new SazonalErro("falha_persistir");
  }
  if (!upd || upd.length === 0) throw new SazonalErro("nao_encontrado");

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.actor,
    acao: "sazonal.arquivar",
    alvo: args.id,
    detalhe: { product_id: args.productId },
    ip: args.ip ?? null,
  });
}
