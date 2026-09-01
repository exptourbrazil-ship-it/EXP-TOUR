// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Servico dos CONSENTIMENTOS (LGPD, Clausulas 15/16). O registro e um LEDGER
// append-only: conceder e revogar sempre INSEREM uma linha nova (nunca UPDATE/
// DELETE), preservando o historico como prova. O estado vigente e derivado pelo
// motor puro (consentimento.ts). Posse checada (o titular so mexe nos proprios
// consentimentos). Cada ato grava evento em `events` e trilha em `admin_audit`.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  estadoAtualConsentimentos,
  tipoConsentimento,
  renderizarTextoConsentimento,
  type EstadoConsentimento,
  type RegistroConsentimento,
} from "@/lib/consentimento";
import { calcularHashTermo } from "@/lib/termos";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class ConsentimentoInvalido extends Error {
  codigo: string;
  constructor(codigo: string, mensagem?: string) {
    super(mensagem || codigo);
    this.name = "ConsentimentoInvalido";
    this.codigo = codigo;
  }
}

// Le o ledger do titular e devolve o estado vigente por tipo (motor puro).
export async function carregarEstadoConsentimentos(
  supabase: SupabaseClient,
  titularId: string,
): Promise<EstadoConsentimento[]> {
  const { data, error } = await supabase
    .from("consentimentos")
    .select("tipo, concedido, versao, criado_em")
    .eq("titular_id", titularId);
  // NAO tratar erro como "sem consentimentos": um falho de leitura viraria um
  // falso "revogou tudo". Distingue "sem linhas" (data []) de "query falhou".
  if (error) throw new ConsentimentoInvalido("falha_carregar");
  const registros: RegistroConsentimento[] = (data ?? []).map((r) => ({
    tipo: r.tipo as string,
    concedido: !!r.concedido,
    versao: (r.versao as string) ?? null,
    criado_em: (r.criado_em as string) ?? "",
  }));
  return estadoAtualConsentimentos(registros);
}

// Registra um ato de consentimento (conceder ou revogar) — SEMPRE um insert novo.
// `tipo` tem de existir no catalogo; a versao gravada e a VIGENTE do catalogo (a
// que o titular esta vendo), junto do hash do texto correspondente. Posse: a rota
// passa o titularId da sessao; aqui gravamos so para ele.
export async function registrarConsentimento(args: {
  supabase: SupabaseClient;
  titularId: string;
  tipo: string;
  concedido: boolean;
  ip?: string | null;
  origem?: string;
  autor?: string; // 'cliente' (portal) ou usuario admin
}): Promise<EstadoConsentimento[]> {
  const t = tipoConsentimento(args.tipo);
  if (!t) throw new ConsentimentoInvalido("tipo_invalido", args.tipo);
  // Revogar um consentimento NAO revogavel nao e permitido (nenhum e assim hoje,
  // mas a regra fica explicita para quando o catalogo tiver algum).
  if (!args.concedido && (t as { revogavel?: boolean }).revogavel === false) {
    throw new ConsentimentoInvalido("nao_revogavel", args.tipo);
  }

  const texto = renderizarTextoConsentimento(args.tipo);
  const textoHash = calcularHashTermo(texto);

  const { error } = await args.supabase.from("consentimentos").insert({
    titular_id: args.titularId,
    tipo: args.tipo,
    concedido: args.concedido,
    versao: t.versao,
    texto_hash: textoHash,
    ip: args.ip ?? null,
    origem: args.origem ?? "portal",
  });
  if (error) throw new ConsentimentoInvalido("falha_registrar");

  // Evento (auditoria/replay) — idempotency_key unica por ato (timestamp).
  try {
    await args.supabase.from("events").insert({
      source: "portal",
      event_type: args.concedido ? "Consentimento_Concedido" : "Consentimento_Revogado",
      idempotency_key: `consentimento:${args.titularId}:${args.tipo}:${Date.now()}`,
      payload: { titular_id: args.titularId, tipo: args.tipo, versao: t.versao },
      status: "processado",
      processed_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  }
  await registrarAuditoriaAdmin(args.supabase, {
    usuario: args.autor ?? "cliente",
    acao: args.concedido ? "consentimento.concedido" : "consentimento.revogado",
    alvo: args.titularId,
    detalhe: { tipo: args.tipo, versao: t.versao },
    ip: args.ip ?? null,
  });

  return carregarEstadoConsentimentos(args.supabase, args.titularId);
}
