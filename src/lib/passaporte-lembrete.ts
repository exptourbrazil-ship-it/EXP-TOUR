// Motor PURO do conteúdo do lembrete de PASSAPORTE ao cliente (titular). Sem
// rede/DB — testável com o runner nativo do Node. O e-mail vai sempre ao TITULAR
// (quem acessa a Área do Cliente); quando o estudante é outra pessoa, o texto cita
// o estudante. Pede a IMAGEM do passaporte (páginas com foto e dados pessoais).

export type DadosLembretePassaporte = {
  nome: string; // nome completo do titular
  estudante: string; // estudante_nome do contrato (pode ser vazio ou == titular)
};

function primeiroNome(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] || "";
}

// O titular é o próprio estudante quando não há estudante informado, ou quando o
// nome do estudante bate com o do titular (comparação por nome completo, sem caixa).
export function titularEhEstudante(nome: string, estudante: string): boolean {
  const n = (nome || "").trim().toLowerCase();
  const e = (estudante || "").trim().toLowerCase();
  return !e || e === n;
}

export function conteudoSolicitacaoPassaporte(d: DadosLembretePassaporte): {
  subject: string;
  saudacao: string;
  paragrafo: string;
  botaoLabel: string;
} {
  const pnomeTitular = primeiroNome(d.nome);
  const saudacao = pnomeTitular ? `Olá, ${pnomeTitular}!` : "Olá!";
  const botaoLabel = "Enviar o passaporte";

  if (titularEhEstudante(d.nome, d.estudante)) {
    return {
      subject: "Falta o seu passaporte — envie pela Área do Cliente",
      saudacao,
      paragrafo:
        "Para seguir com o seu programa, precisamos da imagem do seu passaporte — as páginas com a foto e os dados pessoais. " +
        "Envie pela sua Área do Cliente, no cofre de documentos.",
      botaoLabel,
    };
  }

  // Assunto com o nome completo do estudante (identificável na caixa de entrada);
  // corpo com o primeiro nome (mais próximo).
  const estudanteCompleto = d.estudante.trim();
  const estudantePrimeiro = primeiroNome(d.estudante);
  return {
    subject: `Falta o passaporte de ${estudanteCompleto} — envie pela Área do Cliente`,
    saudacao,
    paragrafo:
      `Para seguir com o programa de ${estudantePrimeiro}, precisamos da imagem do passaporte — as páginas com a foto e os dados pessoais. ` +
      "Envie pela sua Área do Cliente, no cofre de documentos.",
    botaoLabel,
  };
}
