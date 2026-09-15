export type CategoriaDocumento = "estudante" | "escola" | "financeiro";

export const TIPOS_DOCUMENTO: {
  valor: string;
  label: string;
  categoria: CategoriaDocumento;
  apenasMenor?: boolean;
  palavrasChave: string[];
}[] = [
  { valor: "documento_identidade", label: "Documento de Identidade", categoria: "estudante", palavrasChave: ["rg", "identidade", "id card", "identity document"] },
  { valor: "passaporte", label: "Passaporte", categoria: "estudante", palavrasChave: ["passaporte", "passport"] },
  // ANTES de "visto": um nome como "Visa Refusal Letter" contém "visa" e cairia
  // como visto se este viesse depois (mesma lógica do net-antes-do-gross). As
  // frases aqui são específicas e não casam um "Visa.pdf" simples.
  { valor: "carta_recusa_visto", label: "Carta de Recusa de Visto", categoria: "estudante", palavrasChave: ["carta de recusa", "recusa de visto", "visa refusal", "refusal letter", "visa denial", "visa rejection"] },
  { valor: "visto", label: "Visto", categoria: "estudante", palavrasChave: ["visa", "visto"] },
  { valor: "visto_2", label: "Visto 2", categoria: "estudante", palavrasChave: ["visto 2", "visa 2", "second visa"] },
  { valor: "visto_eua", label: "Visto Americano (B1/B2)", categoria: "estudante", palavrasChave: ["b1/b2", "b1 b2", "b1b2", "visto americano", "us visa", "usa visa", "visto eua"] },
  { valor: "carta_recusa_visto", label: "Carta de Recusa de Visto", categoria: "estudante", palavrasChave: ["carta de recusa", "recusa de visto", "visa refusal", "refusal letter", "visa denial", "visa rejection"] },
  { valor: "certidao_vacinacao", label: "Certidao de Vacinacao", categoria: "estudante", palavrasChave: ["vacina", "vaccination", "certidao de vacinacao"] },
  { valor: "passagem_aerea", label: "Passagem Aerea", categoria: "estudante", palavrasChave: ["airline ticket", "passagem aerea", "e-ticket", "eticket", "itinerary"] },
  { valor: "eta", label: "eTA e similares", categoria: "estudante", palavrasChave: ["eta", "electronic travel authorization", "entry authorization"] },
  { valor: "autorizacao_viagem_domestico", label: "Autorizacao de Viagem (Domestico)", categoria: "estudante", apenasMenor: true, palavrasChave: ["autorizacao de viagem domestico", "domestic travel authorization"] },
  { valor: "autorizacao_viagem_internacional", label: "Autorizacao de Viagem (Internacional)", categoria: "estudante", apenasMenor: true, palavrasChave: ["autorizacao de viagem internacional", "international travel authorization"] },
  { valor: "atestado_medico", label: "Atestado Medico", categoria: "estudante", apenasMenor: true, palavrasChave: ["atestado medico", "medical certificate"] },
  { valor: "carta_matricula", label: "Ficha de Matricula", categoria: "escola", palavrasChave: ["ficha de matricula", "carta de matricula", "enrollment form", "matricula"] },
  { valor: "carta_aceite", label: "Carta de Aceite", categoria: "escola", palavrasChave: ["loa", "carta de aceite", "letter of acceptance", "acceptance letter"] },
  { valor: "coe", label: "COE", categoria: "escola", palavrasChave: ["coe", "confirmation of enrolment", "confirmation of enrollment"] },
  { valor: "carta_acomodacao", label: "Carta de Acomodacao", categoria: "escola", palavrasChave: ["accommodation", "acomodacao"] },
  { valor: "carta_transfer", label: "Carta de Transfer", categoria: "escola", palavrasChave: ["transfer letter", "carta de transfer"] },
  { valor: "documento_visto_escola", label: "Documento para Visto", categoria: "escola", palavrasChave: ["documento para visto", "document for visa"] },
  { valor: "seguro_saude", label: "Seguro Saude", categoria: "escola", palavrasChave: ["insurance", "seguro saude", "seguro-saude"] },
  { valor: "certificado_conclusao", label: "Certificado de Conclusao", categoria: "escola", palavrasChave: ["certificado", "certificate", "certificado de conclusao", "completion certificate", "certificate of completion", "certificate of attendance"] },
  { valor: "contrato_prestacao_servicos", label: "Contrato de Prestacao de Servicos", categoria: "financeiro", palavrasChave: ["contrato de prestacao de servicos", "service agreement"] },
  // NET antes do GROSS e ambos com qualificador: "Net Invoice.pdf" contem o token
  // "invoice", entao se o gross tivesse a chave nua "invoice" e viesse primeiro,
  // toda fatura net cairia como gross. Aqui cada um exige gross/net explicito.
  { valor: "invoice_escola_net", label: "Invoice da Escola (Net)", categoria: "financeiro", palavrasChave: ["invoice net", "net invoice"] },
  { valor: "invoice_escola", label: "Invoice da Escola (Gross)", categoria: "financeiro", palavrasChave: ["invoice gross", "gross invoice"] },
  { valor: "recibo_pagamento", label: "Recibo de Pagamento", categoria: "financeiro", palavrasChave: ["recibo", "receipt", "recibo de pagamento"] },
  ];

export function categorizarNomeArquivo(nomeArquivo: string): string | null {
  const nome = nomeArquivo.toLowerCase();
  const escapeRegExp = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const tipo of TIPOS_DOCUMENTO) {
    const casou = tipo.palavrasChave.some((chave) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(chave)}([^a-z0-9]|$)`, "i").test(nome));
    if (casou) return tipo.valor;
  }
  return null;
}

export function labelDoTipoDocumento(valor: string): string {
  const tipo = TIPOS_DOCUMENTO.find((t) => t.valor === valor);
  return tipo ? tipo.label : "Outro";
}

// Tipos que carregam uma data de VALIDADE relevante para o agente de Vistos
// (janelas de validade vs. exigência do destino). A UI só oferece o campo de
// validade para estes; a verificação detectiva olha qualquer documento com
// validade gravada.
export const TIPOS_COM_VALIDADE = new Set<string>([
  "passaporte",
  "visto",
  "visto_2",
  "visto_eua",
  "eta",
  "seguro_saude",
]);

export function tipoTemValidade(valor: string): boolean {
  return TIPOS_COM_VALIDADE.has(valor);
}

// Tipos que carregam VALOR DE COBERTURA (agente de Seguro: cobertura vs. mínimo
// do destino). Hoje só a apólice de seguro-saúde.
export function tipoTemCobertura(valor: string): boolean {
  return valor === "seguro_saude";
}

export function ehTipoDocumentoValido(valor: string): boolean {
  return TIPOS_DOCUMENTO.some((t) => t.valor === valor);
}

export function categoriaDoTipoDocumento(valor: string): CategoriaDocumento {
  const tipo = TIPOS_DOCUMENTO.find((t) => t.valor === valor);
  return tipo ? tipo.categoria : "escola";
}

export const CATEGORIAS_DOCUMENTO: { valor: CategoriaDocumento; label: string }[] = [
  { valor: "estudante", label: "Documentos do Estudante" },
  { valor: "escola", label: "Documentos da Escola" },
  { valor: "financeiro", label: "Documentos Financeiros" },
  ];

// Motivos padrao de rejeicao de um documento (Caso 360, analise inline).
// Lista fechada + "outro" para texto livre. O motivo escolhido vai no e-mail
// de aviso ao titular, entao precisa ser claro sobre o que refazer.
export const MOTIVOS_REJEICAO_DOCUMENTO: { valor: string; label: string }[] = [
  { valor: "ilegivel", label: "Ilegível / baixa qualidade" },
  { valor: "cortado", label: "Cortado / incompleto" },
  { valor: "vencido", label: "Documento vencido" },
  { valor: "nome_divergente", label: "Nome divergente do cadastro" },
  { valor: "documento_errado", label: "Documento errado para o tipo" },
  { valor: "outro", label: "Outro (especificar)" },
];
