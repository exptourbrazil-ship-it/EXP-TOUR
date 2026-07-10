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
  { valor: "visto", label: "Visto", categoria: "estudante", palavrasChave: ["visa", "visto"] },
  { valor: "visto_2", label: "Visto 2", categoria: "estudante", palavrasChave: ["visto 2", "visa 2", "second visa"] },
  { valor: "certidao_vacinacao", label: "Certidao de Vacinacao", categoria: "estudante", palavrasChave: ["vacina", "vaccination", "certidao de vacinacao"] },
  { valor: "passagem_aerea", label: "Passagem Aerea", categoria: "estudante", palavrasChave: ["airline ticket", "passagem aerea", "e-ticket", "eticket", "itinerary"] },
  { valor: "eta", label: "eTA e similares", categoria: "estudante", palavrasChave: ["eta", "electronic travel authorization", "entry authorization"] },
  { valor: "autorizacao_viagem_domestico", label: "Autorizacao de Viagem (Domestico)", categoria: "estudante", apenasMenor: true, palavrasChave: ["autorizacao de viagem domestico", "domestic travel authorization"] },
  { valor: "autorizacao_viagem_internacional", label: "Autorizacao de Viagem (Internacional)", categoria: "estudante", apenasMenor: true, palavrasChave: ["autorizacao de viagem internacional", "international travel authorization"] },
  { valor: "atestado_medico", label: "Atestado Medico", categoria: "estudante", apenasMenor: true, palavrasChave: ["atestado medico", "medical certificate"] },
  { valor: "carta_matricula", label: "Carta de Matricula", categoria: "escola", palavrasChave: ["loa", "carta de aceite", "carta de matricula", "letter of acceptance", "acceptance letter"] },
  { valor: "coe", label: "COE", categoria: "escola", palavrasChave: ["coe", "confirmation of enrolment", "confirmation of enrollment"] },
  { valor: "carta_acomodacao", label: "Carta de Acomodacao", categoria: "escola", palavrasChave: ["accommodation", "acomodacao"] },
  { valor: "carta_transfer", label: "Carta de Transfer", categoria: "escola", palavrasChave: ["transfer letter", "carta de transfer"] },
  { valor: "documento_visto_escola", label: "Documento para Visto", categoria: "escola", palavrasChave: ["documento para visto", "document for visa"] },
  { valor: "seguro_saude", label: "Seguro Saude", categoria: "escola", palavrasChave: ["insurance", "seguro saude", "seguro-saude"] },
  { valor: "contrato_prestacao_servicos", label: "Contrato de Prestacao de Servicos", categoria: "financeiro", palavrasChave: ["contrato de prestacao de servicos", "service agreement"] },
  { valor: "invoice_escola", label: "Invoice da Escola", categoria: "financeiro", palavrasChave: ["invoice", "invoice gross"] },
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

export function categoriaDoTipoDocumento(valor: string): CategoriaDocumento {
  const tipo = TIPOS_DOCUMENTO.find((t) => t.valor === valor);
  return tipo ? tipo.categoria : "escola";
}

export const CATEGORIAS_DOCUMENTO: { valor: CategoriaDocumento; label: string }[] = [
  { valor: "estudante", label: "Documentos do Estudante" },
  { valor: "escola", label: "Documentos da Escola" },
  { valor: "financeiro", label: "Documentos Financeiros" },
  ];
