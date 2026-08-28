// Helpers PUROS do pedido de confirmacao de disponibilidade (doc 06, alerta 5).
// Sem rede/DB: validam/normalizam o pedido (admin) e a resposta (escola).
// Testados em confirmacao-disponibilidade.test.ts.

// Motivo do pedido (espelha o CHECK do banco).
export const CONFIRM_KINDS = ["vaga", "adiamento", "alteracao"] as const;
export type ConfirmKind = (typeof CONFIRM_KINDS)[number];
export const CONFIRM_KIND_LABEL: Record<ConfirmKind, string> = {
  vaga: "Checagem de vaga",
  adiamento: "Adiamento",
  alteracao: "Alteração",
};

// Status do pedido.
export const CONFIRM_STATUS = ["pending", "accepted", "declined"] as const;
export type ConfirmStatus = (typeof CONFIRM_STATUS)[number];
export const CONFIRM_STATUS_LABEL: Record<ConfirmStatus, string> = {
  pending: "Aguardando",
  accepted: "Confirmado",
  declined: "Recusado",
};

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export type SolicitacaoEntrada = {
  supplierId?: unknown;
  contratoId?: unknown;
  kind?: unknown;
  message?: unknown;
};
export type SolicitacaoDados = {
  supplierId: string;
  contratoId: string | null;
  kind: ConfirmKind;
  message: string | null;
};
export type ResultadoSolicitacao = { ok: true; dados: SolicitacaoDados } | { ok: false; erro: string };

// Valida/normaliza o pedido do admin. supplierId obrigatorio; contratoId opcional
// (o pedido pode ser geral); kind default 'vaga'; message opcional (limitada).
export function validarSolicitacao(e: SolicitacaoEntrada): ResultadoSolicitacao {
  const supplierId = texto(e.supplierId);
  if (!supplierId) return { ok: false, erro: "Selecione o fornecedor." };

  const kindRaw = texto(e.kind);
  const kind = (kindRaw || "vaga") as ConfirmKind;
  if (!(CONFIRM_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, erro: "Motivo inválido." };
  }

  const contratoId = texto(e.contratoId) || null;
  const message = texto(e.message).slice(0, 1000) || null;
  return { ok: true, dados: { supplierId, contratoId, kind, message } };
}

// Conteudo bilingue (EN padrao) do e-mail do alerta 5.
export function conteudoAlertaConfirmacao(
  kind: ConfirmKind,
  idioma: string,
  ctx: { estudanteNome?: string | null; message?: string | null }
): { subject: string; titulo: string; contexto: string; botaoLabel: string } {
  const en = idioma !== "pt";
  const aluno = ctx.estudanteNome || (en ? "a student" : "um estudante");
  const motivoEn: Record<ConfirmKind, string> = {
    vaga: "availability check",
    adiamento: "a possible postponement",
    alteracao: "a change",
  };
  const motivoPt: Record<ConfirmKind, string> = {
    vaga: "checagem de vaga",
    adiamento: "um possível adiamento",
    alteracao: "uma alteração",
  };
  const extra = ctx.message ? (en ? ` Note: ${ctx.message}` : ` Observação: ${ctx.message}`) : "";
  return {
    subject: en ? "Please confirm availability" : "Confirme a disponibilidade, por favor",
    titulo: en ? "Availability confirmation" : "Confirmação de disponibilidade",
    contexto: en
      ? `EXP Tour needs your confirmation about ${motivoEn[kind]} for ${aluno}.${extra}`
      : `A EXP Tour precisa da sua confirmação sobre ${motivoPt[kind]} de ${aluno}.${extra}`,
    botaoLabel: en ? "Confirm availability" : "Confirmar disponibilidade",
  };
}

export type RespostaEntrada = { status?: unknown; note?: unknown };
export type RespostaDados = { status: Extract<ConfirmStatus, "accepted" | "declined">; note: string | null };
export type ResultadoResposta = { ok: true; dados: RespostaDados } | { ok: false; erro: string };

// Valida a resposta da escola: aceitar/recusar (+ nota opcional). 'pending' nao
// e uma resposta valida (so sai de pending para accepted/declined).
export function validarResposta(e: RespostaEntrada): ResultadoResposta {
  const status = texto(e.status);
  if (status !== "accepted" && status !== "declined") {
    return { ok: false, erro: "Resposta inválida (aceitar ou recusar)." };
  }
  const note = texto(e.note).slice(0, 1000) || null;
  return { ok: true, dados: { status, note } };
}
