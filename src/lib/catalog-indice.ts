// Indice do catalogo interno para o construtor de cotacao: todos os produtos
// cotaveis do tenant, ja enriquecidos com campus (cidade/pais/moeda) e escola.
// E o equivalente interno de `carregarCatalogoOrcamento`, mas SEM estimar
// preco: aqui o preco vem do motor real (/api/admin/catalog/price-batch), que
// e a mesma conta da emissao.
//
// NB: modulo SERVER-ONLY (service role). Nunca importar em codigo client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { bandeiraPais, rotuloPais } from "@/lib/paises";
import type { ItemCatalogo, KindCatalogo } from "@/lib/catalog-busca";

const KINDS_VALIDOS: KindCatalogo[] = ["program", "accommodation", "insurance", "service", "other"];

function normalizarKind(k: unknown): KindCatalogo {
  return KINDS_VALIDOS.includes(k as KindCatalogo) ? (k as KindCatalogo) : "other";
}

export type IndiceCatalogo = {
  itens: ItemCatalogo[];
  paises: string[];
  kinds: KindCatalogo[];
};

/**
 * Unidade de cobranca por produto, lida da tabela de preco ATIVA. E o que
 * separa "4 semanas de curso" de "4 noites extras": no catalogo, curso,
 * acomodacao e seguro sao `week` e noite extra e `day`. Precificar tudo como
 * semana cobraria a noite extra 7x.
 */
async function unidadePorProduto(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const PAGINA = 1000;
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("price_template_product")
      .select("product_id, price_template!inner(unit, status, tenant_id, market_id)")
      .eq("price_template.tenant_id", tenantId)
      .eq("price_template.status", "active")
      // Ordenacao explicita: sem ela a paginacao pode repetir/pular linhas e um
      // produto ficaria sem unidade (caindo no default `week`).
      .order("product_id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(`Falha ao carregar unidades de preco: ${error.message}`);
    const lote = (data ?? []) as any[];
    for (const row of lote) {
      const unit = row.price_template?.unit;
      if (!unit) continue;
      // Um produto pode ter mais de uma tabela ativa (generica + por mercado).
      // Seguimos a MESMA precedencia do motor (catalog-service), que prefere a
      // tabela com market_id — assim o rotulo do card nao descreve uma unidade
      // diferente da que precificou.
      const jaTem = m.has(row.product_id);
      const ehDeMercado = row.price_template?.market_id != null;
      if (!jaTem || ehDeMercado) m.set(row.product_id as string, unit as string);
    }
    if (lote.length < PAGINA) break;
  }
  return m;
}

/**
 * Carrega o catalogo cotavel do tenant. O recorte (status active, visibility
 * quotable/sellable, nao arquivado) e o MESMO de `searchProducts`, para que o
 * buscador do construtor mostre exatamente o que pode virar item de cotacao.
 */
export async function carregarIndiceCatalogo(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<IndiceCatalogo> {
  const { data: campusRows, error: campusErr } = await supabase
    .from("campus")
    .select("id, city, country_code, base_currency, supplier!inner(display_name)")
    .eq("tenant_id", tenantId)
    .is("archived_at", null);
  if (campusErr) throw new Error(`Falha ao carregar campus: ${campusErr.message}`);

  const campusById = new Map<string, any>();
  for (const c of (campusRows ?? []) as any[]) campusById.set(c.id, c);

  // Paginacao EXPLICITA: sem `range`, o PostgREST corta na `max-rows` do
  // projeto SEM erro — produtos sumiriam do buscador em silencio e o consultor
  // concluiria "nao temos esse curso". O catalogo ja passa de 500 produtos.
  const PAGINA = 500;
  const produtos: any[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("product")
      .select("id, name, kind, campus_id, min_duration, max_duration, attributes")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("visibility", ["quotable", "sellable"])
      .is("archived_at", null)
      .order("name", { ascending: true })
      .order("id", { ascending: true }) // desempate estavel entre paginas
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw new Error(`Falha ao carregar produtos: ${error.message}`);
    const lote = data ?? [];
    produtos.push(...lote);
    if (lote.length < PAGINA) break;
  }

  const unidades = await unidadePorProduto(supabase, tenantId);

  const itens: ItemCatalogo[] = [];
  const paises = new Set<string>();
  const kinds = new Set<KindCatalogo>();

  for (const p of produtos) {
    const campus = campusById.get(p.campus_id);
    // Produto sem campus vivo nao e cotavel: sem moeda base nem fornecedor.
    if (!campus) continue;
    const pais = rotuloPais(campus.country_code);
    const supplier = Array.isArray(campus.supplier) ? campus.supplier[0] : campus.supplier;
    const kind = normalizarKind(p.kind);
    paises.add(pais);
    kinds.add(kind);
    itens.push({
      id: p.id as string,
      name: (p.name as string) ?? "",
      kind,
      campusId: p.campus_id as string,
      school: (supplier?.display_name as string) ?? "",
      city: (campus.city as string) ?? "",
      country: pais,
      flag: bandeiraPais(campus.country_code),
      currency: (campus.base_currency as string) ?? "",
      minQtd: Number(p.min_duration) || 0,
      maxQtd: Number(p.max_duration) || 0,
      courseType: (p.attributes?.course_type as string) ?? null,
      // Sem tabela ativa o produto nao e cotavel na pratica; `week` e so o
      // default de exibicao — o motor recusa o item e o card mostra "sem preco".
      unit: unidades.get(p.id as string) ?? "week",
      addonDe: (p.attributes?.addon_de as string) ?? null,
    });
  }

  return {
    itens,
    paises: [...paises].sort((a, b) => a.localeCompare(b, "pt-BR")),
    kinds: KINDS_VALIDOS.filter((k) => kinds.has(k)),
  };
}
