// Cancelamento de contrato.
//
// Regra central: um contrato cancelado nao gera cobranca. A regua automatica
// (lembretes de parcela e de quitacao) precisa respeitar isso — antes deste
// modulo ela selecionava parcelas apenas por status e vencimento, entao quem
// desistia continuava recebendo e-mail de cobranca.

export type TipoCancelamento = "arrependimento" | "desistencia" | "erro_cadastro" | "outro";

export const TIPOS_CANCELAMENTO: { valor: TipoCancelamento; rotulo: string; ajuda: string }[] = [
  {
    valor: "arrependimento",
    rotulo: "Direito de arrependimento (7 dias)",
    ajuda: "Desistencia dentro do prazo do CDC art. 49.",
  },
  {
    valor: "desistencia",
    rotulo: "Desistencia fora do prazo",
    ajuda: "Cliente desistiu apos os 7 dias; multa e retencao conforme contrato.",
  },
  {
    valor: "erro_cadastro",
    rotulo: "Cadastro criado por engano",
    ajuda: "Contrato que nao deveria existir. Nao houve relacao comercial.",
  },
  { valor: "outro", rotulo: "Outro", ajuda: "Descreva no motivo." },
];

export function rotuloTipoCancelamento(tipo: string | null | undefined): string {
  return TIPOS_CANCELAMENTO.find((t) => t.valor === tipo)?.rotulo || "Cancelado";
}

// Helper puro (testavel): um contrato esta cancelado quando tem data de
// cancelamento. A data pode ser retroativa — o cancelamento costuma ser
// comunicado dias antes de alguem registrar —, entao qualquer data preenchida
// conta, inclusive no passado.
export function contratoCancelado(contrato: { cancelado_em?: string | null } | null | undefined): boolean {
  return Boolean(contrato?.cancelado_em);
}

// Filtra uma lista de parcelas, removendo as que pertencem a contrato
// cancelado. Usado pela regua de cobranca, onde a parcela chega com o contrato
// embutido pelo join.
export function removerDeContratosCancelados<
  T extends { contrato?: { cancelado_em?: string | null } | null },
>(parcelas: T[]): T[] {
  return parcelas.filter((p) => !contratoCancelado(p.contrato));
}
