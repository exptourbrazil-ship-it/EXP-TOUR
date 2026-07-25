// Helpers puros do NPS (Net Promoter Score) coletado na aba Retorno.
// Mantidos sem dependencia de rede/DB para serem testaveis com o runner
// nativo do Node (ver src/lib/nps.test.ts).

export type ClassificacaoNps = "detrator" | "neutro" | "promotor";

// A nota do NPS e um inteiro de 0 a 10.
export function validarNotaNps(nota: unknown): nota is number {
  return typeof nota === "number" && Number.isInteger(nota) && nota >= 0 && nota <= 10;
}

// Classificacao padrao do NPS: 0-6 detrator, 7-8 neutro, 9-10 promotor.
export function classificarNps(nota: number): ClassificacaoNps {
  if (nota <= 6) return "detrator";
  if (nota <= 8) return "neutro";
  return "promotor";
}

export type SexoEstudante = "F" | "M" | null | undefined;

// Contatos publicos da EXP Tour usados na mensagem de indicacao. A Area do
// Cliente e restrita a clientes, entao a indicacao aponta para o SITE PUBLICO
// e o WhatsApp comercial (nunca para o portal).
export const SITE_PUBLICO_EXP_TOUR = "https://www.exp-tour.com";
export const WHATSAPP_EXP_TOUR = "+1 778-682-7927";

// Abertura da mensagem, com o artigo correto por sexo. Quando o sexo nao esta
// definido, usa uma forma neutra ("Meu nome e ...") que serve para ambos.
export function aberturaIndicacao(primeiroNome: string, sexo: SexoEstudante): string {
  if (!primeiroNome) return "Oi!";
  if (sexo === "F") return `Oi! Aqui e a ${primeiroNome}.`;
  if (sexo === "M") return `Oi! Aqui e o ${primeiroNome}.`;
  return `Oi! Meu nome e ${primeiroNome}.`;
}

// Monta o link wa.me (WhatsApp) com uma mensagem pronta para o aluno
// encaminhar e indicar a EXP Tour. Sem numero de destino: abre o compositor
// para o aluno escolher com quem compartilhar. O artigo (a/o) segue o sexo do
// estudante; sem sexo definido, cai para uma abertura neutra.
export function montarLinkIndicacaoWhatsApp(nomeEstudante: string | null, sexo?: SexoEstudante): string {
  const primeiroNome = (nomeEstudante || "").trim().split(" ")[0];
  const abertura = aberturaIndicacao(primeiroNome, sexo);
  const linhas = [
    `${abertura} Fiz meu intercambio com a EXP Tour e recomendo demais.`,
    "Se voce esta pensando em estudar fora, fala com eles:",
    `${SITE_PUBLICO_EXP_TOUR} ou no WhatsApp ${WHATSAPP_EXP_TOUR}`,
  ];
  const texto = linhas.join(" ");
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
