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

// Monta o link wa.me (WhatsApp) com uma mensagem pronta para o aluno
// encaminhar e indicar a EXP Tour. Sem numero de destino: abre o compositor
// para o aluno escolher com quem compartilhar. urlPortal e opcional.
export function montarLinkIndicacaoWhatsApp(nomeEstudante: string | null, urlPortal?: string | null): string {
  const nome = (nomeEstudante || "").trim().split(" ")[0];
  const abertura = nome ? `Oi! Aqui e o ${nome}.` : "Oi!";
  const linhas = [
    `${abertura} Fiz meu intercambio com a EXP Tour e recomendo demais.`,
    "Se voce esta pensando em estudar fora, fala com eles:",
  ];
  if (urlPortal) linhas.push(urlPortal);
  const texto = linhas.join(" ");
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}
