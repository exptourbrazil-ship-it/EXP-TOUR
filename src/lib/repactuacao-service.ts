// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Servico da REPACTUACAO do cronograma (Clausula 7.11). Mutacao NOMEADA unica:
// valida o papel/posse -> valida os guarda-corpos (motor puro) -> aplica em
// transacao (ou enfileira para aprovacao humana) -> grava o evento em `events` ->
// grava a trilha em `admin_audit` -> notifica. O aceite eletronico do cliente
// vale como ADITIVO: guardamos o cronograma antes/depois, o Termo+hash, o IP e o
// instante do aceite.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validarRepactuacao,
  montarSnapshotCronograma,
  renderizarTermoRepactuacao,
  trimestreISO,
  CONFIG_REPACTUACAO_PADRAO,
  type ParcelaAtual,
  type ParcelaNova,
  type ConfigRepactuacao,
  type LinhaCronograma,
} from "@/lib/repactuacao";
import { calcularHashTermo } from "@/lib/termos";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { tenantDoTitular } from "@/lib/tenant-config";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import { slugDoTenant } from "@/lib/tenant-slug";
import { enviarAvisoCronogramaAtualizadoEmail, enviarAvisoInternoEmail } from "@/lib/email";

export class RepactuacaoBloqueada extends Error {
  codigo: string;
  constructor(codigo: string, mensagem?: string) {
    super(mensagem || codigo);
    this.name = "RepactuacaoBloqueada";
    this.codigo = codigo;
  }
}

export type ResultadoRepactuacao = {
  status: "aplicada" | "aguardando_aprovacao";
  repactuacaoId: string;
  totalMoeda: number;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function envNum(nome: string): number | undefined {
  const v = Number(process.env[nome]);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}
function primeiro(...cands: Array<number | null | undefined>): number | undefined {
  for (const c of cands) if (c != null && Number.isFinite(c) && c >= 0) return c;
  return undefined;
}

// Config da repactuacao por TENANT (linha do tenant -> env -> default de codigo).
// Deploy-safe: banco sem as colunas -> select erra -> cai no env/default.
export async function carregarConfigRepactuacao(
  supabase: SupabaseClient,
  tenantId: string | null | undefined,
): Promise<ConfigRepactuacao> {
  let row: Record<string, unknown> | null = null;
  if (tenantId) {
    const { data, error } = await supabase
      .from("tenant_config")
      .select("repactuacao_valor_minimo_parcela, repactuacao_limite_trimestre, repactuacao_dias_min_proxima")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!error && data) row = data as Record<string, unknown>;
  }
  const d = CONFIG_REPACTUACAO_PADRAO;
  return {
    valorMinimoParcela:
      primeiro(num(row?.repactuacao_valor_minimo_parcela), envNum("REPACTUACAO_VALOR_MINIMO_PARCELA"), d.valorMinimoParcela) ??
      d.valorMinimoParcela,
    limiteSelfServiceTrimestre: Math.round(
      primeiro(num(row?.repactuacao_limite_trimestre), envNum("REPACTUACAO_LIMITE_TRIMESTRE"), d.limiteSelfServiceTrimestre) ??
        d.limiteSelfServiceTrimestre,
    ),
    diasMinProximaParcela: Math.round(
      primeiro(num(row?.repactuacao_dias_min_proxima), envNum("REPACTUACAO_DIAS_MIN_PROXIMA"), d.diasMinProximaParcela) ??
        d.diasMinProximaParcela,
    ),
  };
}

type ContratoRepact = {
  id: string;
  titular_id: string;
  valor_total: number | null;
  moeda: string | null;
  data_inicio: string | null;
};

async function carregarAtuais(supabase: SupabaseClient, contratoId: string): Promise<ParcelaAtual[]> {
  const { data } = await supabase
    .from("parcelas")
    .select("id, numero, valor_atual, vencimento, status, qr_code_url, is_entrada")
    .eq("contrato_id", contratoId);
  return (data ?? []).map((p) => ({
    id: p.id as string,
    numero: Number(p.numero) || 0,
    valorAtual: num(p.valor_atual) ?? 0,
    vencimento: ((p.vencimento as string) || "").slice(0, 10),
    status: (p.status as string) || "pendente",
    temCobranca: !!p.qr_code_url,
    isEntrada: !!p.is_entrada,
  }));
}

// Conta as repactuacoes self-service (cliente) APLICADAS neste contrato no
// trimestre — insumo do limite antes de exigir aprovacao humana.
async function contarNoTrimestre(supabase: SupabaseClient, contratoId: string, trimestre: string): Promise<number> {
  const { count } = await supabase
    .from("repactuacoes")
    .select("id", { count: "exact", head: true })
    .eq("contrato_id", contratoId)
    .eq("trimestre", trimestre)
    .eq("status", "aplicada")
    .eq("solicitado_por", "cliente");
  return count ?? 0;
}

// Aplica o novo cronograma nas parcelas: remove as que sumiram, atualiza as
// existentes (valor_original INTOCADO), insere as novas. Espelha o /ajustar.
//
// [limitacao conhecida] delete+update+insert em SEQUENCIA, sem transacao (mesmo
// padrao do /ajustar). Uma falha no meio deixaria o cronograma parcial. A correcao
// definitiva e uma funcao Postgres transacional para reescrever o cronograma (a
// mesma que o /ajustar deveria usar) — fatia futura, junto de um lock por contrato
// que fecha a corrida de dupla submissao self-service.
async function aplicarCronograma(
  supabase: SupabaseClient,
  contratoId: string,
  novas: ParcelaNova[],
  atuais: ParcelaAtual[],
): Promise<void> {
  const idsRecebidos = new Set(novas.filter((p) => p.id).map((p) => p.id as string));
  const remover = atuais.filter((p) => !idsRecebidos.has(p.id)).map((p) => p.id);
  if (remover.length > 0) {
    const { error } = await supabase.from("parcelas").delete().in("id", remover).eq("contrato_id", contratoId);
    if (error) throw new RepactuacaoBloqueada("falha_aplicar", "Falha ao remover parcelas");
  }
  // Parcelas bloqueadas (pagas / com Pix) nao sao tocadas: o motor ja garantiu
  // que vieram inalteradas (valor/venc), e o update sobrescreveria numero/
  // descricao/is_entrada historicos. So redistribuimos as NAO bloqueadas.
  const bloqueadas = new Set(atuais.filter((p) => p.status === "pago" || p.temCobranca).map((p) => p.id));
  for (const p of novas) {
    if (p.id && bloqueadas.has(p.id)) continue;
    if (p.id) {
      const { error } = await supabase
        .from("parcelas")
        .update({
          numero: p.numero,
          descricao: p.descricao ?? `Parcela ${p.numero}`,
          valor_atual: p.valor,
          vencimento: p.vencimento,
        })
        .eq("id", p.id)
        .eq("contrato_id", contratoId);
      if (error) throw new RepactuacaoBloqueada("falha_aplicar", "Falha ao atualizar parcela");
    } else {
      const { error } = await supabase.from("parcelas").insert({
        contrato_id: contratoId,
        numero: p.numero,
        descricao: p.descricao ?? `Parcela ${p.numero}`,
        valor_original: p.valor,
        valor_atual: p.valor,
        vencimento: p.vencimento,
        status: "pendente",
        is_entrada: false,
      });
      if (error) throw new RepactuacaoBloqueada("falha_aplicar", "Falha ao inserir parcela");
    }
  }
}

async function gravarEvento(
  supabase: SupabaseClient,
  eventType: string,
  idempotencyKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from("events").insert({
      source: "portal",
      event_type: eventType,
      idempotency_key: idempotencyKey,
      payload,
      status: "processado",
      processed_at: new Date().toISOString(),
    });
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[repactuacao] falha ao gravar evento");
    }
  } catch {
    console.error("[repactuacao] excecao ao gravar evento");
  }
}

function paraCronograma(atuais: ParcelaAtual[]): LinhaCronograma[] {
  return montarSnapshotCronograma(
    atuais.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valorAtual, status: p.status })),
  );
}

// Solicitacao do cliente (self-service). Aplica direto quando dentro do limite do
// trimestre; a 3a+ entra como 'aguardando_aprovacao' (nao aplica ate um admin
// aprovar). Requer aceite=true (o aceite eletronico e o aditivo). Posse checada.
export async function solicitarRepactuacao(args: {
  supabase: SupabaseClient;
  contratoId: string;
  titularId: string;
  novas: ParcelaNova[];
  aceite: boolean;
  ip?: string | null;
}): Promise<ResultadoRepactuacao> {
  const { supabase } = args;

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, valor_total, moeda, data_inicio")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!contrato) throw new RepactuacaoBloqueada("contrato_nao_encontrado");
  const c = contrato as ContratoRepact;
  if (c.titular_id !== args.titularId) throw new RepactuacaoBloqueada("posse");
  if (!args.aceite) throw new RepactuacaoBloqueada("aceite_obrigatorio");

  const atuais = await carregarAtuais(supabase, args.contratoId);
  const tenantId = await tenantDoTitular(supabase, c.titular_id);
  const config = await carregarConfigRepactuacao(supabase, tenantId);
  const hojeISO = hojeBrasilISO();
  const trimestre = trimestreISO(hojeISO);
  const jaNoTrimestre = await contarNoTrimestre(supabase, args.contratoId, trimestre);

  const v = validarRepactuacao({
    atuais,
    novas: args.novas,
    valorTotal: num(c.valor_total) ?? 0,
    dataInicio: c.data_inicio,
    hojeISO,
    repactuacoesNoTrimestre: jaNoTrimestre,
    config,
  });
  if (!v.ok) {
    await gravarEvento(supabase, "Repactuacao_Bloqueada", `repactuacao:bloqueada:${args.contratoId}:${Date.now()}`, {
      contrato_id: args.contratoId,
      motivo: v.motivo,
      detalhe: v.detalhe ?? null,
    });
    throw new RepactuacaoBloqueada(v.motivo, v.detalhe);
  }

  const moeda = (c.moeda as string) || "BRL";
  const cronogramaAnterior = paraCronograma(atuais);
  const cronogramaNovo = montarSnapshotCronograma(
    args.novas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valor })),
  );
  const termo = renderizarTermoRepactuacao({ moeda, cronogramaAnterior, cronogramaNovo });
  const termoHash = calcularHashTermo(termo);
  const agora = new Date().toISOString();

  const baseRegistro = {
    contrato_id: args.contratoId,
    titular_id: c.titular_id,
    cronograma_anterior: cronogramaAnterior,
    cronograma_novo: cronogramaNovo,
    parcelas_propostas: args.novas,
    termo_texto: termo,
    termo_hash: termoHash,
    moeda,
    total_moeda: v.totalPlano,
    exige_aprovacao: v.exigeAprovacao,
    solicitado_por: "cliente",
    ip: args.ip ?? null,
    aceito_em: agora,
    trimestre,
  };

  if (v.exigeAprovacao) {
    // 3a+ no trimestre: enfileira para aprovacao humana (NAO aplica).
    const { data, error } = await supabase
      .from("repactuacoes")
      .insert({ ...baseRegistro, status: "aguardando_aprovacao" })
      .select("id")
      .single();
    if (error) {
      // Ja existe uma pendente para este contrato (indice unico parcial): nao
      // empilha outra — o cliente aguarda a decisao da anterior.
      if ((error as { code?: string }).code === "23505") {
        throw new RepactuacaoBloqueada("ja_ha_pendente");
      }
      throw new RepactuacaoBloqueada("falha_registrar");
    }
    if (!data) throw new RepactuacaoBloqueada("falha_registrar");
    const id = data.id as string;
    await gravarEvento(supabase, "Repactuacao_Solicitada", `repactuacao:solicitada:${id}`, {
      contrato_id: args.contratoId,
      repactuacao_id: id,
      total_moeda: v.totalPlano,
    });
    await registrarAuditoriaAdmin(supabase, {
      usuario: "cliente",
      acao: "repactuacao.solicitada",
      alvo: args.contratoId,
      detalhe: { repactuacao_id: id, exige_aprovacao: true, trimestre },
      ip: args.ip ?? null,
    });
    // Aviso interno best-effort (fila humana).
    try {
      await enviarAvisoInternoEmail(
        "Repactuacao aguardando aprovacao",
        `Contrato ${args.contratoId}: ${jaNoTrimestre + 1}a repactuacao no trimestre ${trimestre} — requer aprovacao humana.`,
      );
    } catch {
      /* best-effort */
    }
    return { status: "aguardando_aprovacao", repactuacaoId: id, totalMoeda: v.totalPlano };
  }

  // Dentro do limite: aplica agora (aceite eletronico = aditivo).
  await aplicarCronograma(supabase, args.contratoId, args.novas, atuais);
  const { data, error } = await supabase
    .from("repactuacoes")
    .insert({ ...baseRegistro, status: "aplicada", aplicada_em: agora })
    .select("id")
    .single();
  if (error || !data) throw new RepactuacaoBloqueada("falha_registrar");
  const id = data.id as string;

  await gravarEvento(supabase, "Repactuacao_Confirmada", `repactuacao:confirmada:${id}`, {
    contrato_id: args.contratoId,
    repactuacao_id: id,
    antes: cronogramaAnterior,
    depois: cronogramaNovo,
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: "cliente",
    acao: "repactuacao.confirmada",
    alvo: args.contratoId,
    detalhe: { repactuacao_id: id, total_moeda: v.totalPlano, trimestre },
    ip: args.ip ?? null,
  });
  await notificarCronograma(supabase, c, cronogramaNovo);

  return { status: "aplicada", repactuacaoId: id, totalMoeda: v.totalPlano };
}

async function notificarCronograma(
  supabase: SupabaseClient,
  contrato: ContratoRepact,
  cronograma: LinhaCronograma[],
): Promise<void> {
  try {
    const { data: titular } = await supabase
      .from("titulares")
      .select("email, nome_completo, tenant_id")
      .eq("id", contrato.titular_id)
      .maybeSingle();
    const email = (titular?.email as string) || null;
    if (!email) return;
    await enviarAvisoCronogramaAtualizadoEmail(
      email,
      (titular?.nome_completo as string) || "cliente",
      {
        tipo: "escopo",
        moeda: (contrato.moeda as string) || "BRL",
        parcelas: cronograma.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valor })),
      },
      await slugDoTenant(supabase, (titular?.tenant_id as string) ?? null),
    );
  } catch {
    /* best-effort: a repactuacao ja esta gravada e aplicada */
  }
}

// Aprova (admin) uma repactuacao 'aguardando_aprovacao': re-valida os guarda-
// corpos HARD contra o estado atual (uma parcela pode ter sido paga nesse meio
// tempo) — ignorando so o limite self-service (a aprovacao E o override humano) —
// e aplica. Posse/RBAC checados na rota.
export async function aprovarRepactuacao(args: {
  supabase: SupabaseClient;
  repactuacaoId: string;
  autor: string;
  ip?: string | null;
}): Promise<ResultadoRepactuacao> {
  const { supabase } = args;
  const { data: reg } = await supabase
    .from("repactuacoes")
    .select("id, contrato_id, titular_id, parcelas_propostas, status, total_moeda")
    .eq("id", args.repactuacaoId)
    .maybeSingle();
  if (!reg) throw new RepactuacaoBloqueada("repactuacao_nao_encontrada");
  if (reg.status !== "aguardando_aprovacao") throw new RepactuacaoBloqueada("status_invalido", reg.status as string);

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, valor_total, moeda, data_inicio")
    .eq("id", reg.contrato_id as string)
    .maybeSingle();
  if (!contrato) throw new RepactuacaoBloqueada("contrato_nao_encontrado");
  const c = contrato as ContratoRepact;

  const novas = (reg.parcelas_propostas as ParcelaNova[]) || [];
  const atuais = await carregarAtuais(supabase, c.id);
  const tenantId = await tenantDoTitular(supabase, c.titular_id);
  const config = await carregarConfigRepactuacao(supabase, tenantId);
  const hojeISO = hojeBrasilISO();

  // Re-valida os guarda-corpos HARD; o limite self-service e ignorado (override).
  const v = validarRepactuacao({
    atuais,
    novas,
    valorTotal: num(c.valor_total) ?? 0,
    dataInicio: c.data_inicio,
    hojeISO,
    repactuacoesNoTrimestre: 0, // aprovacao humana ignora o limite
    config,
  });
  if (!v.ok) throw new RepactuacaoBloqueada(v.motivo, v.detalhe);

  await aplicarCronograma(supabase, c.id, novas, atuais);
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("repactuacoes")
    .update({ status: "aplicada", aplicada_em: agora, aprovada_por: args.autor, aprovada_em: agora })
    .eq("id", args.repactuacaoId)
    .eq("status", "aguardando_aprovacao");
  if (error) throw new RepactuacaoBloqueada("falha_aplicar");

  await gravarEvento(supabase, "Repactuacao_Confirmada", `repactuacao:confirmada:${args.repactuacaoId}`, {
    contrato_id: c.id,
    repactuacao_id: args.repactuacaoId,
    aprovada_por: args.autor,
    depois: montarSnapshotCronograma(novas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valor }))),
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "repactuacao.aprovada",
    alvo: c.id,
    detalhe: { repactuacao_id: args.repactuacaoId },
    ip: args.ip ?? null,
  });
  await notificarCronograma(
    supabase,
    c,
    montarSnapshotCronograma(novas.map((p) => ({ numero: p.numero, vencimento: p.vencimento, valor: p.valor }))),
  );

  return { status: "aplicada", repactuacaoId: args.repactuacaoId, totalMoeda: num(reg.total_moeda) ?? 0 };
}

// Recusa (admin) uma repactuacao pendente. Nao toca parcelas.
export async function recusarRepactuacao(args: {
  supabase: SupabaseClient;
  repactuacaoId: string;
  autor: string;
  motivo?: string | null;
  ip?: string | null;
}): Promise<{ ok: boolean }> {
  const { supabase } = args;
  const { data, error } = await supabase
    .from("repactuacoes")
    .update({ status: "recusada", recusa_motivo: args.motivo ?? null, aprovada_por: args.autor, aprovada_em: new Date().toISOString() })
    .eq("id", args.repactuacaoId)
    .eq("status", "aguardando_aprovacao")
    .select("id, contrato_id");
  if (error || !Array.isArray(data) || data.length === 0) throw new RepactuacaoBloqueada("status_invalido");
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "repactuacao.recusada",
    alvo: (data[0].contrato_id as string) ?? null,
    detalhe: { repactuacao_id: args.repactuacaoId, motivo: args.motivo ?? null },
    ip: args.ip ?? null,
  });
  return { ok: true };
}
