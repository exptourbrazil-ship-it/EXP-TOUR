// Motor PURO da Ficha de Matricula bilingue (Clausulas 2.5e / 8.4). A ficha e
// assinada DEPOIS da Entrada, por marcacao eletronica no portal, com signatarios
// determinados pela IDADE do participante (menor -> tambem o responsavel) e
// contem o campo "processamento imediato" (NAO pre-marcado, nas duas linguas) —
// que, marcado, libera a trava da remessa da Entrada (2.5.2 / 8.4).
//
// SEM imports: roda no runner nativo do Node. Puro e deterministico.

export const FICHA_VERSAO = "1.0";
export const MAIORIDADE_PADRAO = 18;

export type PapelSignatario = "participante" | "responsavel";

// Idade em anos completos na data de referencia (UTC). Null se datas invalidas.
export function idadeEmAnos(nascimentoISO: string | null | undefined, refISO: string): number | null {
  if (!nascimentoISO) return null;
  const n = new Date(nascimentoISO.slice(0, 10) + "T00:00:00Z");
  const r = new Date(refISO.slice(0, 10) + "T00:00:00Z");
  if (isNaN(n.getTime()) || isNaN(r.getTime())) return null;
  let idade = r.getUTCFullYear() - n.getUTCFullYear();
  const m = r.getUTCMonth() - n.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < n.getUTCDate())) idade--;
  return idade;
}

export type SignatariosNecessarios = {
  menor: boolean;
  idade: number | null;
  // Papeis exigidos para a ficha ficar completa. Adulto -> so o participante;
  // menor -> participante E responsavel (multi-signatario por idade). Idade
  // desconhecida -> conservador: exige o responsavel tambem.
  papeis: PapelSignatario[];
};

export function signatariosNecessarios(args: {
  nascimentoISO: string | null | undefined;
  hojeISO: string;
  maioridade?: number;
}): SignatariosNecessarios {
  const maioridade = args.maioridade ?? MAIORIDADE_PADRAO;
  const idade = idadeEmAnos(args.nascimentoISO, args.hojeISO);
  // Sem data de nascimento -> trata como menor (exige responsavel) por seguranca.
  const menor = idade === null ? true : idade < maioridade;
  return { menor, idade, papeis: menor ? ["participante", "responsavel"] : ["participante"] };
}

// A ficha esta completa quando TODOS os papeis necessarios ja assinaram.
export function fichaCompleta(assinados: PapelSignatario[], necessarios: PapelSignatario[]): boolean {
  const set = new Set(assinados);
  return necessarios.every((p) => set.has(p));
}

// Papeis que ainda faltam assinar.
export function papeisPendentes(assinados: PapelSignatario[], necessarios: PapelSignatario[]): PapelSignatario[] {
  const set = new Set(assinados);
  return necessarios.filter((p) => !set.has(p));
}

// ---- Conteudo bilingue (PT/EN) ---------------------------------------------
// Texto da ficha e do campo "processamento imediato". O campo NAO e pre-marcado
// e a recusa NAO impede prosseguir (nota 339): e uma autorizacao opcional.
export const FICHA_TEXTO = {
  titulo: { pt: "Ficha de Matrícula", en: "Enrollment Form" },
  intro: {
    pt: "Confirmo os dados da matrícula do participante no programa e declaro estar ciente das condições contratadas.",
    en: "I confirm the participant's enrollment details in the program and acknowledge the agreed conditions.",
  },
  processamentoImediato: {
    rotulo: {
      pt: "Solicito o processamento imediato da minha matrícula, antes do fim do meu prazo de 7 dias de arrependimento.",
      en: "I request the immediate processing of my enrollment, before the end of my 7-day withdrawal period.",
    },
    // Consequência informada (Cláusula 8.4 / CDC art. 49): a última oração — "sem
    // esta solicitação a restituição seria integral" — é o que torna a escolha
    // informada e sustenta a dedução se houver questionamento. Não pré-marcado; a
    // recusa não impede prosseguir.
    ajuda: {
      pt: "Opcional e não pré-marcado. Estou ciente de que, se eu desistir dentro do prazo de 7 dias, os valores que a escola comprovadamente retiver poderão ser descontados da minha restituição — e que, sem esta solicitação, a restituição seria integral.",
      en: "Optional and not pre-checked. I understand that, if I withdraw within the 7-day period, the amounts the school demonstrably retains may be deducted from my refund — and that, without this request, the refund would be full.",
    },
  },
  papel: {
    participante: { pt: "Participante", en: "Participant" },
    responsavel: { pt: "Responsável", en: "Guardian" },
  },
} as const;
