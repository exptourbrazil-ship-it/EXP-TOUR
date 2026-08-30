// Data layer do recibo itemizado (Clausula 6.5.2). Server-only: service role.
// Carrega um pagamento escopado por POSSE (o contrato tem de ser do titular) e
// monta a entrada do motor puro. O SALDO remanescente na moeda e reconstruido do
// LEDGER imutavel — valor_total do contrato menos a soma das amortizacoes ate a
// data deste pagamento (inclusive) — sem coluna nova e historicamente fiel.
import type { SupabaseClient } from "@supabase/supabase-js";
import { itemizarRecibo, SPREAD_LEGADO, IOF_LEGADO } from "@/lib/cambio";
import { montarReciboView, type ReciboView } from "@/lib/recibo-view";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function carregarRecibo(
  supabase: SupabaseClient,
  titularId: string,
  pagamentoId: string,
): Promise<ReciboView | null> {
  const { data: pag } = await supabase
    .from("pagamentos")
    .select("id, parcela_id, contrato_id, moeda, valor_programa, cotacao_aplicada, valor_brl, pago_em")
    .eq("id", pagamentoId)
    .maybeSingle();
  if (!pag) return null;

  // POSSE: o contrato do pagamento tem de ser DESTE titular. Senao, 404.
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, valor_total")
    .eq("id", pag.contrato_id)
    .eq("titular_id", titularId)
    .maybeSingle();
  if (!contrato) return null;

  // Parcela: descricao + spread/IOF CONGELADOS na cobranca (mesmos que compuseram
  // a VET). Ausentes (cobranca antiga) -> legado; o recibo do que ja foi pago
  // permanece como estava.
  const { data: parcela } = await supabase
    .from("parcelas")
    .select("descricao, spread_aplicado, iof_aplicado")
    .eq("id", pag.parcela_id)
    .maybeSingle();
  const spreadFrozen = num(parcela?.spread_aplicado);
  const iofFrozen = num(parcela?.iof_aplicado);
  const legado = spreadFrozen == null;
  const spread = spreadFrozen ?? SPREAD_LEGADO;
  const iof = iofFrozen ?? IOF_LEGADO;

  const moeda = (pag.moeda as string) || "BRL";
  const valorPrograma = num(pag.valor_programa) ?? 0;
  const vet = num(pag.cotacao_aplicada);
  const semCambio = vet == null || vet <= 0;

  const corte = pag.pago_em as string;

  // Saldo remanescente na moeda (Clausula 6.5.2 (f)). Preferencia: o valor
  // CONGELADO no pagamento (fiel ao instante, imune a alteracao de escopo E3).
  // Best-effort e deploy-safe: em banco ainda nao migrado o select da coluna
  // retorna erro -> caimos na reconstrucao.
  let saldoRestanteMoeda: number | null = null;
  const { data: frozen, error: frozenErr } = await supabase
    .from("pagamentos")
    .select("saldo_apos_moeda")
    .eq("id", pagamentoId)
    .maybeSingle();
  if (!frozenErr) saldoRestanteMoeda = num(frozen?.saldo_apos_moeda);

  // Fallback (cobrancas antigas sem o saldo congelado): reconstrucao do ledger
  // imutavel = valor_total menos as amortizacoes ate o corte. DEDUP por parcela
  // (uma amortizacao por parcela) para nao subestimar o saldo se houver recobranca
  // com mais de um pagamento aprovado na mesma parcela.
  if (saldoRestanteMoeda == null) {
    const { data: ledger } = await supabase
      .from("pagamentos")
      .select("parcela_id, valor_programa, pago_em, id")
      .eq("contrato_id", pag.contrato_id);
    const porParcela = new Map<string, number>();
    for (const l of ledger ?? []) {
      const quando = l.pago_em as string;
      const incluir = quando < corte || (quando === corte && (l.id as string) <= (pag.id as string));
      if (incluir) porParcela.set(l.parcela_id as string, num(l.valor_programa) ?? 0);
    }
    let amortizadoAcumulado = 0;
    for (const v of porParcela.values()) amortizadoAcumulado += v;
    const valorTotal = num(contrato.valor_total);
    saldoRestanteMoeda =
      valorTotal != null ? Math.max(0, Math.round((valorTotal - amortizadoAcumulado) * 100) / 100) : null;
  }

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));

  if (semCambio) {
    return montarReciboView({
      descricao: (parcela?.descricao as string) || "Pagamento",
      dataFormatada: fmt(corte),
      moeda,
      semCambio: true,
      ptax: 0, subtotal: 0, taxaPercentual: spread, taxaIntermediacao: 0, iofPercentual: iof, iof: 0,
      totalBRL: num(pag.valor_brl) ?? valorPrograma,
      amortizacaoMoeda: valorPrograma,
      saldoRestanteMoeda,
      legado: false,
    });
  }

  const itens = itemizarRecibo(valorPrograma, vet as number, spread, iof);
  return montarReciboView({
    descricao: (parcela?.descricao as string) || "Pagamento",
    dataFormatada: fmt(corte),
    moeda,
    semCambio: false,
    ptax: itens.ptax,
    subtotal: itens.subtotal,
    taxaPercentual: itens.taxaPercentual,
    taxaIntermediacao: itens.taxaIntermediacao,
    iofPercentual: itens.iofPercentual,
    iof: itens.iof,
    totalBRL: itens.totalBRL,
    amortizacaoMoeda: itens.amortizacaoMoeda,
    saldoRestanteMoeda,
    legado,
  });
}

// Mapa parcela_id -> pagamento_id para o contrato (link do recibo por parcela).
export async function pagamentosPorParcela(
  supabase: SupabaseClient,
  contratoIds: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (contratoIds.length === 0) return mapa;
  const { data } = await supabase
    .from("pagamentos")
    .select("id, parcela_id, pago_em")
    .in("contrato_id", contratoIds)
    .order("pago_em", { ascending: true });
  for (const p of data ?? []) {
    // Ultimo pagamento vence (mais recente) — normalmente ha 1 por parcela.
    mapa.set(p.parcela_id as string, p.id as string);
  }
  return mapa;
}
