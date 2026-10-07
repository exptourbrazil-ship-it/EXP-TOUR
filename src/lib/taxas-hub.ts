// Regras PURAS da aba "Taxas" do hub do fornecedor: filtrar (nome/tipo), agrupar
// por campus, limitar e montar os textos (escopo, valor, base de cobrança). Sem
// banco/UI — o servidor lista e a tela só renderiza o que sai daqui.

// Máximo de linhas exibidas; acima disso a tela avisa "há mais".
export const LIMITE_TAXAS_HUB = 300;

export const ROTULO_BASE_COBRANCA: Record<string, string> = {
  once_per_quote: "Uma vez por cotação",
  once_per_item: "Uma vez por item",
  per_unit: "Por unidade (semana/noite)",
  per_person: "Por pessoa",
};

export const ROTULO_TIPO_TAXA_HUB: Record<string, string> = {
  registration: "Matrícula",
  material: "Material",
  bank: "Bancária",
  placement: "Colocação",
  service: "Serviço",
  courier: "Courier",
  courier_of_documents: "Courier de documentos",
  custom: "Outra",
};

const ROTULO_KIND_ESCOPO: Record<string, string> = {
  program: "Programas",
  accommodation: "Acomodações",
  insurance: "Seguros",
  other: "Outros (serviços)",
  package: "Pacotes",
};

export type TaxaHubItem = {
  id: string;
  name: string;
  feeType: string;
  chargeBasis: string;
  amount: number | null;
  currency: string | null;
  isMandatory: boolean;
  campusId: string;
  appliesToKinds: string[];
  produtos: number;
  gerida: boolean;
};

export type CampusTaxas = { id: string; name: string };

export type GrupoTaxasCampus<T extends TaxaHubItem = TaxaHubItem> = {
  campus: CampusTaxas;
  taxas: T[];
};

// Mesma normalização da busca do catálogo (sem acento, minúsculas).
function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Filtra por trecho do nome e/ou tipo. Termo vazio e tipo nulo não filtram.
export function filtrarTaxas<T extends TaxaHubItem>(
  taxas: T[],
  filtro: { q?: string | null; tipo?: string | null },
): T[] {
  const q = filtro.q ? norm(filtro.q) : "";
  return taxas.filter((t) => {
    if (filtro.tipo && t.feeType !== filtro.tipo) return false;
    if (q && !norm(t.name).includes(q)) return false;
    return true;
  });
}

// Corta no limite; `total` é o tamanho antes do corte.
export function limitarTaxas<T>(taxas: T[], limite = LIMITE_TAXAS_HUB): { itens: T[]; total: number; haMais: boolean } {
  return { itens: taxas.slice(0, limite), total: taxas.length, haMais: taxas.length > limite };
}

// Agrupa por campus (ordem alfabética do campus, taxas por nome). Todo campus do
// fornecedor aparece, mesmo sem taxa (para o "+ Nova taxa"); taxa de campus
// desconhecido é descartada (nunca exibe taxa fora dos campi do fornecedor).
export function agruparTaxasPorCampus<T extends TaxaHubItem>(
  taxas: T[],
  campi: CampusTaxas[],
): GrupoTaxasCampus<T>[] {
  const porCampus = new Map<string, T[]>(campi.map((c) => [c.id, []]));
  for (const t of taxas) porCampus.get(t.campusId)?.push(t);
  const cmp = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  return [...campi]
    .sort((a, b) => cmp(a.name, b.name))
    .map((campus) => ({
      campus,
      taxas: (porCampus.get(campus.id) ?? []).slice().sort((a, b) => cmp(a.name, b.name)),
    }));
}

// Escopo legível: tipos de produto (applies_to_kinds) e/ou "N produtos" (fee_product).
export function escopoTaxa(t: Pick<TaxaHubItem, "appliesToKinds" | "produtos">): string {
  const partes: string[] = [];
  if (t.appliesToKinds.length > 0) {
    partes.push(`Todos de: ${t.appliesToKinds.map((k) => ROTULO_KIND_ESCOPO[k] ?? k).join(", ")}`);
  }
  if (t.produtos > 0) partes.push(`${t.produtos} ${t.produtos === 1 ? "produto" : "produtos"}`);
  return partes.length > 0 ? partes.join(" + ") : "Sem alvo definido";
}

// Valor sempre com a moeda ao lado; taxa derivada de tabela não tem valor fixo.
export function valorTaxa(t: Pick<TaxaHubItem, "amount" | "currency">): string {
  if (t.amount == null) return "por tabela";
  const n = t.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n} ${t.currency ?? ""}`.trim();
}

export function baseCobranca(chargeBasis: string): string {
  return ROTULO_BASE_COBRANCA[chargeBasis] ?? chargeBasis;
}
