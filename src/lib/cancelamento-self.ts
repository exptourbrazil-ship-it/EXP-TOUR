// Motor PURO do cancelamento deliberado SELF-SERVICE do cliente (spec 1, seção 3
// "Cancelamento deliberado — 6 passos"). O cliente, no portal, pede o cancelamento
// de forma consciente: vê as CONSEQUÊNCIAS (o que perde), recebe ALTERNATIVAS
// antes de confirmar, e confirma NOMEANDO o valor retido.
//
// Invariante do projeto: a tela NÃO cancela o contrato nem mexe em dinheiro — ela
// abre uma SOLICITAÇÃO + o processo E4 para a equipe conduzir o acerto/reembolso.
// Este motor só decide/valida; o efeito (solicitação + E4) é do serviço.
//
// SEM imports (roda no runner nativo do Node). Puro/determinístico.

export type AlternativaCancelamento = "adiar_data" | "trocar_destino" | "falar_consultor" | "repactuar";

export type AlternativaInfo = { chave: AlternativaCancelamento; titulo: string; descricao: string };

const ALTERNATIVAS: Record<AlternativaCancelamento, { titulo: string; descricao: string }> = {
  adiar_data: {
    titulo: "Adiar a data de início",
    descricao: "Reagende o começo do programa em vez de cancelar — aproveitando tudo o que já pagou.",
  },
  trocar_destino: {
    titulo: "Trocar de escola ou destino",
    descricao: "Mude a cidade, a escola ou o país mantendo o que já foi pago; nossa equipe recalcula a diferença.",
  },
  repactuar: {
    titulo: "Renegociar os pagamentos",
    descricao: "Se o motivo for financeiro, dá para repactuar o cronograma antes de desistir.",
  },
  falar_consultor: {
    titulo: "Falar com um consultor",
    descricao: "Converse com a nossa equipe antes de decidir — muitas vezes há uma saída melhor.",
  },
};

// Alternativas APLICÁVEIS ao estado do contrato. Depois que o programa começou,
// adiar/trocar não fazem mais sentido; falar com consultor vale sempre.
export function alternativasAplicaveis(fatos: {
  jaComecou: boolean; // data de início já passou
  cancelado: boolean;
}): AlternativaInfo[] {
  const out: AlternativaCancelamento[] = [];
  if (!fatos.cancelado && !fatos.jaComecou) {
    out.push("adiar_data", "trocar_destino", "repactuar");
  }
  out.push("falar_consultor"); // sempre disponível
  return out.map((c) => ({ chave: c, ...ALTERNATIVAS[c] }));
}

// Dentro do prazo de arrependimento (CDC art. 49) o caminho correto NÃO é o
// cancelamento deliberado (com retenção) e sim o ARREPENDIMENTO (devolução
// integral). O fluxo deve redirecionar para lá quando isto for verdadeiro.
export function dentroDoArrependimento(fimArrependimentoISO: string | null, agoraISO: string): boolean {
  if (!fimArrependimentoISO) return false;
  const fim = new Date(fimArrependimentoISO).getTime();
  const agora = new Date(agoraISO).getTime();
  if (!Number.isFinite(fim) || !Number.isFinite(agora)) return false;
  return agora <= fim;
}

// Converte o valor DIGITADO pelo cliente (BRL) em número. Aceita "1.234,56",
// "1234.56", "1234,56", "R$ 1.234,56". null quando não dá para interpretar.
export function parseValorBRL(entrada: unknown): number | null {
  if (typeof entrada === "number") return Number.isFinite(entrada) ? entrada : null;
  if (typeof entrada !== "string") return null;
  let s = entrada.trim().replace(/r\$/i, "").replace(/\s/g, "");
  if (!s) return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // O último separador é o decimal; o outro é milhar.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (temVirgula) {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Confirmação "nomeando o valor": o valor digitado precisa BATER com o valor
// retido esperado (BRL), dentro de uma tolerância pequena (formatação/centavos).
export function confirmacaoValorConfere(
  digitado: unknown,
  esperadoBRL: number,
  toleranciaBRL: number = 0.5,
): boolean {
  const v = parseValorBRL(digitado);
  if (v == null) return false;
  const esperado = Math.round((Number(esperadoBRL) || 0) * 100) / 100;
  return Math.abs(v - esperado) <= toleranciaBRL;
}

// Os 6 passos do fluxo (spec) — rótulos para a UI conduzir a sequência.
export const PASSOS_CANCELAMENTO = [
  { chave: "motivo", titulo: "Por que quer cancelar?" },
  { chave: "alternativas", titulo: "Antes de cancelar, veja estas opções" },
  { chave: "consequencias", titulo: "O que o cancelamento implica" },
  { chave: "confirmacao", titulo: "Confirme digitando o valor retido" },
  { chave: "enviado", titulo: "Solicitação registrada" },
] as const;

export type MotivoCancelamento = "financeiro" | "mudanca_planos" | "insatisfacao" | "saude_familia" | "outro";

export const MOTIVOS_CANCELAMENTO: { valor: MotivoCancelamento; rotulo: string }[] = [
  { valor: "financeiro", rotulo: "Motivo financeiro" },
  { valor: "mudanca_planos", rotulo: "Mudança de planos" },
  { valor: "insatisfacao", rotulo: "Insatisfação com o programa" },
  { valor: "saude_familia", rotulo: "Saúde ou família" },
  { valor: "outro", rotulo: "Outro" },
];

export function motivoValido(v: unknown): v is MotivoCancelamento {
  return typeof v === "string" && MOTIVOS_CANCELAMENTO.some((m) => m.valor === v);
}
