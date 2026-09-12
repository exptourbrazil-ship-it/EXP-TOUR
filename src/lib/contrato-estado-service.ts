// Camada de dados da máquina de estados do contrato (server-only, service role).
// Junta os FATOS que hoje moram em tabelas diferentes (contrato, parcelas, aceite,
// visto, datas) e resolve o estado atual via o motor puro contrato-estados.ts.
//
// Estratégia de migração: SEM backfill big-bang. A coluna contratos.estado é
// NULL nos contratos legados; enquanto NULL, o estado é DERIVADO em leitura. A
// primeira transição registrada (ou uma sincronização) persiste o estado. Assim
// contratos vindos do CRM têm estado correto desde já, e a máquina passa a ser a
// fonte de verdade conforme as mutações a alimentam (F3).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveEstadoContrato,
  podeTransicionar,
  estadoValido,
  type EstadoContrato,
  type FatosContrato,
} from "@/lib/contrato-estados";

// Reúne os fatos de um contrato. Retorna null se o contrato não existe.
export async function carregarFatosContrato(
  supabase: SupabaseClient,
  contratoId: string,
  agoraISO: string = new Date().toISOString(),
): Promise<FatosContrato | null> {
  const { data: c } = await supabase
    .from("contratos")
    .select("id, titular_id, cancelado_em, visto_status, data_inicio")
    .eq("id", contratoId)
    .maybeSingle();
  if (!c) return null;

  // Parcelas: entrada paga = existe alguma paga; quitado = todas pagas.
  const { data: parcelas } = await supabase
    .from("parcelas")
    .select("status")
    .eq("contrato_id", contratoId);
  const linhas = parcelas ?? [];
  const entradaPaga = linhas.some((p) => p.status === "pago");

  // Aceite do Termo pelo titular (proxy do "contrato assinado" enquanto o Zoho
  // Sign está inativo). Qualquer aceite do titular serve como sinal contratual.
  let aceiteTermoEm: string | null = null;
  if (c.titular_id) {
    const { data: aceite } = await supabase
      .from("aceites")
      .select("data_hora")
      .eq("titular_id", c.titular_id)
      .order("data_hora", { ascending: true })
      .limit(1)
      .maybeSingle();
    aceiteTermoEm = (aceite?.data_hora as string) ?? null;
  }

  const vistoStatus =
    c.visto_status === "em_analise" || c.visto_status === "aprovado" || c.visto_status === "negado"
      ? c.visto_status
      : null;

  return {
    agoraISO,
    canceladoEm: (c.cancelado_em as string) ?? null,
    entradaPaga,
    aceiteTermoEm,
    vistoStatus,
    dataInicioISO: (c.data_inicio as string) ?? null,
    // Sem sinal confiável hoje (Sign/SignForms inativos, sem data de retorno):
    // ficam indefinidos e o motor mantém o contrato no passo pendente.
  };
}

// Estado atual do contrato: o PERSISTIDO (fonte de verdade) quando existe e é
// válido; caso contrário, o DERIVADO dos fatos (retrocompat). null se não existe.
export async function estadoDoContrato(
  supabase: SupabaseClient,
  contratoId: string,
  agoraISO?: string,
): Promise<EstadoContrato | null> {
  const { data: c } = await supabase
    .from("contratos")
    .select("estado")
    .eq("id", contratoId)
    .maybeSingle();
  if (c && typeof c.estado === "string" && estadoValido(c.estado)) {
    return c.estado;
  }
  const fatos = await carregarFatosContrato(supabase, contratoId, agoraISO);
  return fatos ? deriveEstadoContrato(fatos) : null;
}

export type RegistrarTransicaoParams = {
  contratoId: string;
  para: EstadoContrato;
  origem: "sistema" | "admin" | "webhook";
  autor?: string | null;
  motivo?: string | null;
  eventId?: string | null;
  // override: permite transição fora da tabela de válidas (ex.: correção do admin
  // com justificativa). Sempre registrado como override=true no ledger.
  override?: boolean;
  // de: estado de origem conhecido; se omitido, é resolvido do contrato.
  de?: EstadoContrato | null;
};

export type RegistrarTransicaoResultado =
  | { ok: true; de: EstadoContrato | null; para: EstadoContrato; override: boolean }
  | { ok: false; erro: string };

// Registra UMA transição: valida (salvo override), grava no ledger imutável e
// atualiza contratos.estado. Fonte única de mudança de estado — F3 liga as
// mutações (webhook de pagamento, aceite, cancelamento, etc.) a esta função.
export async function registrarTransicao(
  supabase: SupabaseClient,
  params: RegistrarTransicaoParams,
): Promise<RegistrarTransicaoResultado> {
  const { contratoId, para, origem } = params;
  if (!estadoValido(para)) {
    return { ok: false, erro: "Estado de destino inválido." };
  }

  const de = params.de !== undefined ? params.de : await estadoDoContrato(supabase, contratoId);
  if (de === undefined) {
    return { ok: false, erro: "Contrato não encontrado." };
  }
  if (de === para) {
    return { ok: false, erro: "O contrato já está neste estado." };
  }

  // Transição de estado conhecido precisa ser válida, salvo override explícito.
  // Quando não há estado de origem (de === null), é a inicialização — sempre ok.
  const valida = de === null || podeTransicionar(de, para);
  const override = params.override === true;
  if (!valida && !override) {
    return { ok: false, erro: `Transição inválida: ${de} → ${para}.` };
  }

  const { error: errLedger } = await supabase.from("contrato_transicoes").insert({
    contrato_id: contratoId,
    de,
    para,
    origem,
    autor: params.autor ?? null,
    motivo: params.motivo ?? null,
    override: !valida, // registra como override quando saiu da tabela de válidas
    event_id: params.eventId ?? null,
  });
  if (errLedger) {
    return { ok: false, erro: "Falha ao registrar a transição." };
  }

  const { error: errUpd } = await supabase
    .from("contratos")
    .update({ estado: para })
    .eq("id", contratoId);
  if (errUpd) {
    return { ok: false, erro: "Falha ao atualizar o estado do contrato." };
  }

  return { ok: true, de, para, override: !valida };
}

// Sincroniza o estado persistido com o DERIVADO dos fatos. Usado tanto como
// lazy-backfill (persistido NULL) quanto como avanço automático quando um fato
// mudou (F3 chama após webhook/aceite). Não faz nada se já está sincronizado.
export async function sincronizarEstadoContrato(
  supabase: SupabaseClient,
  contratoId: string,
  opts: { autor?: string | null; origem?: "sistema" | "webhook"; agoraISO?: string } = {},
): Promise<RegistrarTransicaoResultado | { ok: true; semMudanca: true }> {
  const fatos = await carregarFatosContrato(supabase, contratoId, opts.agoraISO);
  if (!fatos) return { ok: false, erro: "Contrato não encontrado." };
  const derivado = deriveEstadoContrato(fatos);

  const { data: c } = await supabase
    .from("contratos")
    .select("estado")
    .eq("id", contratoId)
    .maybeSingle();
  const persistido =
    c && typeof c.estado === "string" && estadoValido(c.estado) ? (c.estado as EstadoContrato) : null;

  if (persistido === derivado) return { ok: true, semMudanca: true };

  return registrarTransicao(supabase, {
    contratoId,
    de: persistido,
    para: derivado,
    origem: opts.origem ?? "sistema",
    autor: opts.autor ?? "sistema",
    motivo: "sincronização automática a partir dos fatos",
    // Um salto entre estados não adjacentes (ex.: NULL→em_programa em contrato do
    // CRM) é legítimo aqui: é a foto dos fatos, não uma ação manual. override
    // permite gravar sem falhar; o ledger marca override quando saiu da linha.
    override: true,
  });
}
