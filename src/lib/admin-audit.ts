// Trilha de auditoria de acoes administrativas sensiveis (quem fez o que,
// quando, de onde). Gravada na tabela admin_audit. Escrita/leitura apenas via
// service role. Ver as rotas em src/app/api/admin/*.
import type { SupabaseClient } from "@supabase/supabase-js";

export type EntradaAuditoria = {
  usuario: string; // quem fez: e-mail/usuario do admin, ou "bearer-secret" no fallback por segredo
  acao: string; // ex.: "titular.data_inicio.definir", "documento.upload"
  alvo?: string | null; // recurso afetado (ex.: id/cpf)
  detalhe?: Record<string, unknown> | null; // contexto extra (valores, tipo, etc.)
  ip?: string | null;
};

// Registra uma acao administrativa. Best-effort: NUNCA lanca — uma falha de
// auditoria nao deve derrubar a acao em si (apenas loga no console).
export async function registrarAuditoriaAdmin(
  supabase: SupabaseClient,
  entrada: EntradaAuditoria
): Promise<void> {
  try {
    await supabase.from("admin_audit").insert({
      usuario: entrada.usuario,
      acao: entrada.acao,
      alvo: entrada.alvo ?? null,
      detalhe: entrada.detalhe ?? null,
      ip: entrada.ip ?? null,
    });
  } catch (err) {
    console.error("Falha ao registrar auditoria admin", err);
  }
}
