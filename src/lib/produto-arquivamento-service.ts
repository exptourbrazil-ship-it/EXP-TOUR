// Serviço SERVER-ONLY (service role) do arquivamento de produtos/tabelas no hub:
// impacto (informativo, para a confirmação) e arquivamento em lote dos INATIVOS
// de um fornecedor. A decisão de bloqueio mora em arquivamento.ts (puro) e em
// arquivarProdutoAdmin (guarda de integridade). Tudo escopado por tenant + supplier.
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import {
  arquivarProdutoAdmin,
  pacotesQueUsamProdutos,
  ProdutoAdminErro,
} from "@/lib/produto-admin-service";
import { campusIdsDoFornecedor } from "@/lib/fornecedor-hub-service";
import {
  LIMITE_ARQUIVAR_LOTE,
  executarLote,
  produtosSemTabelaAposArquivar,
  selecionarInativos,
  type TabelaVigencia,
} from "@/lib/arquivamento";

// Impacto de arquivar UM produto: pacotes que o usam (bloqueiam) e cotações em
// RASCUNHO que o contêm (informativo). Produto de outro tenant => null.
export async function impactoArquivarProduto(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
): Promise<{ nome: string; pacotes: string[]; cotacoesRascunho: number } | null> {
  const { data: prod } = await supabase
    .from("product")
    .select("id, name")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!prod) return null;

  const bloqueios = await pacotesQueUsamProdutos(supabase, tenantId, [productId]);

  // item -> opção -> cotação em rascunho (3 passos, sempre com tenant_id).
  let cotacoesRascunho = 0;
  const { data: itens } = await supabase
    .from("quote_item")
    .select("quote_option_id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);
  const opcaoIds = [...new Set((itens ?? []).map((i: any) => i.quote_option_id as string))];
  if (opcaoIds.length > 0) {
    const { data: ops } = await supabase.from("quote_option").select("quote_id").eq("tenant_id", tenantId).in("id", opcaoIds);
    const quoteIds = [...new Set((ops ?? []).map((o: any) => o.quote_id as string))];
    if (quoteIds.length > 0) {
      const { data: qs } = await supabase
        .from("quote")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
        .in("id", quoteIds);
      cotacoesRascunho = qs?.length ?? 0;
    }
  }
  return { nome: (prod as { name: string }).name, pacotes: bloqueios.get(productId) ?? [], cotacoesRascunho };
}

export type ResultadoLote = {
  arquivados: number;
  ignorados: Array<{ id: string; nome: string; motivo: string }>;
  // Inativos que não couberam no limite de segurança desta chamada.
  restantes: number;
};

// Arquiva em lote os produtos INATIVOS (opcionalmente de um kind) do fornecedor.
// Reaproveita arquivarProdutoAdmin (guarda de pacote incluída): o que não puder
// ser arquivado volta em `ignorados` com o motivo, sem derrubar o lote.
export async function arquivarInativosDoFornecedor(
  supabase: SupabaseClient,
  args: { tenantId: string; actor: string; ip?: string | null; supplierId: string; kind?: string | null },
): Promise<ResultadoLote> {
  const { tenantId, actor, ip, supplierId, kind } = args;
  const campusIds = await campusIdsDoFornecedor(supabase, tenantId, supplierId);
  if (campusIds.length === 0) return { arquivados: 0, ignorados: [], restantes: 0 };

  let q = supabase
    .from("product")
    .select("id, kind, name, status")
    .eq("tenant_id", tenantId)
    .in("campus_id", campusIds)
    .eq("status", "inactive")
    .is("archived_at", null);
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) {
    console.error("[produtos] listar inativos:", error.message);
    throw new ProdutoAdminErro("falha_persistir");
  }
  const todos = selecionarInativos((data ?? []) as Array<{ id: string; kind: string; name: string; status: string }>, kind);
  const lote = todos.slice(0, LIMITE_ARQUIVAR_LOTE);
  // Só pacotes EFETIVAMENTE arquivados liberam seus itens (set atualizado no
  // laço; pacotes vêm primeiro). Pacote que falhou mantém os itens bloqueados.
  const { arquivadosIds: idsArquivados, ignorados } = await executarLote(
    lote,
    (p, pacotesArquivados) =>
      arquivarProdutoAdmin(supabase, {
        tenantId,
        actor,
        ip,
        productId: p.id,
        ignorarPacoteIds: pacotesArquivados,
        supplierEsperado: supplierId,
        semAuditoria: true,
        exigirInativo: true,
      }),
    (e) => (e instanceof ProdutoAdminErro && e.mensagem ? e.mensagem : "Falha ao arquivar (veja o log do servidor)."),
  );

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "produto.arquivar_lote",
    alvo: supplierId,
    detalhe: {
      kind: kind ?? null,
      arquivados: idsArquivados.length,
      ignorados: ignorados.length,
      ids: idsArquivados,
    },
    ip: ip ?? null,
  });

  return { arquivados: idsArquivados.length, ignorados, restantes: todos.length - lote.length };
}

// Produtos ATIVOS que ficariam sem tabela de preço vigente se a tabela fosse
// arquivada (informativo). Tudo por tenant. Tabela de outro tenant => null.
export async function impactoArquivarTabela(
  supabase: SupabaseClient,
  tenantId: string,
  templateId: string,
  hoje: string,
): Promise<{ produtosSemTabela: string[] } | null> {
  const { data: tpl } = await supabase
    .from("price_template")
    .select("id")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!tpl) return null;

  const { data: vinc } = await supabase.from("price_template_product").select("product_id").eq("price_template_id", templateId);
  const prodIds = [...new Set((vinc ?? []).map((v: any) => v.product_id as string))];
  if (prodIds.length === 0) return { produtosSemTabela: [] };

  const { data: prods } = await supabase
    .from("product")
    .select("id, name, status")
    .eq("tenant_id", tenantId)
    .in("id", prodIds)
    .is("archived_at", null);
  const { data: todosVinc } = await supabase
    .from("price_template_product")
    .select("product_id, price_template_id")
    .in("product_id", prodIds);
  const tplIds = [...new Set((todosVinc ?? []).map((v: any) => v.price_template_id as string))];
  const { data: tpls } = await supabase
    .from("price_template")
    .select("id, status, valid_from, valid_until")
    .eq("tenant_id", tenantId)
    .in("id", tplIds)
    .is("archived_at", null);
  const porId = new Map((tpls ?? []).map((t: any) => [t.id as string, t as TabelaVigencia]));
  const mapa = new Map<string, TabelaVigencia[]>();
  for (const v of (todosVinc ?? []) as Array<{ product_id: string; price_template_id: string }>) {
    const t = porId.get(v.price_template_id);
    if (t) mapa.set(v.product_id, [...(mapa.get(v.product_id) ?? []), t]);
  }
  return {
    produtosSemTabela: produtosSemTabelaAposArquivar(templateId, (prods ?? []) as any[], mapa, hoje),
  };
}
