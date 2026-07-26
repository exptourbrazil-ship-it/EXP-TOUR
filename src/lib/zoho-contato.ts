// Helpers puros para interpretar um registro de Contato do Zoho CRM ao criar o
// titular no portal. Mantidos sem dependencia de rede/DB para serem testaveis
// com o runner nativo do Node (ver CLAUDE.md).

// Formato parcial de um Contato do Zoho CRM, so com os campos que usamos aqui.
export type ContatoZoho = {
  Full_Name?: string | null;
  First_Name?: string | null;
  Last_Name?: string | null;
  CPF?: string | null;
  CPF_do_Respons_vel_1?: string | null;
  Nome_do_Respons_vel_1?: string | null;
};

// Remove tudo que nao for digito.
export function soDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "");
}

// Um CPF utilizavel para login tem exatamente 11 digitos. Nao validamos os
// digitos verificadores aqui; so o formato, para tolerar pontuacao/espacos e,
// ao mesmo tempo, nao aceitar um CPF pela metade (que bloquearia o fallback
// para o CPF do responsavel).
export function cpfValido(valor: unknown): boolean {
  return soDigitos(valor).length === 11;
}

// Nome completo do estudante a partir do Contato (Full_Name, ou First+Last).
export function nomeEstudante(contato: ContatoZoho): string {
  return (
    contato.Full_Name ||
    `${contato.First_Name || ""} ${contato.Last_Name || ""}`.trim()
  ).trim();
}

// Resolve o titular (login por CPF) a partir do Contato do Zoho.
//
// Regra de negocio (definida com a equipe): o CPF de login e o do ESTUDANTE.
// Quando o estudante e menor e nao tem CPF proprio preenchido, assume-se o CPF
// do Responsavel 1. Nesse caso o nome do titular passa a ser o do responsavel
// (o dono do CPF), caindo para o nome do estudante se o do responsavel nao
// estiver preenchido.
export function resolverTitular(contato: ContatoZoho): {
  cpf: string;
  nome: string;
  origemCpf: "estudante" | "responsavel_1" | null;
} {
  const nome = nomeEstudante(contato);

  if (cpfValido(contato.CPF)) {
    return { cpf: soDigitos(contato.CPF), nome, origemCpf: "estudante" };
  }

  if (cpfValido(contato.CPF_do_Respons_vel_1)) {
    return {
      cpf: soDigitos(contato.CPF_do_Respons_vel_1),
      nome: (contato.Nome_do_Respons_vel_1 || nome).trim(),
      origemCpf: "responsavel_1",
    };
  }

  return { cpf: "", nome, origemCpf: null };
}
