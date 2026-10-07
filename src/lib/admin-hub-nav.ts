// Navegação do hub do fornecedor no admin — funções PURAS (sem banco/UI) que
// dizem "para onde voltar" depois de salvar/criar/arquivar/cancelar um registro
// do catálogo (produto, tabela de preço, taxa, promoção, campus...).
//
// Regra do produto: o admin NUNCA cai numa lista geral de todos os programas /
// preços / taxas / promoções. Tudo fica dentro do fornecedor dono do registro; a
// única lista geral que sobra é a de FORNECEDORES (falha fechada: se o dono do
// registro não puder ser resolvido, volta para ela).

export const HUB_LISTA_FORNECEDORES = "/admin/fornecedores";

// Abas do hub que listam produtos por tipo (kind) + as demais usadas como destino.
export type HubAba =
  | "programas"
  | "acomodacao"
  | "outros"
  | "pacotes"
  | "seguro"
  | "promocoes"
  | "ofertas"
  | "escolas"
  | "disponibilidade"
  | "materiais"
  | "taxas"
  | "arquivados";

const ABA_POR_KIND: Record<string, HubAba> = {
  program: "programas",
  accommodation: "acomodacao",
  other: "outros",
  package: "pacotes",
  insurance: "seguro",
};

export const ROTULO_ABA: Record<HubAba, string> = {
  programas: "Programas",
  acomodacao: "Acomodação",
  outros: "Outros",
  pacotes: "Pacotes",
  seguro: "Seguro",
  promocoes: "Promoções",
  ofertas: "Ofertas & Bolsas",
  escolas: "Meus Campi",
  disponibilidade: "Disponibilidade",
  materiais: "Material",
  taxas: "Taxas",
  arquivados: "Arquivados",
};

// ids de fornecedor/produto vêm do banco (uuid), mas codificamos por garantia.
const enc = (s: string) => encodeURIComponent(s);

// Aba do hub que lista os produtos de um tipo. Tipo desconhecido => null.
export function abaDoKind(kind: string | null | undefined): HubAba | null {
  return (kind && ABA_POR_KIND[kind]) || null;
}

// Raiz do hub (Inventário) de um fornecedor; sem fornecedor => lista de fornecedores.
export function hrefHub(supplierId: string | null | undefined, aba?: HubAba): string {
  if (!supplierId) return HUB_LISTA_FORNECEDORES;
  const base = `${HUB_LISTA_FORNECEDORES}/${enc(supplierId)}`;
  return aba ? `${base}/${aba}` : base;
}

// Destino ao terminar de mexer em um PRODUTO: a aba do tipo dele dentro do hub
// (Programas para program, Acomodação etc.); tipo desconhecido => Inventário.
export function hrefVoltarProduto(supplierId: string | null | undefined, kind: string | null | undefined): string {
  return hrefHub(supplierId, abaDoKind(kind) ?? undefined);
}

// Rótulo do botão "voltar" correspondente a hrefVoltarProduto.
export function rotuloVoltarProduto(kind: string | null | undefined): string {
  const aba = abaDoKind(kind);
  return aba ? ROTULO_ABA[aba] : "Inventário do fornecedor";
}

// Tela de edição de um produto dentro do hub. `aba` abre direto uma aba interna
// do editor (ex.: "precos" volta para Preços & Taxas).
export function hrefProdutoNoHub(supplierId: string | null | undefined, productId: string, aba?: string): string {
  if (!supplierId) return HUB_LISTA_FORNECEDORES;
  const base = `${hrefHub(supplierId)}/produto/${enc(productId)}`;
  return aba ? `${base}?aba=${enc(aba)}` : base;
}

export function hrefPromocoesDoHub(supplierId: string | null | undefined): string {
  return hrefHub(supplierId, "promocoes");
}

export function hrefPromocaoNoHub(supplierId: string | null | undefined, promoId: string): string {
  if (!supplierId) return HUB_LISTA_FORNECEDORES;
  return `${hrefHub(supplierId)}/promocao/${enc(promoId)}`;
}

export function hrefNovaPromocaoNoHub(supplierId: string | null | undefined, produtoId?: string | null): string {
  if (!supplierId) return HUB_LISTA_FORNECEDORES;
  const base = `${hrefHub(supplierId)}/promocao/nova`;
  return produtoId ? `${base}?produto=${enc(produtoId)}` : base;
}

// Destino ao terminar de mexer numa TABELA DE PREÇO ou TAXA (editores dedicados):
// com produto de contexto (já conferido como do fornecedor) volta para a aba
// "Preços & Taxas" daquele produto; sem produto, para o Inventário do fornecedor.
export function hrefVoltarPrecoOuTaxa(
  supplierId: string | null | undefined,
  produtoId?: string | null,
): string {
  if (!supplierId) return HUB_LISTA_FORNECEDORES;
  return produtoId ? hrefProdutoNoHub(supplierId, produtoId, "precos") : hrefHub(supplierId);
}

// Destino ao terminar de mexer numa TAXA: com produto de contexto (já conferido
// como do fornecedor) volta para a aba "Preços & Taxas" dele; sem produto (taxa
// de campus por applies_to_kinds, ou aberta da aba Taxas) volta para a aba
// "Taxas" do fornecedor. Sem fornecedor, para a lista de fornecedores.
export function hrefVoltarTaxa(
  supplierId: string | null | undefined,
  produtoId?: string | null,
): string {
  if (!supplierId) return HUB_LISTA_FORNECEDORES;
  return produtoId ? hrefProdutoNoHub(supplierId, produtoId, "precos") : hrefHub(supplierId, "taxas");
}

// Resolve o fornecedor dono de um registro a partir dos campi candidatos (campus
// do próprio registro e/ou campi dos produtos vinculados) e do mapa campus ->
// fornecedor JÁ filtrado por tenant. Falha fechada: sem candidato resolvido, ou
// com candidatos de fornecedores DIFERENTES (registro ambíguo), devolve null.
export function resolverFornecedorDoRegistro(
  campusCandidatos: Array<string | null | undefined>,
  campi: Array<{ id: string; supplierId: string | null }>,
): string | null {
  const porCampus = new Map(campi.map((c) => [c.id, c.supplierId]));
  const achados = new Set<string>();
  for (const id of campusCandidatos) {
    if (!id) continue;
    const s = porCampus.get(id);
    if (s) achados.add(s);
  }
  return achados.size === 1 ? [...achados][0] : null;
}

// Aba interna do editor de produto aceita via ?aba= (lista fechada: nunca
// reflete valor arbitrário da querystring).
export const ABAS_EDITOR_PRODUTO = ["informacao", "precos", "disponibilidade", "promocoes", "elegibilidade", "conteudo"] as const;
export function abaEditorValida(v: string | null | undefined): string | null {
  return v && (ABAS_EDITOR_PRODUTO as readonly string[]).includes(v) ? v : null;
}
