// Contas a pagar ao fornecedor (Fatia 2). SERVER-ONLY (service role). O Admin
// (financeiro) vê as previsões de repasse ainda não executadas e REGISTRA a
// remessa executada (supplier_payout) — a única coisa que muda estado de
// dinheiro, sempre por ação auditada. A previsão em si é derivada ao vivo pelo
// motor puro (payout-calc); aqui ela é montada cruzando contratos + acordos.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularPrevisao,
  validarValoresRepasse,
  type AcordoComissao,
  type ComissaoBasis,
  type ComissaoType,
} from "@/lib/payout-calc";
import { avaliarTravaRemessa, type TravaRemessa } from "@/lib/trava-remessa";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export type ContaAPagar = {
  contratoId: string;
  supplierId: string;
  supplierNome: string | null;
  estudanteNome: string | null;
  programa: string | null;
  currency: string | null;
  grossAmount: number | null;
  commissionAmount: number | null;
  netAmount: number | null;
  comissaoDefinida: boolean;
  dueDate: string | null;
  diasAteVencimento: number | null;
  trava: TravaRemessa; // trava da remessa (arrependimento / processamento imediato)
};

type ContratoRow = {
  id: string;
  estudante_nome: string | null;
  nome: string | null;
  valor_total: number | null;
  moeda: string | null;
  data_inicio: string | null;
  cancelado_em: string | null;
  created_at: string | null;
  processamento_imediato: boolean | null;
  titular_id: string | null;
  supplier_id: string;
  supplier: { id: string; display_name: string | null; tenant_id: string; prazo_pagamento_dias: number | null } | { id: string; display_name: string | null; tenant_id: string; prazo_pagamento_dias: number | null }[] | null;
};

type AgreementRow = {
  supplier_id: string;
  commission_basis: string;
  commission_type: string;
  commission_value: number;
  currency: string | null;
  valid_from: string;
  valid_until: string | null;
};

function sup(r: ContratoRow): { id: string; display_name: string | null; tenant_id: string; prazo_pagamento_dias: number | null } | null {
  const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
  return s ?? null;
}

// Acordo vigente por fornecedor (o mais recente que cobre hoje), em lote.
function acordosVigentes(agreements: AgreementRow[], hoje: string): Map<string, AcordoComissao> {
  // Já ordenado por valid_from desc na consulta; o primeiro válido por supplier vence.
  const out = new Map<string, AcordoComissao>();
  for (const a of agreements) {
    if (out.has(a.supplier_id)) continue;
    if (a.valid_from > hoje) continue;
    if (a.valid_until && String(a.valid_until) < hoje) continue;
    out.set(a.supplier_id, {
      basis: a.commission_basis as ComissaoBasis,
      type: a.commission_type as ComissaoType,
      value: Number(a.commission_value),
      currency: a.currency ?? null,
    });
  }
  return out;
}

// Fila de contas a pagar: previsões de repasse dos casos NÃO cancelados e SEM
// remessa executada, do tenant. Ordenadas por vencimento (mais urgente antes).
export async function listarContasAPagar(
  supabase: SupabaseClient,
  tenantId: string
): Promise<ContaAPagar[]> {
  const hoje = hojeISO();

  const { data: contratos } = await supabase
    .from("contratos")
    .select(
      "id, estudante_nome, nome, valor_total, moeda, data_inicio, cancelado_em, created_at, processamento_imediato, titular_id, supplier_id, supplier:supplier(id, display_name, tenant_id, prazo_pagamento_dias)"
    )
    .not("supplier_id", "is", null)
    .is("cancelado_em", null);
  const linhas = ((contratos ?? []) as ContratoRow[]).filter((c) => sup(c)?.tenant_id === tenantId);
  if (!linhas.length) return [];

  const supplierIds = [...new Set(linhas.map((c) => c.supplier_id))];
  const contratoIds = linhas.map((c) => c.id);

  // Casos que JÁ têm remessa registrada saem da fila (Fatia 2 trata 1 remessa
  // por caso na fila; remessas adicionais são exceção fora daqui).
  const { data: pagos } = await supabase
    .from("supplier_payout")
    .select("contrato_id")
    .eq("tenant_id", tenantId)
    .in("contrato_id", contratoIds);
  const jaPago = new Set((pagos ?? []).map((p) => (p as { contrato_id: string }).contrato_id));

  // Acordos vigentes (lote).
  const { data: agreements } = await supabase
    .from("supplier_agreement")
    .select("supplier_id, commission_basis, commission_type, commission_value, currency, valid_from, valid_until")
    .in("supplier_id", supplierIds)
    .is("archived_at", null)
    .order("valid_from", { ascending: false });
  const acordos = acordosVigentes((agreements ?? []) as AgreementRow[], hoje);

  // Fallback de data_inicio pelo titular.
  const titularIds = [...new Set(linhas.map((c) => c.titular_id).filter(Boolean))] as string[];
  const dataInicioTitular = new Map<string, string | null>();
  if (titularIds.length) {
    const { data: titulares } = await supabase.from("titulares").select("id, data_inicio").in("id", titularIds);
    for (const t of (titulares ?? []) as { id: string; data_inicio: string | null }[]) {
      dataInicioTitular.set(t.id, t.data_inicio ?? null);
    }
  }

  const contas: ContaAPagar[] = [];
  for (const c of linhas) {
    if (jaPago.has(c.id)) continue;
    const s = sup(c);
    const prazoRaw = Number(s?.prazo_pagamento_dias);
    const prazo = Number.isFinite(prazoRaw) && prazoRaw >= 0 ? prazoRaw : 30;
    const dataInicio = c.data_inicio ?? (c.titular_id ? dataInicioTitular.get(c.titular_id) ?? null : null);
    const prev = calcularPrevisao({
      grossAmount: c.valor_total ?? null,
      currency: c.moeda ?? null,
      dataInicio,
      prazoDias: prazo,
      acordo: acordos.get(c.supplier_id) ?? null,
      semanas: null,
      hoje,
    });
    contas.push({
      contratoId: c.id,
      supplierId: c.supplier_id,
      supplierNome: s?.display_name ?? null,
      estudanteNome: c.estudante_nome ?? null,
      programa: c.nome ?? null,
      currency: prev.currency,
      grossAmount: prev.grossAmount,
      commissionAmount: prev.commissionAmount,
      netAmount: prev.netAmount,
      comissaoDefinida: prev.comissaoDefinida,
      dueDate: prev.dueDate,
      diasAteVencimento: prev.diasAteVencimento,
      trava: avaliarTravaRemessa({
        aceiteISO: c.created_at ?? null,
        agoraISO: new Date().toISOString(),
        processamentoImediato: !!c.processamento_imediato,
      }),
    });
  }

  // Mais urgente primeiro: vencidos/próximos no topo; sem data no fim.
  contas.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
  return contas;
}

// Detalhe de UM caso para a tela de execução da remessa. Recheca o tenant
// (via supplier.tenant_id) e que o caso ainda não foi pago. Null = não elegível.
export async function obterCasoParaRepasse(
  supabase: SupabaseClient,
  tenantId: string,
  contratoId: string
): Promise<(ContaAPagar & { jaPago: boolean }) | null> {
  const { data } = await supabase
    .from("contratos")
    .select(
      "id, estudante_nome, nome, valor_total, moeda, data_inicio, cancelado_em, created_at, processamento_imediato, titular_id, supplier_id, supplier:supplier(id, display_name, tenant_id, prazo_pagamento_dias)"
    )
    .eq("id", contratoId)
    .maybeSingle();
  const c = data as ContratoRow | null;
  if (!c || !c.supplier_id) return null;
  const s = sup(c);
  if (!s || s.tenant_id !== tenantId) return null;
  if (c.cancelado_em) return null;

  const hoje = hojeISO();
  const { data: pagos } = await supabase
    .from("supplier_payout")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("contrato_id", contratoId);
  const jaPago = (pagos ?? []).length > 0;

  const { data: agreements } = await supabase
    .from("supplier_agreement")
    .select("supplier_id, commission_basis, commission_type, commission_value, currency, valid_from, valid_until")
    .eq("supplier_id", c.supplier_id)
    .is("archived_at", null)
    .order("valid_from", { ascending: false });
  const acordo = acordosVigentes((agreements ?? []) as AgreementRow[], hoje).get(c.supplier_id) ?? null;

  let dataInicio = c.data_inicio ?? null;
  if (!dataInicio && c.titular_id) {
    const { data: titular } = await supabase.from("titulares").select("data_inicio").eq("id", c.titular_id).maybeSingle();
    dataInicio = (titular as { data_inicio?: string | null } | null)?.data_inicio ?? null;
  }
  const prazoRaw = Number(s.prazo_pagamento_dias);
  const prazo = Number.isFinite(prazoRaw) && prazoRaw >= 0 ? prazoRaw : 30;
  const prev = calcularPrevisao({
    grossAmount: c.valor_total ?? null,
    currency: c.moeda ?? null,
    dataInicio,
    prazoDias: prazo,
    acordo,
    semanas: null,
    hoje,
  });

  return {
    contratoId: c.id,
    supplierId: c.supplier_id,
    supplierNome: s.display_name ?? null,
    estudanteNome: c.estudante_nome ?? null,
    programa: c.nome ?? null,
    currency: prev.currency,
    grossAmount: prev.grossAmount,
    commissionAmount: prev.commissionAmount,
    netAmount: prev.netAmount,
    comissaoDefinida: prev.comissaoDefinida,
    dueDate: prev.dueDate,
    diasAteVencimento: prev.diasAteVencimento,
    trava: avaliarTravaRemessa({
      aceiteISO: c.created_at ?? null,
      agoraISO: new Date().toISOString(),
      processamentoImediato: !!c.processamento_imediato,
    }),
    jaPago,
  };
}

export type EntradaExecutarRepasse = {
  tenantId: string;
  contratoId: string;
  adminUser: string;
  grossAmount: unknown;
  commissionAmount: unknown;
  netAmount: unknown;
  currency: unknown;
  dueDate?: string | null;
  reference?: string | null;
  notes?: string | null;
  proofStoragePath?: string | null;
  proofFilename?: string | null;
};

// Data ISO estrita (rejeita "2026-13-40" que passaria num regex solto).
function dataIsoValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// Grava (idempotente/best-effort) um evento no ledger `events`.
async function gravarEvento(
  supabase: SupabaseClient,
  idempotencyKey: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from("events").insert({
      source: "portal",
      event_type: "supplier_payout.executado",
      idempotency_key: idempotencyKey,
      payload,
      status: "processado",
      processed_at: new Date().toISOString(),
    });
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[repasse] falha ao gravar evento");
    }
  } catch {
    console.error("[repasse] falha ao gravar evento");
  }
}

// MUTAÇÃO NOMEADA ÚNICA: registra uma remessa executada ao fornecedor. Valida o
// caso (posse por tenant), valida os valores (motor puro), impede remessa
// duplicada no mesmo caso (salvo exceção explícita), grava o ledger
// supplier_payout e o evento. NÃO envia e-mail (a rota faz o alerta 6).
// Marca/desmarca "processamento imediato" (Clausulas 2.5.2 / 8.4): a autorizacao
// EXPRESSA do cliente para remeter a Entrada antes de decorrido o arrependimento.
// Grava so o metadado; a trava e reavaliada na proxima leitura/execucao. Retorna
// false se o contrato nao existir (confirma a linha afetada).
export async function definirProcessamentoImediato(
  supabase: SupabaseClient,
  contratoId: string,
  imediato: boolean,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("contratos")
    .update({ processamento_imediato: !!imediato })
    .eq("id", contratoId)
    .select("id");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

export async function executarRepasse(
  supabase: SupabaseClient,
  e: EntradaExecutarRepasse
): Promise<
  | { ok: true; payoutId: string; supplierId: string; valores: { grossAmount: number; commissionAmount: number; netAmount: number; currency: string } }
  | { ok: false; erro: string }
> {
  const caso = await obterCasoParaRepasse(supabase, e.tenantId, e.contratoId);
  if (!caso) return { ok: false, erro: "Caso não encontrado ou não elegível a repasse." };
  // Pre-check rapido (UX); a garantia REAL contra dupla remessa e o indice
  // unico (tenant_id, contrato_id), tratado no 23505 do insert abaixo.
  if (caso.jaPago) return { ok: false, erro: "Este caso já tem uma remessa registrada." };

  // Trava da Entrada (Clausulas 2.5.2 / 8.4): fail-closed. Nao remete enquanto o
  // arrependimento corre e "processamento imediato" nao esta marcado. A garantia
  // e no CODIGO (a UI so reflete): a remessa e a acao que move dinheiro.
  if (!caso.trava.liberado) {
    const ate = caso.trava.liberaEmISO
      ? new Date(caso.trava.liberaEmISO).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "";
    return {
      ok: false,
      erro: `Remessa travada: direito de arrependimento em curso${ate ? ` até ${ate}` : ""}. Marque "processamento imediato" (autorização do cliente) para liberar antes.`,
    };
  }

  const val = validarValoresRepasse({
    grossAmount: e.grossAmount,
    commissionAmount: e.commissionAmount,
    netAmount: e.netAmount,
    currency: e.currency,
  });
  if (!val.ok) return { ok: false, erro: val.erro };

  // Reconciliacao de moeda: moeda divergente da do contrato e quase sempre erro
  // de digitacao — bloqueia (o bruto fica livre para a conferencia da fatura).
  if (caso.currency && val.valores.currency !== caso.currency) {
    return { ok: false, erro: `A moeda informada (${val.valores.currency}) difere da moeda do contrato (${caso.currency}).` };
  }

  const dueDate = typeof e.dueDate === "string" && dataIsoValida(e.dueDate) ? e.dueDate : caso.dueDate;
  const agora = new Date().toISOString();

  const { data, error } = await supabase
    .from("supplier_payout")
    .insert({
      tenant_id: e.tenantId,
      supplier_id: caso.supplierId,
      contrato_id: e.contratoId,
      currency: val.valores.currency,
      gross_amount: val.valores.grossAmount,
      commission_amount: val.valores.commissionAmount,
      net_amount: val.valores.netAmount,
      due_date: dueDate,
      reference: typeof e.reference === "string" && e.reference.trim() ? e.reference.trim().slice(0, 200) : null,
      proof_storage_path: e.proofStoragePath ?? null,
      proof_filename: e.proofFilename ?? null,
      notes: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim().slice(0, 1000) : null,
      paid_at: agora,
      paid_by: e.adminUser,
    })
    .select("id")
    .single();
  if (error || !data) {
    // 23505 = violacao do indice unico (tenant_id, contrato_id): outra remessa
    // deste caso venceu a corrida. Nunca marca pagamento duas vezes.
    if ((error as { code?: string } | null)?.code === "23505") {
      return { ok: false, erro: "Este caso já tem uma remessa registrada." };
    }
    console.error("[repasse] falha ao gravar supplier_payout");
    return { ok: false, erro: "Falha ao registrar a remessa." };
  }

  // Trilha no barramento (best-effort). A idempotencia real de pagamento e o
  // indice unico acima; um endurecimento futuro e mover insert+evento+auditoria
  // para uma RPC plpgsql transacional (mesma divida da materializacao de preco).
  await gravarEvento(supabase, `supplier_payout:${data.id}`, {
    payout_id: data.id,
    contrato_id: e.contratoId,
    supplier_id: caso.supplierId,
    net_amount: val.valores.netAmount,
    currency: val.valores.currency,
    executado_por: e.adminUser,
  });

  return { ok: true, payoutId: data.id, supplierId: caso.supplierId, valores: val.valores };
}
