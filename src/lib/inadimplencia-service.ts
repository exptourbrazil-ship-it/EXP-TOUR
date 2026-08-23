// NB: modulo server-only (service role). So deve ser importado por rotas/cron e
// server components — NUNCA por codigo client.
//
// Automacao do processo E5 — CANCELAMENTO POR INADIMPLENCIA (doc 01 §4). NESTE
// passo: no D+30 de uma parcela vencida sem acordo, abre o processo E5 (que
// pausa a regua via suspende padrao do tipo) e cria a tarefa ao Financeiro para
// enviar a NOTIFICACAO FORMAL de rescisao com prazo de cura. NAO envia a
// notificacao formal nem cancela/rescinde automaticamente — o peso legal fica
// com o humano (motor de acerto e a execucao sao marcos proprios).
//
// Idempotente: E5 e aberta no maximo uma vez por contrato (indice unico parcial
// + excecao_ja_aberta = sucesso); a tarefa dedupe por instancia da excecao.
import type { SupabaseClient } from "@supabase/supabase-js";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { PRAZO_CURA_DIAS_PADRAO } from "@/lib/inadimplencia";

const MS_DIA = 24 * 60 * 60 * 1000;
const SLA_ENVIO_NOTIFICACAO_DIAS = 2; // prazo para o Financeiro disparar a notificacao

export type ResultadoEscalada = { aberta: boolean };

// Abre o E5 num contrato e, se abriu agora, cria a tarefa da notificacao formal.
// `contexto` e um rotulo curto (nome do titular) para a fila; `diasVencida` e a
// idade da parcela mais antiga vencida, so para a mensagem.
export async function escalarInadimplenciaContrato(
  supabase: SupabaseClient,
  args: {
    contratoId: string;
    titularId: string;
    contexto?: string | null;
    diasVencida: number;
    prazoCuraDias?: number;
    autor?: string;
  }
): Promise<ResultadoEscalada> {
  const autor = args.autor || "sistema";
  const prazoCura = args.prazoCuraDias ?? PRAZO_CURA_DIAS_PADRAO;

  let excecaoId: string | null = null;
  try {
    const exc = await abrirExcecao({
      contratoId: args.contratoId,
      tipo: "cancelamento_inadimplencia",
      motivo:
        `Inadimplencia: parcela vencida ha ${args.diasVencida} dias (D+30). ` +
        `Enviar notificacao formal de rescisao com prazo de cura de ${prazoCura} dias.`,
      titularIdEsperado: args.titularId,
      autor,
    });
    excecaoId = exc.id;
  } catch (err) {
    if (err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta") {
      return { aberta: false }; // ja escalado; tarefa ja existe
    }
    throw err;
  }

  // Tarefa ao Financeiro: enviar a notificacao formal. origem 'excecao' + dedupe
  // por instancia da excecao (mesma chave da fonte viva da fila -> nao duplica e
  // auto-conclui quando o E5 e resolvido/cancelado).
  try {
    await supabase.from("tasks").upsert(
      {
        categoria: "excecao",
        titulo: "Inadimplência D+30 — enviar notificação formal de rescisão",
        contexto: args.contexto || null,
        alvo_tipo: "excecao",
        alvo_id: excecaoId,
        href: `/admin/clientes/${args.titularId}`,
        papel: "financeiro",
        prazo: new Date(Date.now() + SLA_ENVIO_NOTIFICACAO_DIAS * MS_DIA).toISOString(),
        origem: "excecao",
        chave_dedupe: `excecao:${excecaoId}`,
        criado_por: autor,
      },
      { onConflict: "chave_dedupe", ignoreDuplicates: true }
    );
  } catch (err) {
    // Best-effort: a excecao ja esta aberta e cai na fila do Financeiro de
    // qualquer forma (fonte viva). Mensagem fixa, sem PII.
    console.error("[inadimplencia] falha ao criar tarefa de notificacao formal");
    void err;
  }

  return { aberta: true };
}
