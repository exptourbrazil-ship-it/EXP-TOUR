// Modelo de papeis (RBAC) da Area Administrativa. PURO (sem rede/DB), para ser
// testado sem mocks e reutilizado por rotas, guardas e UI. A fonte dos papeis e
// a coluna admin_users.papel; este modulo define o vocabulario e a matriz de
// capacidades. Ver docs/07-arquitetura-area-administrativa.md (Secao 2).
//
// Regra de ouro: a rota admin checa a CAPACIDADE (o que a acao exige), nunca o
// papel diretamente — assim a matriz muda num lugar so.

export const PAPEIS_ADMIN = ["gestor", "operacao", "financeiro", "consultor"] as const;
export type PapelAdmin = (typeof PAPEIS_ADMIN)[number];

// Rotulo para UI (o valor no banco e o slug em minusculas).
export const PAPEL_LABEL: Record<PapelAdmin, string> = {
  gestor: "Gestor",
  operacao: "Operação",
  financeiro: "Financeiro",
  consultor: "Consultor",
};

export function papelValido(p: unknown): p is PapelAdmin {
  return typeof p === "string" && (PAPEIS_ADMIN as readonly string[]).includes(p);
}

// Capacidades = o que uma rota/acao administrativa pode exigir. Deriva da tabela
// de permissoes do doc 07 (Ve / Faz / Nao faz).
export const CAPACIDADES_ADMIN = [
  "casos.ver", // Caso 360 / lista de clientes (consulta)
  "documentos.analisar", // aprovar/rejeitar documentos, publicar docs de escola
  "financeiro.ver", // parcelas, repactuacoes, contas a pagar, tesouraria
  "financeiro.gerir", // cobranca D+10, acertos/reembolsos, pagamento a fornecedor, disputas MP
  "fornecedores.gerir", // cadastro/estagio/pendencias de fornecedor
  "propostas.gerir", // criar proposta/link de checkout, retrabalhar expiradas
  "config.gerir", // parametros da instancia, templates, gestao de usuarios (so Gestor)
  "usuarios.gerir", // criar/editar/desativar admin_users (so Gestor)
  "override", // overrides sensiveis com justificativa (so Gestor)
] as const;
export type CapacidadeAdmin = (typeof CAPACIDADES_ADMIN)[number];

// Matriz por papel. O Gestor faz tudo (tratado a parte, nao precisa listar).
// Os demais recebem exatamente o recorte do doc 07:
//  - Operacao: casos, analise de documentos, fornecedores (nao ve financeiro nem config)
//  - Financeiro: casos, todo o dinheiro (nao edita documentos nem config)
//  - Consultor: casos (leitura) e propostas (nao ve financeiro nem config)
const CAPACIDADES_POR_PAPEL: Record<Exclude<PapelAdmin, "gestor">, ReadonlySet<CapacidadeAdmin>> = {
  operacao: new Set<CapacidadeAdmin>([
    "casos.ver",
    "documentos.analisar",
    "fornecedores.gerir",
  ]),
  financeiro: new Set<CapacidadeAdmin>([
    "casos.ver",
    "financeiro.ver",
    "financeiro.gerir",
  ]),
  consultor: new Set<CapacidadeAdmin>([
    "casos.ver",
    "propostas.gerir",
  ]),
};

// A rota admin deve checar isto, nao o papel. Gestor sempre pode.
export function podeAdmin(papel: PapelAdmin, capacidade: CapacidadeAdmin): boolean {
  if (papel === "gestor") return true;
  return CAPACIDADES_POR_PAPEL[papel]?.has(capacidade) ?? false;
}
