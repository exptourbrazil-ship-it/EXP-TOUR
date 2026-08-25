// Helpers puros para interpretar um registro de Contato do Zoho CRM ao criar o
// titular no portal. Mantidos sem dependencia de rede/DB para serem testaveis
// com o runner nativo do Node (ver CLAUDE.md).

// Formato parcial de um Contato do Zoho CRM, so com os campos que usamos aqui.
// Um lookup do Zoho ("Pesquisar") vem como objeto { name, id }; um campo de
// texto simples vem como string.
export type LookupZoho = { name?: string | null; id?: string | null } | string | null;

export type ContatoZoho = {
  Full_Name?: string | null;
  First_Name?: string | null;
  Last_Name?: string | null;
  CPF?: string | null;
  CPF_do_Respons_vel_1?: string | null;
  Nome_do_Respons_vel_1?: string | null;
  // Campos do programa (usados para preencher o contrato / viagem_info).
  Sexo?: string | null;
  // Pais de destino. Ha dois campos no CRM: "Destino" (lookup/Pesquisar) e
  // "Destino do Fornecedor" (texto). A equipe preenche o segundo; lemos os dois
  // (o lookup tem prioridade quando presente) para nao depender de qual foi usado.
  Destino?: LookupZoho;
  Destino_do_Fornecedor?: LookupZoho;
  Data_de_Inicio?: string | null;
  Vendor_Name?: LookupZoho;
  // Comercial por-cliente (preferencial sobre o Produto): valor negociado,
  // moeda, entrada e numero de parcelas inicial. Preenchidos no Contato porque
  // variam por aluno (duracao, acomodacao, servicos). Depois da criacao do
  // contrato, quem manda na flexibilidade e o portal (Supabase), nao o Zoho.
  Valor_Total?: number | string | null;
  Moeda?: string | null;
  Valor_de_Entrada?: number | string | null;
  Numero_de_Parcelas?: number | string | null;
};

// Formato parcial de um Produto do Zoho CRM (catalogo do curso/pacote). Serve
// de fallback comercial para contratos antigos cujo comercial ainda mora no
// Produto, e fornece o nome legivel do curso.
export type ProdutoZoho = {
  Product_Name?: string | null;
  Numero_de_Parcelas?: number | string | null;
  Valor_de_Entrada?: number | string | null;
  Moeda_do_Produto?: string | null;
  Unit_Price?: number | string | null;
  Preco_na_Moeda_Original?: number | string | null;
} | null | undefined;

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
// Regra de negocio (revisada com a equipe): o titular e o RESPONSAVEL
// FINANCEIRO. Usa-se o CPF do Responsavel 1; se ele nao tiver CPF (ex.: aluno
// maior de idade que e o proprio responsavel), cai para o CPF do estudante.
// O nome do titular acompanha o dono do CPF (nome do responsavel; se vazio,
// nome do estudante). O nome do estudante em si vai sempre para o contrato
// (contratos.estudante_nome), independentemente de quem e o titular.
export function resolverTitular(contato: ContatoZoho): {
  cpf: string;
  nome: string;
  origemCpf: "responsavel_1" | "estudante" | null;
} {
  const nome = nomeEstudante(contato);

  if (cpfValido(contato.CPF_do_Respons_vel_1)) {
    return {
      cpf: soDigitos(contato.CPF_do_Respons_vel_1),
      nome: (contato.Nome_do_Respons_vel_1 || nome).trim(),
      origemCpf: "responsavel_1",
    };
  }

  if (cpfValido(contato.CPF)) {
    return { cpf: soDigitos(contato.CPF), nome, origemCpf: "estudante" };
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

// Extrai o ID de um lookup do Zoho ({ id }). Quando o campo veio como texto
// simples (nao e um lookup de verdade), nao ha id -> null. Esse id e o mesmo
// `zoho_vendor_id` que guardamos em `supplier`, entao serve para casar o
// contrato com o fornecedor de forma exata (sem depender do nome).
export function idLookup(valor: LookupZoho | undefined): string | null {
  if (!valor || typeof valor === "string") return null;
  const id = valor.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
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

// A opcao "BRL" da lista de moedas reaproveitou uma opcao padrao antiga do
// Zoho cujo valor interno ainda e "Opção 1" (e "USD" e "Opção 2"); por isso
// normalizamos os dois valores possiveis. Sem valor => assume BRL.
export function normalizarMoeda(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v || v === "-None-") return "BRL";
  if (v === "Opção 1") return "BRL";
  if (v === "Opção 2") return "USD";
  return v;
}

// Converte para numero finito ou null (trata "", null, undefined e lixo).
function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Dados comerciais do contrato (valor total, moeda, entrada, nº de parcelas).
//
// Fonte de verdade e o CONTATO (comercial negociado por cliente); caimos para
// o PRODUTO apenas por retrocompatibilidade (contratos antigos cujo comercial
// ainda mora no Produto). O Contato "vence" como UNIDADE quando tem Valor_Total
// preenchido (> 0), para nunca misturar a moeda de uma fonte com o valor de
// outra. O valor sempre fica na moeda escolhida, sem conversao aqui.
export function dadosComerciais(
  contato: ContatoZoho,
  produto?: ProdutoZoho
): {
  nomeProduto: string;
  moeda: string;
  valorTotal: number;
  valorEntrada: number;
  numeroParcelas: number;
  origem: "contato" | "produto";
} {
  const valorContato = numeroOuNulo(contato.Valor_Total);
  const usaContato = valorContato !== null && valorContato > 0;

  // Valor do Produto na moeda do proprio Produto: BRL usa o Preco Unitario;
  // moeda estrangeira usa o Preco na Moeda Original.
  const moedaProduto = normalizarMoeda(produto?.Moeda_do_Produto);
  const valorProduto =
    moedaProduto === "BRL"
      ? numeroOuNulo(produto?.Unit_Price)
      : numeroOuNulo(produto?.Preco_na_Moeda_Original);

  const nomeProduto =
    (typeof produto?.Product_Name === "string" && produto.Product_Name.trim()) ||
    "Viagem EXP Tour";

  return {
    nomeProduto,
    moeda: usaContato ? normalizarMoeda(contato.Moeda) : moedaProduto,
    valorTotal: (usaContato ? valorContato : valorProduto) ?? 0,
    valorEntrada:
      (usaContato
        ? numeroOuNulo(contato.Valor_de_Entrada)
        : numeroOuNulo(produto?.Valor_de_Entrada)) ?? 0,
    numeroParcelas:
      (usaContato
        ? numeroOuNulo(contato.Numero_de_Parcelas)
        : numeroOuNulo(produto?.Numero_de_Parcelas)) ?? 0,
    origem: usaContato ? "contato" : "produto",
  };
}

// Reune os dados do programa a partir do Contato, ja no formato do banco.
export function dadosPrograma(contato: ContatoZoho): {
  estudanteNome: string | null;
  estudanteSexo: "F" | "M" | null;
  paisDestino: string | null;
  dataInicio: string | null;
  escolaNome: string | null;
  escolaVendorId: string | null;
} {
  return {
    estudanteNome: nomeEstudante(contato) || null,
    estudanteSexo: normalizarSexo(contato.Sexo),
    // Prefere o lookup "Destino"; se vazio, cai para o texto "Destino do Fornecedor".
    paisDestino: slugDestino(contato.Destino) ?? slugDestino(contato.Destino_do_Fornecedor),
    dataInicio: dataZoho(contato.Data_de_Inicio),
    escolaNome: nomeLookup(contato.Vendor_Name),
    // Id do Vendor (quando o CRM usa o lookup de verdade): chave exata para casar
    // o contrato com o supplier via zoho_vendor_id.
    escolaVendorId: idLookup(contato.Vendor_Name),
  };
}
