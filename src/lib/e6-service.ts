// NB: modulo server-only (service role). So deve ser importado por rotas/webhook
// e server components — NUNCA por codigo client.
//
// Automacao do processo E6 — CANCELAMENTO PELA ESCOLA (doc 01 §4). NESTE passo:
// abre o processo E6 (que pausa a regua via suspende padrao do tipo), cai na
// Fila do Dia roteado a Operacao, e avisa o cliente de forma proativa
// (reputacao/velocidade). NAO realoca nem reembolsa — isso e execucao humana /
// motor de acerto (E3/reembolso; marco proprio).
//
// Idempotente: E6 e aberta no maximo uma vez por contrato (indice unico parcial
// + excecao_ja_aberta = sucesso); o e-mail so sai quando ABRE agora (evita spam).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { enviarAvisoCancelamentoEscolaEmail } from "@/lib/email";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export class CancelamentoEscolaBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "CancelamentoEscolaBloqueado";
    this.codigo = codigo;
  }
}

export type ResultadoCancelamentoEscola = { excecaoAberta: boolean; avisoEnviado: boolean };

export async function registrarCancelamentoEscola(args: {
  contratoId: string;
  titularIdEsperado?: string;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<ResultadoCancelamentoEscola> {
  const supabase = getSupabase();

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, titular:titulares(nome_completo, email)")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!contrato) {
    throw new CancelamentoEscolaBloqueado("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (args.titularIdEsperado && contrato.titular_id !== args.titularIdEsperado) {
    throw new CancelamentoEscolaBloqueado(
      "contrato_de_outro_titular",
      "O contrato nao pertence a este titular"
    );
  }

  const resultado: ResultadoCancelamentoEscola = { excecaoAberta: false, avisoEnviado: false };

  try {
    await abrirExcecao({
      contratoId: args.contratoId,
      tipo: "cancelamento_escola",
      motivo: args.motivo || "Cancelamento pela escola (turma nao abriu / escola fechou)",
      titularIdEsperado: args.titularIdEsperado,
      autor: args.autor,
      ip: args.ip ?? null,
    });
    resultado.excecaoAberta = true;
  } catch (err) {
    if (err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta") {
      return resultado; // ja aberto; nao reenvia e-mail
    }
    if (err instanceof ExcecaoBloqueada) {
      throw new CancelamentoEscolaBloqueado(err.codigo, err.message);
    }
    throw err;
  }

  // Aviso proativo ao cliente — so quando ABRIU agora. Best-effort.
  const titular = Array.isArray(contrato.titular) ? contrato.titular[0] : contrato.titular;
  if (titular?.email) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
    try {
      await enviarAvisoCancelamentoEscolaEmail(titular.email, titular.nome_completo || "", appUrl || null);
      resultado.avisoEnviado = true;
    } catch {
      // Nao logamos o erro cru (mensagem do provedor pode conter o e-mail); a
      // falha ja fica em email_logs.
      console.error("[e6] falha ao avisar o titular sobre o cancelamento da escola (ver email_logs)");
    }
  }

  return resultado;
}
