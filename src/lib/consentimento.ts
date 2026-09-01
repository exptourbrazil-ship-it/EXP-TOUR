// Motor PURO da gestao de CONSENTIMENTOS (LGPD — Clausulas 15/16 do contrato).
//
// Regras que este modulo modela:
//  - Consentimento ESPECIFICO por finalidade (nao um "aceito tudo"): dados de
//    saude (sensiveis, Clausula 15), uso de imagem (Clausula 16), compartilhamento
//    com instituicoes/fornecedores e transferencia internacional.
//  - Imagem e opt-in SEPARADO, FACULTATIVO e revogavel — NUNCA pre-marcado e nunca
//    condiciona a contratacao (nota 339).
//  - Todo consentimento e REVOGAVEL; o registro e um LEDGER append-only (conceder e
//    revogar geram linhas novas), e o estado vigente e a ultima linha por tipo.
//  - O texto tem VERSAO: se a versao vigente muda, o consentimento antigo deixa de
//    valer para a nova versao (precisa reconsentir).
//
// SEM imports (nem "@/..." nem extensao): roda no runner nativo do Node e e
// testavel isolado. Nao toca banco — so cataloga, deriva estado e monta o texto.

export type CategoriaConsentimento =
  | "sensivel_saude"
  | "imagem"
  | "compartilhamento"
  | "transferencia_internacional";

export type TipoConsentimento = {
  chave: string;
  rotulo: string;
  descricao: string; // texto especifico da finalidade (base do hash)
  categoria: CategoriaConsentimento;
  facultativo: boolean; // true = nao condiciona a contratacao (imagem, Clausula 16)
  sensivel: boolean; // dado sensivel (saude) — consentimento destacado
  versao: string; // versao do texto vigente
};

// Catalogo vigente. [colchetes] os textos definitivos passam pela validacao
// juridica; a `versao` sobe quando o texto muda (forca reconsentimento).
export const CATALOGO_CONSENTIMENTOS: TipoConsentimento[] = [
  {
    chave: "saude",
    rotulo: "Dados de saúde",
    categoria: "sensivel_saude",
    facultativo: false,
    sensivel: true,
    versao: "1",
    descricao:
      "Autorizo o tratamento dos meus dados de saúde (condições médicas, alergias, restrições alimentares e afins) estritamente para viabilizar a matrícula, a acomodação, o seguro e o suporte durante o programa de intercâmbio.",
  },
  {
    chave: "imagem",
    rotulo: "Uso de imagem",
    categoria: "imagem",
    facultativo: true,
    sensivel: false,
    versao: "1",
    descricao:
      "Autorizo, de forma facultativa e revogável, o uso da minha imagem (fotos e vídeos) em materiais de divulgação. Esta autorização é opcional e não é condição para a contratação.",
  },
  {
    chave: "compartilhamento_fornecedores",
    rotulo: "Compartilhamento com instituições e fornecedores",
    categoria: "compartilhamento",
    facultativo: false,
    sensivel: false,
    versao: "1",
    descricao:
      "Estou ciente e autorizo o compartilhamento dos meus dados pessoais com as instituições de ensino e fornecedores envolvidos, na medida necessária para executar o programa contratado.",
  },
  {
    chave: "transferencia_internacional",
    rotulo: "Transferência internacional de dados",
    categoria: "transferencia_internacional",
    facultativo: false,
    sensivel: false,
    versao: "1",
    descricao:
      "Estou ciente e autorizo a transferência internacional dos meus dados aos fornecedores no exterior, com as devidas salvaguardas, para a prestação dos serviços do programa.",
  },
];

export function tipoConsentimento(chave: string): TipoConsentimento | undefined {
  return CATALOGO_CONSENTIMENTOS.find((t) => t.chave === chave);
}

// Linha do LEDGER (registro append-only). `concedido=false` e uma revogacao (ou
// recusa). `criado_em` ISO decide qual e a mais recente.
export type RegistroConsentimento = {
  tipo: string;
  concedido: boolean;
  versao: string | null;
  criado_em: string; // ISO
};

export type EstadoConsentimento = {
  tipo: string;
  concedido: boolean;
  versao: string | null;
  em: string | null; // quando foi o ultimo ato
  vigente: boolean; // concedido E na versao atual do catalogo
};

// Estado VIGENTE por tipo: a ultima linha (por criado_em) vence. Um tipo sem
// nenhuma linha aparece como nao-concedido. `vigente` exige consentimento
// concedido NA versao atual do catalogo (versao antiga -> precisa reconsentir).
export function estadoAtualConsentimentos(
  registros: RegistroConsentimento[],
  catalogo: TipoConsentimento[] = CATALOGO_CONSENTIMENTOS,
): EstadoConsentimento[] {
  const ultimoPorTipo = new Map<string, RegistroConsentimento>();
  for (const r of Array.isArray(registros) ? registros : []) {
    if (!r || typeof r.tipo !== "string") continue;
    const atual = ultimoPorTipo.get(r.tipo);
    if (!atual || String(r.criado_em) > String(atual.criado_em)) ultimoPorTipo.set(r.tipo, r);
  }
  return catalogo.map((t) => {
    const u = ultimoPorTipo.get(t.chave);
    const concedido = !!u?.concedido;
    return {
      tipo: t.chave,
      concedido,
      versao: u?.versao ?? null,
      em: u?.criado_em ?? null,
      vigente: concedido && u?.versao === t.versao,
    };
  });
}

// Um consentimento especifico esta vigente? (concedido + versao atual)
export function consentimentoVigente(
  registros: RegistroConsentimento[],
  chave: string,
  catalogo: TipoConsentimento[] = CATALOGO_CONSENTIMENTOS,
): boolean {
  const est = estadoAtualConsentimentos(registros, catalogo).find((e) => e.tipo === chave);
  return !!est?.vigente;
}

// Texto DETERMINISTICO do consentimento (finalidade + versao) — base do hash
// SHA-256 que prova o que o titular consentiu. Sem data/hora.
export function renderizarTextoConsentimento(chave: string): string {
  const t = tipoConsentimento(chave);
  if (!t) return "";
  return [`CONSENTIMENTO — ${t.rotulo} (v${t.versao})`, "", t.descricao].join("\n");
}
