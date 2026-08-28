// Extrato financeiro do fornecedor (doc 06 secao 3.6). SERVER-ONLY (service
// role). REGRA DE OURO: tudo filtrado pelo supplier_id da sessao — uma escola
// so ve os proprios repasses.
//
// A PREVISAO (bruto/comissao/liquido/vencimento D-30) e calculada AO VIVO a
// partir de contratos + supplier_agreement + prazo do fornecedor (motor puro
// payout-calc). O ledger supplier_payout (remessas executadas) so entra como
// "Pago" quando existe — dinheiro nunca vira estado por previsao.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularPrevisao,
  type AcordoComissao,
  type ComissaoBasis,
  type ComissaoType,
} from "@/lib/payout-calc";

export type StatusRepasse = "pago" | "previsto" | "cancelado";

export type LinhaExtrato = {
  contratoId: string;
  estudanteNome: string | null;
  programa: string | null;
  currency: string | null;
  // previsao
  grossAmount: number | null;
  commissionAmount: number | null;
  netAmount: number | null;
  comissaoDefinida: boolean;
  dueDate: string | null;
  diasAteVencimento: number | null;
  status: StatusRepasse;
  // ledger (preenchido quando ha remessa executada)
  payoutId: string | null;
  paidAt: string | null;
  paidNet: number | null;
  paidCurrency: string | null;
  reference: string | null;
  proofStoragePath: string | null;
  proofFilename: string | null;
};

export type ExtratoFornecedor = {
  prazoDias: number;
  temAcordo: boolean;
  linhas: LinhaExtrato[];
  // totais de liquido por moeda (para o resumo do topo).
  previstoPorMoeda: Record<string, number>;
  pagoPorMoeda: Record<string, number>;
};

type ContratoRow = {
  id: string;
  estudante_nome: string | null;
  nome: string | null;
  valor_total: number | null;
  moeda: string | null;
  data_inicio: string | null;
  cancelado_em: string | null;
  titular_id: string | null;
};

type PayoutRow = {
  id: string;
  contrato_id: string;
  currency: string | null;
  net_amount: number | null;
  paid_at: string | null;
  reference: string | null;
  proof_storage_path: string | null;
  proof_filename: string | null;
};

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Acordo de comissao VIGENTE do fornecedor: o mais recente cuja vigencia cobre
// hoje (valid_from <= hoje <= valid_until|inf), nao arquivado. Null se nao houver.
async function acordoVigente(
  supabase: SupabaseClient,
  supplierId: string,
  hoje: string
): Promise<AcordoComissao> {
  const { data } = await supabase
    .from("supplier_agreement")
    .select("commission_basis, commission_type, commission_value, currency, valid_from, valid_until")
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .lte("valid_from", hoje)
    .order("valid_from", { ascending: false });
  const linha = (data ?? []).find((a: any) => !a.valid_until || String(a.valid_until) >= hoje);
  if (!linha) return null;
  const a = linha as any;
  return {
    basis: a.commission_basis as ComissaoBasis,
    type: a.commission_type as ComissaoType,
    value: Number(a.commission_value),
    currency: a.currency ?? null,
  };
}

// Monta o extrato completo do fornecedor. Posse garantida pelo supplier_id.
export async function extratoDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string
): Promise<ExtratoFornecedor> {
  const hoje = hojeISO();

  const { data: supplier } = await supabase
    .from("supplier")
    .select("prazo_pagamento_dias")
    .eq("id", supplierId)
    .maybeSingle();
  const prazoDias = Number((supplier as { prazo_pagamento_dias?: number } | null)?.prazo_pagamento_dias);
  const prazo = Number.isFinite(prazoDias) && prazoDias >= 0 ? prazoDias : 30;

  const acordo = await acordoVigente(supabase, supplierId, hoje);

  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, estudante_nome, nome, valor_total, moeda, data_inicio, cancelado_em, titular_id")
    .eq("supplier_id", supplierId)
    .order("data_inicio", { ascending: true, nullsFirst: false });
  const linhasContrato = (contratos ?? []) as ContratoRow[];
  if (!linhasContrato.length) {
    return { prazoDias: prazo, temAcordo: !!acordo, linhas: [], previstoPorMoeda: {}, pagoPorMoeda: {} };
  }

  // Fallback de data_inicio pelo titular (mesmo criterio de acerto/regua).
  const titularIds = [...new Set(linhasContrato.map((c) => c.titular_id).filter(Boolean))] as string[];
  const dataInicioTitular = new Map<string, string | null>();
  if (titularIds.length) {
    const { data: titulares } = await supabase
      .from("titulares")
      .select("id, data_inicio")
      .in("id", titularIds);
    for (const t of (titulares ?? []) as { id: string; data_inicio: string | null }[]) {
      dataInicioTitular.set(t.id, t.data_inicio ?? null);
    }
  }

  // Ledger de remessas executadas destes contratos.
  const contratoIds = linhasContrato.map((c) => c.id);
  const { data: payouts } = await supabase
    .from("supplier_payout")
    .select("id, contrato_id, currency, net_amount, paid_at, reference, proof_storage_path, proof_filename")
    .eq("supplier_id", supplierId)
    .in("contrato_id", contratoIds)
    .order("paid_at", { ascending: false });
  // Ultima remessa por contrato (a lista ja vem por paid_at desc).
  const payoutPorContrato = new Map<string, PayoutRow>();
  for (const p of (payouts ?? []) as PayoutRow[]) {
    if (!payoutPorContrato.has(p.contrato_id)) payoutPorContrato.set(p.contrato_id, p);
  }

  const previstoPorMoeda: Record<string, number> = {};
  const pagoPorMoeda: Record<string, number> = {};
  const linhas: LinhaExtrato[] = linhasContrato.map((c) => {
    const dataInicio = c.data_inicio ?? (c.titular_id ? dataInicioTitular.get(c.titular_id) ?? null : null);
    const prev = calcularPrevisao({
      grossAmount: c.valor_total ?? null,
      currency: c.moeda ?? null,
      dataInicio,
      prazoDias: prazo,
      acordo,
      semanas: null, // Fatia 1 nao tem numero de semanas por caso; fixed_per_week fica "a definir".
      hoje,
    });
    const pago = payoutPorContrato.get(c.id) ?? null;
    const cancelado = !!c.cancelado_em;
    const status: StatusRepasse = cancelado ? "cancelado" : pago ? "pago" : "previsto";

    if (!cancelado) {
      if (pago && pago.net_amount != null) {
        const m = (pago.currency ?? prev.currency ?? "").toUpperCase();
        if (m) pagoPorMoeda[m] = (pagoPorMoeda[m] ?? 0) + Number(pago.net_amount);
      } else if (prev.netAmount != null && prev.currency) {
        previstoPorMoeda[prev.currency] = (previstoPorMoeda[prev.currency] ?? 0) + prev.netAmount;
      }
    }

    return {
      contratoId: c.id,
      estudanteNome: c.estudante_nome ?? null,
      programa: c.nome ?? null,
      currency: prev.currency,
      grossAmount: prev.grossAmount,
      commissionAmount: prev.commissionAmount,
      netAmount: prev.netAmount,
      comissaoDefinida: prev.comissaoDefinida,
      dueDate: prev.dueDate,
      diasAteVencimento: prev.diasAteVencimento,
      status,
      payoutId: pago?.id ?? null,
      paidAt: pago?.paid_at ?? null,
      paidNet: pago?.net_amount ?? null,
      paidCurrency: pago?.currency ?? null,
      reference: pago?.reference ?? null,
      proofStoragePath: pago?.proof_storage_path ?? null,
      proofFilename: pago?.proof_filename ?? null,
    };
  });

  return { prazoDias: prazo, temAcordo: !!acordo, linhas, previstoPorMoeda, pagoPorMoeda };
}

// Posse do comprovante: devolve o storage path do payout SE ele for deste
// fornecedor. Usado pela rota de download (URL assinada). Null = nada a servir.
export async function comprovanteDoFornecedor(
  supabase: SupabaseClient,
  supplierId: string,
  payoutId: string
): Promise<{ path: string; filename: string | null } | null> {
  const { data } = await supabase
    .from("supplier_payout")
    .select("supplier_id, proof_storage_path, proof_filename")
    .eq("id", payoutId)
    .maybeSingle();
  const row = data as { supplier_id?: string; proof_storage_path?: string | null; proof_filename?: string | null } | null;
  if (!row || row.supplier_id !== supplierId || !row.proof_storage_path) return null;
  return { path: row.proof_storage_path, filename: row.proof_filename ?? null };
}
