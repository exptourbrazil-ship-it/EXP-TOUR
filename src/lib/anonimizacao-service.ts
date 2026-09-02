// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Servico da ANONIMIZACAO de dados do titular (LGPD art. 18). Mutacao NOMEADA
// unica e IRREVERSIVEL: pre-checa a elegibilidade (motor puro) -> redige a PII e
// apaga os docs de identidade ATOMICAMENTE via a funcao Postgres anonimizar_titular
// (que re-checa a elegibilidade sob lock) -> remove os objetos do Storage -> grava
// o evento em `events` e a trilha em `admin_audit`. Preserva os registros
// financeiros/contratuais e o ledger de consentimentos (retencao legal, art. 16).
import type { SupabaseClient } from "@supabase/supabase-js";
import { avaliarElegibilidade, type ContratoParaAnonimizar } from "@/lib/anonimizacao";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { hojeBrasilISO } from "@/lib/admin-financeiro";

export class AnonimizacaoBloqueada extends Error {
  codigo: string;
  constructor(codigo: string, mensagem?: string) {
    super(mensagem || codigo);
    this.name = "AnonimizacaoBloqueada";
    this.codigo = codigo;
  }
}

// Carrega os contratos do titular + sinal de parcela em aberto, para a checagem
// de elegibilidade (motor puro) antes de tocar Storage/PII.
async function carregarContratos(supabase: SupabaseClient, titularId: string): Promise<ContratoParaAnonimizar[]> {
  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, cancelado_em, data_inicio")
    .eq("titular_id", titularId);
  const lista = (contratos ?? []) as { id: string; cancelado_em: string | null; data_inicio: string | null }[];
  if (lista.length === 0) return [];
  const ids = lista.map((c) => c.id);
  const { data: abertas } = await supabase
    .from("parcelas")
    .select("contrato_id")
    .in("contrato_id", ids)
    .neq("status", "pago");
  const comAberta = new Set((abertas ?? []).map((p) => p.contrato_id as string));
  return lista.map((c) => ({
    id: c.id,
    canceladoEm: c.cancelado_em,
    temParcelaEmAberto: comAberta.has(c.id),
    dataInicio: c.data_inicio,
  }));
}

export async function anonimizarTitular(args: {
  supabase: SupabaseClient;
  titularId: string;
  autor: string;
  justificativa: string;
  ip?: string | null;
}): Promise<{ ok: true; documentosRemovidos: number; storagePendentes: number }> {
  const { supabase } = args;
  if (!args.justificativa || !args.justificativa.trim()) {
    throw new AnonimizacaoBloqueada("justificativa_obrigatoria");
  }

  // Pre-check de elegibilidade (evita tocar Storage/PII quando ha contrato ativo).
  const contratos = await carregarContratos(supabase, args.titularId);
  const eleg = avaliarElegibilidade(contratos, hojeBrasilISO());
  if (!eleg.ok) throw new AnonimizacaoBloqueada(eleg.motivo);

  // Redacao ATOMICA (re-checa a elegibilidade sob lock). Retorna os docs a remover.
  const { data, error } = await supabase.rpc("anonimizar_titular", {
    p_titular_id: args.titularId,
    p_autor: args.autor,
    p_justificativa: args.justificativa.trim(),
  });
  if (error) {
    const msg = (error as { message?: string }).message ?? "";
    const conhecidos = ["titular_nao_encontrado", "ja_anonimizado", "contrato_ativo"];
    if (conhecidos.includes(msg)) throw new AnonimizacaoBloqueada(msg);
    throw new AnonimizacaoBloqueada("falha_anonimizar", msg);
  }

  // Remove os objetos do Storage dos docs de identidade apagados (best-effort: a
  // linha ja saiu e o titular esta anonimizado — objeto orfao e sweepavel).
  const docs = (((data as { documentos?: unknown })?.documentos as { bucket: string; path: string }[]) ?? []).filter(
    (d) => d && d.bucket && d.path,
  );
  const porBucket = new Map<string, string[]>();
  for (const d of docs) {
    const arr = porBucket.get(d.bucket) ?? [];
    arr.push(d.path);
    porBucket.set(d.bucket, arr);
  }
  // Coleta os objetos que NAO puderam ser removidos: a linha em `documentos` ja
  // saiu na transacao, entao um objeto que sobreviva e PII orfa. `.remove()`
  // devolve {error} (nao lanca) — inspecionamos e registramos as falhas num evento
  // para uma varredura idempotente reprocessar (nunca afirmamos sucesso silencioso).
  const falhas: { bucket: string; path: string }[] = [];
  for (const [bucket, paths] of porBucket) {
    try {
      const { error: errRemove } = await supabase.storage.from(bucket).remove(paths);
      if (errRemove) for (const p of paths) falhas.push({ bucket, path: p });
    } catch {
      for (const p of paths) falhas.push({ bucket, path: p });
    }
  }
  if (falhas.length > 0) {
    console.error(`[anonimizacao] ${falhas.length} objeto(s) do Storage nao removido(s)`);
    // Evento pendente com os paths para varredura (status 'erro' -> fila de retry).
    try {
      await supabase.from("events").insert({
        source: "portal",
        event_type: "Anonimizacao_Storage_Pendente",
        idempotency_key: `anonimizacao:storage:${args.titularId}`,
        payload: { titular_id: args.titularId, pendentes: falhas },
        status: "erro",
      });
    } catch {
      /* best-effort */
    }
  }

  // Evento + auditoria do ato (ja commitado no banco).
  try {
    await supabase.from("events").insert({
      source: "portal",
      event_type: "Titular_Anonimizado",
      idempotency_key: `anonimizacao:${args.titularId}`,
      payload: {
        titular_id: args.titularId,
        documentos_removidos: docs.length,
        storage_pendentes: falhas.length,
      },
      status: "processado",
      processed_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "titular.anonimizado",
    alvo: args.titularId,
    detalhe: {
      documentos_removidos: docs.length,
      storage_pendentes: falhas.length,
      justificativa: args.justificativa.trim(),
    },
    ip: args.ip ?? null,
  });

  return { ok: true, documentosRemovidos: docs.length, storagePendentes: falhas.length };
}
