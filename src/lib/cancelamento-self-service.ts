// Serviço do cancelamento deliberado self-service (server-only, service role).
// USO PELO CLIENTE (a rota gateia por sessão do titular). Escopado por POSSE: o
// contrato precisa ser DO titular logado. NÃO cancela o contrato nem move
// dinheiro — registra a SOLICITAÇÃO (com o valor que o cliente confirmou nomeando
// + snapshot das consequências) e abre o E4 para a equipe conduzir o acerto.
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarReembolsoUnificado, type ReembolsoUnificadoView } from "@/lib/reembolso-service";
import {
  alternativasAplicaveis,
  dentroDoArrependimento,
  confirmacaoValorConfere,
  motivoValido,
  type AlternativaInfo,
} from "@/lib/cancelamento-self";
import { abrirCancelamentoContrato, CancelamentoBloqueado } from "@/lib/e4-service";
import { enviarAvisoInternoEmail } from "@/lib/email";

export type ConsequenciasCancelamento = {
  contratoId: string;
  programaNome: string;
  moedaPrograma: string;
  jaCancelado: boolean;
  arrependimento: boolean; // dentro dos 7 dias -> caminho é o arrependimento (devolução integral)
  calculoDisponivel: boolean; // false = não foi possível calcular as consequências (não confirmar!)
  valorRetidoBRL: number; // o que o cliente perde (a ser confirmado nomeando)
  reembolsoEstimadoBRL: number;
  alternativas: AlternativaInfo[];
  memoria: unknown; // memória da calculadora unificada (linhas)
};

// Verifica posse e devolve o contrato mínimo. null = não é do titular / inexiste.
async function contratoDoTitular(supabase: SupabaseClient, titularId: string, contratoId: string) {
  const { data } = await supabase
    .from("contratos")
    .select("id, nome, cancelado_em, data_inicio, data_fim_arrependimento")
    .eq("id", contratoId)
    .eq("titular_id", titularId)
    .maybeSingle();
  return data ?? null;
}

// Consequências para a tela (read-only). Reaproveita a calculadora unificada.
export async function carregarConsequenciasCancelamento(
  supabase: SupabaseClient,
  titularId: string,
  contratoId: string,
  agoraISO: string = new Date().toISOString(),
): Promise<ConsequenciasCancelamento | null> {
  const c = await contratoDoTitular(supabase, titularId, contratoId);
  if (!c) return null;

  const jaCancelado = !!c.cancelado_em;
  const arrependimento = dentroDoArrependimento((c.data_fim_arrependimento as string) ?? null, agoraISO);
  const jaComecou = !!c.data_inicio && new Date(c.data_inicio as string).getTime() <= new Date(agoraISO).getTime();

  const view: ReembolsoUnificadoView | null = await carregarReembolsoUnificado(supabase, contratoId);
  const calculoDisponivel = view != null && view.resultado != null;
  const valorRetidoBRL = view?.resultado?.totalRetidoBRL ?? 0;
  const reembolsoEstimadoBRL = view?.resultado?.reembolsoBRL ?? 0;

  return {
    contratoId,
    programaNome: view?.programaNome ?? ((c.nome as string) || "Programa"),
    moedaPrograma: view?.moedaPrograma ?? "BRL",
    jaCancelado,
    arrependimento,
    calculoDisponivel,
    valorRetidoBRL,
    reembolsoEstimadoBRL,
    alternativas: alternativasAplicaveis({ jaComecou, cancelado: jaCancelado }),
    memoria: view?.resultado?.memoria ?? [],
  };
}

export type SolicitarResultado =
  | { ok: true; solicitacaoId: string }
  | { ok: false; erro: string; codigo: "posse" | "ja_cancelado" | "arrependimento" | "motivo" | "valor" | "falha" };

// Registra a solicitação de cancelamento e abre o E4. Valida posse, motivo, e a
// confirmação por valor (o cliente precisa ter digitado o valor retido).
export async function solicitarCancelamento(
  supabase: SupabaseClient,
  titularId: string,
  contratoId: string,
  dados: { motivo: string; motivoDetalhe?: string | null; valorCienteBRL: unknown; ip?: string | null },
): Promise<SolicitarResultado> {
  const c = await contratoDoTitular(supabase, titularId, contratoId);
  if (!c) return { ok: false, erro: "Contrato não encontrado.", codigo: "posse" };
  if (c.cancelado_em) return { ok: false, erro: "Este contrato já está cancelado.", codigo: "ja_cancelado" };
  if (!motivoValido(dados.motivo)) return { ok: false, erro: "Selecione um motivo.", codigo: "motivo" };

  const agoraISO = new Date().toISOString();
  if (dentroDoArrependimento((c.data_fim_arrependimento as string) ?? null, agoraISO)) {
    return {
      ok: false,
      erro: "Você ainda está no prazo de arrependimento (7 dias) — use a opção de arrependimento para devolução integral.",
      codigo: "arrependimento",
    };
  }

  // Dedupe: se já existe solicitação em aberto para este contrato, não cria
  // outra (evita spam de linhas + e-mails internos). Reforça o E4 (idempotente)
  // por segurança e devolve a solicitação existente como sucesso.
  const { data: aberta } = await supabase
    .from("cancelamento_solicitacao")
    .select("id")
    .eq("contrato_id", contratoId)
    .in("status", ["solicitado", "em_analise"])
    .limit(1)
    .maybeSingle();
  if (aberta?.id) {
    try {
      await abrirCancelamentoContrato({
        contratoId,
        titularIdEsperado: titularId,
        origem: "portal_cancelamento_deliberado",
        motivo: `Cancelamento deliberado (portal) — motivo: ${dados.motivo}`,
        autor: "cliente:cancelamento",
        ip: dados.ip ?? null,
      });
    } catch (err) {
      if (!(err instanceof CancelamentoBloqueado)) {
        console.error("[cancelamento-self] falha ao reforçar E4 (solicitação já existente)");
      }
    }
    return { ok: true, solicitacaoId: aberta.id as string };
  }

  // Recalcula as consequências AGORA (nunca confia num valor vindo da tela) e
  // exige que o cliente tenha digitado o valor retido (confirmação nomeando).
  // FALHA FECHADA: se não dá para calcular o retido, não deixa confirmar (senão
  // "0" bateria com um valor não calculado e gravaria um snapshot falso).
  const view = await carregarReembolsoUnificado(supabase, contratoId);
  if (!view || !view.resultado) {
    return {
      ok: false,
      erro: "Não foi possível calcular as consequências agora. Tente novamente em instantes.",
      codigo: "falha",
    };
  }
  const valorRetidoBRL = view.resultado.totalRetidoBRL ?? 0;
  if (!confirmacaoValorConfere(dados.valorCienteBRL, valorRetidoBRL)) {
    return { ok: false, erro: "Digite exatamente o valor retido para confirmar.", codigo: "valor" };
  }

  const { data: nova, error } = await supabase
    .from("cancelamento_solicitacao")
    .insert({
      contrato_id: contratoId,
      titular_id: titularId,
      motivo: dados.motivo,
      motivo_detalhe: dados.motivoDetalhe ? String(dados.motivoDetalhe).slice(0, 2000) : null,
      valor_ciente_brl: valorRetidoBRL,
      reembolso_estimado_brl: view.resultado.reembolsoBRL ?? 0,
      moeda_programa: view.moedaPrograma ?? null,
      memoria: view.resultado.memoria ?? null,
      status: "solicitado",
      origem: "portal",
      ip: dados.ip ?? null,
    })
    .select("id")
    .single();
  if (error || !nova) {
    return { ok: false, erro: "Não foi possível registrar a solicitação agora.", codigo: "falha" };
  }

  // Abre o E4 (suspende cobrança e coloca na fila da equipe). Best-effort: a
  // solicitação já está gravada; uma falha aqui não a derruba.
  try {
    await abrirCancelamentoContrato({
      contratoId,
      titularIdEsperado: titularId,
      origem: "portal_cancelamento_deliberado",
      motivo: `Cancelamento deliberado (portal) — motivo: ${dados.motivo}`,
      autor: "cliente:cancelamento",
      ip: dados.ip ?? null,
    });
  } catch (err) {
    if (!(err instanceof CancelamentoBloqueado)) {
      console.error("[cancelamento-self] falha ao abrir E4 (solicitação já registrada)");
    }
  }

  // Aviso interno, best-effort (sem PII crua no corpo).
  try {
    await enviarAvisoInternoEmail(
      "Nova solicitação de cancelamento (portal)",
      `Um cliente solicitou o cancelamento de um contrato pelo portal.\nContrato: ${contratoId}\nMotivo: ${dados.motivo}\nRetido informado (BRL): ${valorRetidoBRL}\nSolicitação: ${nova.id}\nConduza o acerto pelo Caso 360.`,
    );
  } catch {
    console.error("[cancelamento-self] falha ao enviar aviso interno (ver email_logs)");
  }

  return { ok: true, solicitacaoId: nova.id as string };
}
