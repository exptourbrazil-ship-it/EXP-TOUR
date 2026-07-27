// Helpers puros para interpretar um registro de Contato do Zoho CRM ao criar o
// titular no portal. Mantidos sem dependencia de rede/DB para serem testaveis
// com o runner nativo do Node (ver CLAUDE.md).

// Formato parcial de um Contato do Zoho CRM, so com os campos que usamos aqui.
// Um lookup do Zoho ("Pesquisar") vem como objeto { name, id }; um campo de
// texto simples vem como string.
export type LookupZoho = { name?: string | null } | string | null;

export type ContatoZoho = {
  Full_Name?: string | null;
  First_Name?: string | null;
  Last_Name?: string | null;
  CPF?: string | null;
  CPF_do_Respons_vel_1?: string | null;
  Nome_do_Respons_vel_1?: string | null;
  // Campos do programa (usados para preencher o contrato / viagem_info).
  Sexo?: string | null;
  Destino?: LookupZoho;
  Data_de_Inicio?: string | null;
  Vendor_Name?: LookupZoho;
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

// ---------------------------------------------------------------------------
// Dados do programa (contrato / viagem_info) a partir do Contato
// ---------------------------------------------------------------------------

// Extrai o nome legivel de um lookup ({ name }) ou de um campo de texto.
export function nomeLookup(valor: LookupZoho | undefined): string | null {
  if (!valor) return null;
  if (typeof valor === "string") return valor.trim() || null;
  const nome = valor.name;
  return typeof nome === "string" && nome.trim() ? nome.trim() : null;
}

// Minusculas, sem acentos e sem espacos nas pontas.
function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Normaliza o sexo do estudante para o formato do banco ('F' | 'M').
// O Zoho usa uma lista "M"/"F"; toleramos tambem "Masculino"/"Feminino".
export function normalizarSexo(valor: unknown): "F" | "M" | null {
  const t = normalizarTexto(valor);
  if (t.startsWith("m")) return "M";
  if (t.startsWith("f")) return "F";
  return null;
}

// Converte o pais (lookup Destino) para o slug usado pelas abas do portal.
// Os destinos com suporte hoje (ver src/lib/viagem.ts) tem slug fixo; paises
// ainda nao suportados viram um slug generico -- a info fica salva e passa a
// funcionar quando o destino for adicionado ao portal (emergenciaDoDestino
// simplesmente retorna null enquanto o slug nao existir no mapa).
export function slugDestino(valor: LookupZoho | undefined): string | null {
  const t = normalizarTexto(nomeLookup(valor));
  if (!t) return null;
  if (t === "canada") return "canada";
  if (["estados unidos", "estados unidos da america", "eua", "usa"].includes(t)) {
    return "eua";
  }
  if (["nova zelandia", "new zealand"].includes(t)) return "nova_zelandia";
  return t.replace(/\s+/g, "_");
}

// Campo Data do Zoho ("YYYY-MM-DD" ou ISO com hora). Retorna so a parte da
// data (formato aceito por contratos.data_inicio) ou null.
export function dataZoho(valor: unknown): string | null {
  const m = String(valor ?? "").trim().match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

// Reune os dados do programa a partir do Contato, ja no formato do banco.
export function dadosPrograma(contato: ContatoZoho): {
  estudanteNome: string | null;
  estudanteSexo: "F" | "M" | null;
  paisDestino: string | null;
  dataInicio: string | null;
  escolaNome: string | null;
} {
  return {
    estudanteNome: nomeEstudante(contato) || null,
    estudanteSexo: normalizarSexo(contato.Sexo),
    paisDestino: slugDestino(contato.Destino),
    dataInicio: dataZoho(contato.Data_de_Inicio),
    escolaNome: nomeLookup(contato.Vendor_Name),
  };
}
