// Data layer do Extrato de Saldo Devedor (Clausulas 6.8 / 7.12). Server-only:
// service role. Escopado por POSSE (o contrato tem de ser do titular) -> senao
// null (404). Reune contrato + parcelas (saldo autoritativo) + pagamentos
// (movimentos com cotacao) + cotacao do dia, e delega ao motor puro.
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarExtratoSaldo, diasEntre, type ExtratoSaldo, type MovimentoInput } from "@/lib/extrato-saldo";
import { saldoDevedorMoeda, dataLimiteQuitacao } from "@/lib/parcelas";
import { calcularMoraSaldo, type MoraResultado } from "@/lib/mora";
import { recomporVetTenant } from "@/lib/cambio";
import { carregarConfigTenant, tenantDoTitular } from "@/lib/tenant-config";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function carregarExtrato(
  supabase: SupabaseClient,
  titularId: string,
  contratoId: string,
): Promise<{ extrato: ExtratoSaldo; programaNome: string; mora: MoraResultado } | null> {
  // POSSE: o contrato tem de ser DESTE titular.
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, nome, moeda, valor_total, data_inicio, created_at, cancelado_em")
    .eq("id", contratoId)
    .eq("titular_id", titularId)
    .maybeSingle();
  if (!contrato) return null;

  const moeda = (contrato.moeda as string) || "BRL";

  // Parcelas do contrato -> saldo AUTORITATIVO (soma do valor_atual das nao pagas).
  const { data: parcelas } = await supabase
    .from("parcelas")
    .select("valor_atual, status")
    .eq("contrato_id", contratoId);
  const saldoAtualMoeda = saldoDevedorMoeda(
    (parcelas ?? []).map((p) => ({ valor_atual: p.valor_atual as number, status: p.status as string })),
  );

  // Pagamentos (movimentos) em ordem cronologica, com a cotacao aplicada. A
  // descricao vem da parcela correspondente (fallback generico).
  const { data: pags } = await supabase
    .from("pagamentos")
    .select("id, parcela_id, valor_programa, cotacao_aplicada, valor_brl, pago_em")
    .eq("contrato_id", contratoId)
    .order("pago_em", { ascending: true });

  // Saldo autoritativo CONGELADO por pagamento (deploy-safe: em banco sem a coluna
  // o select retorna erro -> caimos no saldo derivado no motor).
  const frozenPorPag = new Map<string, number>();
  const { data: fz, error: fzErr } = await supabase
    .from("pagamentos")
    .select("id, saldo_apos_moeda")
    .eq("contrato_id", contratoId);
  if (!fzErr) {
    for (const f of fz ?? []) {
      const v = num(f.saldo_apos_moeda);
      if (v != null) frozenPorPag.set(f.id as string, v);
    }
  }

  const parcelaIds = Array.from(new Set((pags ?? []).map((p) => p.parcela_id as string).filter(Boolean)));
  const descricaoPorParcela = new Map<string, string>();
  if (parcelaIds.length > 0) {
    const { data: descr } = await supabase
      .from("parcelas")
      .select("id, descricao")
      .eq("contrato_id", contratoId) // defesa-em-profundidade: descricao so deste contrato
      .in("id", parcelaIds);
    for (const d of descr ?? []) descricaoPorParcela.set(d.id as string, (d.descricao as string) || "Pagamento");
  }

  const pagamentos: MovimentoInput[] = (pags ?? []).map((p) => ({
    data: (p.pago_em as string) ?? "",
    descricao: descricaoPorParcela.get(p.parcela_id as string) || "Pagamento",
    amortizacaoMoeda: num(p.valor_programa) ?? 0,
    cotacao: num(p.cotacao_aplicada),
    valorBRL: num(p.valor_brl),
    saldoFrozen: frozenPorPag.get(p.id as string) ?? null,
  }));

  // Percentuais de cambio + mora por TENANT (linha do tenant -> env -> default).
  const cfg = await carregarConfigTenant(supabase, await tenantDoTitular(supabase, titularId));

  // Cotacao do dia (VET) da moeda -> valor de quitacao hoje. A linha de
  // cotacoes_cambio guarda a VET GLOBAL; recompomos para o spread/IOF deste
  // tenant (mesma logica do gerar-cobranca) para o "valor hoje" exibido bater
  // com o que a cobranca realmente geraria. Tudo-ou-nada: so recompoe com os dois
  // percentuais finitos; senao mostra a VET global.
  const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  let cotacaoHoje: number | null = null;
  if (moeda && moeda !== "BRL") {
    // Deploy-safe: se spread/iof faltarem no ambiente, o select erra -> cot null
    // -> cotacaoHoje null -> "valor hoje" simplesmente nao aparece (degrada, nao
    // quebra). Em producao as colunas existem (o gerar-cobranca ja depende delas).
    const { data: cot } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet, spread, iof")
      .eq("moeda", moeda)
      .lte("data", hojeISO)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    cotacaoHoje = num(cot?.cotacao_vet);
    const spreadArmazenado = num(cot?.spread);
    const iofArmazenado = num(cot?.iof);
    if (cotacaoHoje != null && spreadArmazenado != null && iofArmazenado != null) {
      cotacaoHoje = recomporVetTenant(cotacaoHoje, spreadArmazenado, iofArmazenado, cfg.spreadCambio, cfg.iofCambio);
    }
  }

  const dataLimite = dataLimiteQuitacao((contrato.data_inicio as string) ?? null);
  const extrato = montarExtratoSaldo({
    moeda,
    valorTotal: num(contrato.valor_total) ?? 0,
    dataAbertura: (contrato.created_at as string) ?? (contrato.data_inicio as string) ?? null,
    dataLimiteQuitacao: dataLimite,
    hojeISO,
    cotacaoHoje,
    saldoAtualMoeda,
    pagamentos,
  });

  // Encargos de mora (Clausula 13): dias de atraso = hoje - data-limite de
  // quitacao (>0 so apos vencer). Percentuais VIGENTES por instancia. Contrato
  // CANCELADO nao acumula mora (o motor de acerto assume o saldo) -> saldo 0.
  const cancelado = !!(contrato.cancelado_em as string | null);
  const diasAtraso = dataLimite ? diasEntre(dataLimite, hojeISO) ?? 0 : 0;
  // Reusa a mesma cfg do tenant carregada acima (mora + cambio da instancia).
  const mora = calcularMoraSaldo({
    saldoMoeda: cancelado ? 0 : saldoAtualMoeda,
    diasAtraso,
    multaPercent: cfg.moraMulta,
    jurosMesPercent: cfg.moraJurosMes,
    indicePercent: cfg.moraIndice,
  });

  return { extrato, programaNome: (contrato.nome as string) || "Programa", mora };
}
