// Leitura das tabelas de preco de CURSO do fornecedor, na visao por carga
// horaria. SERVER-ONLY (service role).
//
// POSSE: o ponto de partida e sempre `campus.supplier_id = <supplier da
// sessao>` + o `tenant_id` do proprio supplier; tudo o mais desce dai
// (template -> faixa -> vinculo -> produto). Nenhum id vem do cliente. Uma
// escola nunca ve a tabela de outra.
//
// So LEITURA: esta tela existe para a escola conferir o que ja esta publicado
// antes de ganhar permissao para editar.
//
// FALHA FECHADA: erro de consulta VIRA EXCECAO, nunca lista vazia. Uma consulta
// que falhasse em silencio faria a tela dizer "curso sem preco" e "tabela sem
// faixa" — mandando a escola caçar um problema que nao existe.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type TabelaCargaHoraria,
  type CursoDaTabela,
  type CursoSimples,
  type FormatoAula,
} from "@/lib/preco-carga-horaria";
import { CLASS_FORMATS } from "@/lib/produto-conteudo";

export type CampusComTabelas = {
  campusId: string;
  campusNome: string;
  tabelas: TabelaCargaHoraria[];
};

export type PrecosPorCargaHoraria = {
  campi: CampusComTabelas[];
  /**
   * Tabelas e cursos do fornecedor INTEIRO. Os dois alertas (curso sem preco,
   * curso em varias tabelas) sao calculados sobre este conjunto, nao por campus:
   * `price_template_product` nao amarra campus, entao um curso precificado por
   * uma tabela de outro campus do mesmo grupo apareceria como "sem preco".
   */
  todasTabelas: TabelaCargaHoraria[];
  todosCursos: CursoSimples[];
};

// Visibilidade que significa "entra em cotacao" — o mesmo par usado no indice
// de catalogo e no orcamento. O default da coluna e 'internal', entao SEM este
// filtro todo curso nunca aberto para venda viraria um alerta de "sem preco".
const VISIBILIDADE_COTAVEL = ["quotable", "sellable"];

// O PostgREST monta a lista do `in` na URL; uma lista muito longa estoura o
// limite de tamanho. Fatiamos em blocos e juntamos em memoria.
const LOTE = 200;
function lotes<T>(itens: T[]): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < itens.length; i += LOTE) saida.push(itens.slice(i, i + LOTE));
  return saida;
}

// Teto de linhas por resposta do PostgREST (db.max_rows). Pedimos de PAGINA em
// PAGINA e avancamos PELO QUE VEIO, parando so no vazio: se o projeto tiver um
// max_rows MENOR que PAGINA, a primeira resposta ja viria "incompleta" e uma
// parada por tamanho truncaria em silencio — que e exatamente o corte que esta
// paginacao existe para evitar.
//
// ORDEM TOTAL e obrigatoria: `range` so e coerente entre paginas se o ORDER BY
// for deterministico. Toda consulta paginada aqui termina com um desempate
// unico (id, ou a PK composta), senao a pagina 2 poderia repetir linhas da 1 e
// pular outras — e vinculo pulado vira "curso sem preco" na tela.
const PAGINA = 1000;
type Consulta = {
  range: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
async function buscarTudo(consulta: () => Consulta, contexto: string): Promise<Record<string, unknown>[]> {
  const saida: Record<string, unknown>[] = [];
  for (let de = 0; ; ) {
    const { data, error } = await consulta().range(de, de + PAGINA - 1);
    if (error) throw new Error(`Falha ao carregar ${contexto}: ${error.message}`);
    const linhas = (data ?? []) as Record<string, unknown>[];
    if (linhas.length === 0) return saida;
    saida.push(...linhas);
    de += linhas.length;
  }
}

function formatoValido(v: unknown): FormatoAula | null {
  return typeof v === "string" && (CLASS_FORMATS as readonly string[]).includes(v)
    ? (v as FormatoAula)
    : null;
}

// O embed do PostgREST vem como objeto ou array de um elemento, conforme a
// cardinalidade que ele infere.
function nomeDoMercado(v: unknown): string | null {
  const alvo = Array.isArray(v) ? v[0] : v;
  const nome = (alvo as { name?: unknown } | null | undefined)?.name;
  return typeof nome === "string" && nome.trim() !== "" ? nome.trim() : null;
}

function inteiroPositivo(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Tabelas de preco de CURSO do fornecedor, agrupadas por campus. Tabela sem
 * nenhum curso etiquetado (acomodacao, taxa) fica de fora: esta tela e sobre
 * carga horaria de aula.
 */
export async function listarTabelasPorCargaHoraria(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<PrecosPorCargaHoraria> {
  const vazio: PrecosPorCargaHoraria = { campi: [], todasTabelas: [], todosCursos: [] };

  // 0. Tenant do proprio supplier — a segunda trava de posse. Toda autorizacao
  // e feita em codigo: o banco tem RLS sem policies e nao e rede de protecao.
  const { data: sup, error: supErr } = await supabase
    .from("supplier")
    .select("id, tenant_id")
    .eq("id", supplierId)
    .maybeSingle();
  if (supErr) throw new Error(`Falha ao carregar o fornecedor: ${supErr.message}`);
  const tenantId = (sup as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return vazio;

  // 1. Campus do fornecedor (a fronteira de posse).
  const campiRaw = await buscarTudo(
    () =>
      supabase
        .from("campus")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .eq("supplier_id", supplierId)
        .is("archived_at", null)
        .order("name")
        .order("id") as unknown as Consulta,
    "os campus",
  );
  const campi = campiRaw.map((r) => ({ id: String(r.id), name: r.name == null ? null : String(r.name) }));
  if (campi.length === 0) return vazio;
  const campusIds = campi.map((c) => c.id);

  // 2. Cursos COTAVEIS desses campus + a ficha (carga horaria e formato).
  const produtos: { id: string; name: string; campus_id: string }[] = [];
  for (const bloco of lotes(campusIds)) {
    const linhas = await buscarTudo(
      () =>
        supabase
          .from("product")
          .select("id, name, campus_id")
          .eq("tenant_id", tenantId)
          .in("campus_id", bloco)
          .eq("kind", "program")
          .eq("status", "active")
          .in("visibility", VISIBILIDADE_COTAVEL)
          .is("archived_at", null)
          .order("name")
          .order("id") as unknown as Consulta,
      "os cursos",
    );
    for (const r of linhas) {
      produtos.push({ id: String(r.id), name: String(r.name ?? ""), campus_id: String(r.campus_id) });
    }
  }
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));

  const fichaPorProduto = new Map<string, { lpw: number | null; fmt: FormatoAula | null }>();
  for (const bloco of lotes(produtos.map((p) => p.id))) {
    const linhas = await buscarTudo(
      () =>
        supabase
          .from("program_detail")
          .select("product_id, lessons_per_week, format")
          .in("product_id", bloco)
          .order("product_id") as unknown as Consulta,
      "as fichas dos cursos",
    );
    for (const r of linhas) {
      fichaPorProduto.set(String(r.product_id), {
        lpw: inteiroPositivo(r.lessons_per_week),
        fmt: formatoValido(r.format),
      });
    }
  }

  // 3. Tabelas de preco dos campus. Inclui as vencidas e as que ainda vao
  // comecar: e o historico que mostra se a vigencia do ano seguinte ja foi
  // aberta.
  const templates: Record<string, unknown>[] = [];
  for (const bloco of lotes(campusIds)) {
    const linhas = await buscarTudo(
      () =>
        supabase
          .from("price_template")
          .select(
            "id, campus_id, name, unit, currency, market_id, valid_from, valid_until, status, archived_at, source_submission_id, market(name)",
          )
          .eq("tenant_id", tenantId)
          .in("campus_id", bloco)
          .order("valid_from", { ascending: false })
          .order("id") as unknown as Consulta,
      "as tabelas de preço",
    );
    templates.push(...linhas);
  }

  const nomeDoCampus = new Map(campi.map((c) => [c.id, c.name ?? "Campus"]));
  const todosCursos: CursoSimples[] = produtos.map((p) => ({
    id: p.id,
    nome: p.name,
    campusNome: nomeDoCampus.get(p.campus_id) ?? null,
  }));
  if (templates.length === 0) {
    return {
      campi: campi.map((c) => ({ campusId: c.id, campusNome: c.name ?? "Campus", tabelas: [] })),
      todasTabelas: [],
      todosCursos,
    };
  }
  const templateIds = templates.map((t) => String(t.id));

  // 4. Faixas.
  const faixasPorTemplate = new Map<string, { minQuantity: number; unitPrice: number }[]>();
  for (const bloco of lotes(templateIds)) {
    const linhas = await buscarTudo(
      () =>
        supabase
          .from("price_tier")
          .select("price_template_id, min_quantity, unit_price")
          .in("price_template_id", bloco)
          .order("min_quantity")
          .order("price_template_id") as unknown as Consulta,
      "as faixas de preço",
    );
    for (const r of linhas) {
      const id = String(r.price_template_id);
      const arr = faixasPorTemplate.get(id) ?? [];
      arr.push({ minQuantity: Number(r.min_quantity) || 0, unitPrice: Number(r.unit_price) || 0 });
      faixasPorTemplate.set(id, arr);
    }
  }

  // 5. Vinculos tabela <-> curso (a relacao N:N que esta tela le ao contrario:
  // a tabela como objeto, os cursos como etiquetas).
  const cursosPorTemplate = new Map<string, CursoDaTabela[]>();
  for (const bloco of lotes(templateIds)) {
    const linhas = await buscarTudo(
      () =>
        supabase
          .from("price_template_product")
          .select("price_template_id, product_id")
          .in("price_template_id", bloco)
          .order("price_template_id")
          .order("product_id") as unknown as Consulta,
      "os vínculos entre tabela e curso",
    );
    for (const r of linhas) {
      const produto = produtoPorId.get(String(r.product_id));
      if (!produto) continue; // acomodacao, taxa, produto arquivado ou nao cotavel
      const ficha = fichaPorProduto.get(produto.id);
      const id = String(r.price_template_id);
      const arr = cursosPorTemplate.get(id) ?? [];
      arr.push({
        id: produto.id,
        nome: produto.name,
        lessonsPerWeek: ficha?.lpw ?? null,
        formato: ficha?.fmt ?? null,
      });
      cursosPorTemplate.set(id, arr);
    }
  }

  // 6. Monta por campus, descartando a tabela sem nenhum curso etiquetado.
  const porCampus = new Map<string, TabelaCargaHoraria[]>();
  const todasTabelas: TabelaCargaHoraria[] = [];
  for (const t of templates) {
    const id = String(t.id);
    const cursos = (cursosPorTemplate.get(id) ?? []).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
    if (cursos.length === 0) continue;
    const tabela: TabelaCargaHoraria = {
      id,
      nomeCadastrado: String(t.name ?? ""),
      unit: String(t.unit ?? ""),
      currency: String(t.currency ?? ""),
      validFrom: String(t.valid_from ?? ""),
      validUntil: t.valid_until ? String(t.valid_until) : null,
      status: String(t.status ?? ""),
      archivedAt: t.archived_at ? String(t.archived_at) : null,
      marketId: t.market_id ? String(t.market_id) : null,
      marketNome: nomeDoMercado(t.market),
      gerida: t.source_submission_id != null,
      faixas: (faixasPorTemplate.get(id) ?? []).sort((a, b) => a.minQuantity - b.minQuantity),
      cursos,
    };
    todasTabelas.push(tabela);
    const campusId = String(t.campus_id);
    const arr = porCampus.get(campusId) ?? [];
    arr.push(tabela);
    porCampus.set(campusId, arr);
  }

  return {
    campi: campi.map((c) => ({
      campusId: c.id,
      campusNome: c.name ?? "Campus",
      tabelas: porCampus.get(c.id) ?? [],
    })),
    todasTabelas,
    todosCursos,
  };
}
