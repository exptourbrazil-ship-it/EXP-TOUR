// NB: modulo server-only (service role). So deve ser importado por rotas/webhook
// e server components — NUNCA por codigo client.
//
// Processo E10 — SUSPEITA DE FRAUDE / HOLD DE VERIFICACAO (doc 01 §4). Um hold
// que TRAVA O AVANCO para estados onerosos (remessa a escola, emissao de
// passagem, envio de contrato para assinatura) ate a verificacao humana. Barato
// de ter agora; caro de improvisar no primeiro incidente.
//
// abrirHoldFraude abre o E10 (suspende "avanco"). avancoSuspenso e o GUARD
// generico que as acoes onerosas chamam: bloqueia se QUALQUER excecao ativa do
// contrato suspende "avanco" (E10 hold, E9 disputa, E2 deferral, E7 interrupcao).
import type { SupabaseClient } from "@supabase/supabase-js";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { estaSuspenso } from "@/lib/excecao";

export class HoldBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "HoldBloqueado";
    this.codigo = codigo;
  }
}

// Guard para acoes ONEROSAS: true se ha excecao ativa suspendendo o avanco deste
// contrato. Use antes de avancar para estados de compromisso/custo.
export async function avancoSuspenso(supabase: SupabaseClient, contratoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("case_exceptions")
    .select("status, suspende")
    .eq("contrato_id", contratoId)
    .in("status", ["aberta", "em_andamento"]);
  // Falha FECHADA: sem saber se ha hold/disputa ativos, nao avanca para estado
  // oneroso. O chamador trata como bloqueio (mais seguro que avancar as cegas).
  if (error) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return estaSuspenso((data || []) as any[], "avanco");
}

// Abre o hold de verificacao (E10). Retorna true se abriu agora, false se ja
// havia um E10 ativo. ja_aberta = sucesso; contrato de outro titular/inexistente
// -> HoldBloqueado (erro de negocio, 400).
export async function abrirHoldFraude(args: {
  contratoId: string;
  titularIdEsperado?: string;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<boolean> {
  try {
    await abrirExcecao({
      contratoId: args.contratoId,
      tipo: "suspeita_fraude",
      motivo: args.motivo || "Hold de verificacao (suspeita de fraude)",
      titularIdEsperado: args.titularIdEsperado,
      autor: args.autor,
      ip: args.ip ?? null,
    });
    return true;
  } catch (err) {
    if (err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta") return false;
    if (err instanceof ExcecaoBloqueada) throw new HoldBloqueado(err.codigo, err.message);
    throw err;
  }
}
