// Servico de ESCRITA do CONTEUDO editorial + MIDIA de um produto
// (product_content por locale + product_media) pela Area Administrativa.
// SERVER-ONLY (service role).
//
// POSSE: o produto tem que ser do tenant (checado ANTES de validar/escrever).
// A operacao SUBSTITUI os conjuntos de conteudo e midia do produto (delete +
// insert). Conteudo editorial nao e dinheiro/compliance — sem transacao no
// PostgREST, guardamos um snapshot e restauramos numa falha parcial.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarConteudoProduto, type Falha, type ConteudoLocale, type MidiaItem } from "@/lib/produto-conteudo";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class ConteudoAdminErro extends Error {
  constructor(
    public codigo: "validacao" | "produto_nao_encontrado" | "falha_persistir",
    public falhas?: Falha[],
  ) {
    super(codigo);
    this.name = "ConteudoAdminErro";
  }
}

async function produtoDoTenant(supabase: SupabaseClient, tenantId: string, productId: string): Promise<boolean> {
  const { data } = await supabase.from("product").select("id, tenant_id").eq("id", productId).maybeSingle();
  return !!data && (data as { tenant_id?: string }).tenant_id === tenantId;
}

async function snapshotConteudo(supabase: SupabaseClient, productId: string): Promise<any[]> {
  const { data } = await supabase
    .from("product_content")
    .select("locale, description_html, highlights, inclusions, exclusions, is_machine_translated")
    .eq("product_id", productId);
  return data ?? [];
}

async function snapshotMedia(supabase: SupabaseClient, productId: string): Promise<any[]> {
  const { data } = await supabase
    .from("product_media")
    .select("url, kind, sort, caption")
    .eq("product_id", productId);
  return data ?? [];
}

function linhasConteudo(productId: string, content: ConteudoLocale[]) {
  return content.map((c) => ({
    product_id: productId,
    locale: c.locale,
    description_html: c.description_html,
    highlights: c.highlights,
    inclusions: c.inclusions,
    exclusions: c.exclusions,
    is_machine_translated: c.is_machine_translated,
  }));
}

function linhasMedia(tenantId: string, productId: string, media: MidiaItem[]) {
  return media.map((m) => ({
    tenant_id: tenantId,
    product_id: productId,
    url: m.url,
    kind: m.kind,
    sort: m.sort,
    caption: m.caption,
  }));
}

// Substitui conteudo + midia numa passada (delete+insert). Lanca em erro de banco.
async function persistir(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
  content: ConteudoLocale[],
  media: MidiaItem[],
): Promise<void> {
  const { error: eDelC } = await supabase.from("product_content").delete().eq("product_id", productId);
  if (eDelC) throw comFalha("limpar conteúdo", eDelC.message);
  if (content.length > 0) {
    const { error } = await supabase.from("product_content").insert(linhasConteudo(productId, content));
    if (error) throw comFalha("inserir conteúdo", error.message);
  }
  const { error: eDelM } = await supabase.from("product_media").delete().eq("tenant_id", tenantId).eq("product_id", productId);
  if (eDelM) throw comFalha("limpar mídia", eDelM.message);
  if (media.length > 0) {
    const { error } = await supabase.from("product_media").insert(linhasMedia(tenantId, productId, media));
    if (error) throw comFalha("inserir mídia", error.message);
  }
}

function comFalha(passo: string, msg: string): ConteudoAdminErro {
  console.error(`[conteudo] ${passo}:`, msg);
  return new ConteudoAdminErro("falha_persistir");
}

export type SalvarConteudoArgs = {
  tenantId: string;
  actor: string;
  ip?: string | null;
  productId: string; // vem da URL (server)
  content: unknown; // corpo cru
  media: unknown; // corpo cru
};

export async function salvarConteudoProduto(
  supabase: SupabaseClient,
  args: SalvarConteudoArgs,
): Promise<{ locales: number; midias: number }> {
  const { tenantId, actor, ip, productId } = args;

  if (!(await produtoDoTenant(supabase, tenantId, productId))) {
    throw new ConteudoAdminErro("produto_nao_encontrado");
  }

  // product_id vem da URL (server), nunca do corpo.
  const r = validarConteudoProduto({ product_id: productId, content: args.content, media: args.media });
  if (!r.ok) throw new ConteudoAdminErro("validacao", r.falhas);
  const { content, media } = r.valor;

  const snapC = await snapshotConteudo(supabase, productId);
  const snapM = await snapshotMedia(supabase, productId);

  try {
    await persistir(supabase, tenantId, productId, content, media);
  } catch (e) {
    // Restaura os conjuntos anteriores (best-effort).
    try {
      await supabase.from("product_content").delete().eq("product_id", productId);
      if (snapC.length > 0) await supabase.from("product_content").insert(snapC.map((c) => ({ product_id: productId, ...c })));
      await supabase.from("product_media").delete().eq("tenant_id", tenantId).eq("product_id", productId);
      if (snapM.length > 0) await supabase.from("product_media").insert(snapM.map((m) => ({ tenant_id: tenantId, product_id: productId, ...m })));
    } catch (err) {
      console.error("[conteudo] restauracao apos falha falhou:", err instanceof Error ? err.message : err);
    }
    throw e;
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: actor,
    acao: "produto.conteudo.definir",
    alvo: productId,
    detalhe: { locales: content.length, midias: media.length },
    ip: ip ?? null,
  });

  return { locales: content.length, midias: media.length };
}

// Leitura para a UI: conteudo + midia atuais do produto (se do tenant), ou null.
export async function obterConteudoProdutoAdmin(
  supabase: SupabaseClient,
  tenantId: string,
  productId: string,
): Promise<{ content: any[]; media: any[] } | null> {
  if (!(await produtoDoTenant(supabase, tenantId, productId))) return null;
  const [content, media] = await Promise.all([snapshotConteudo(supabase, productId), snapshotMediaOrdenada(supabase, productId)]);
  return { content, media };
}

async function snapshotMediaOrdenada(supabase: SupabaseClient, productId: string): Promise<any[]> {
  const { data } = await supabase
    .from("product_media")
    .select("url, kind, sort, caption")
    .eq("product_id", productId)
    .order("sort");
  return data ?? [];
}
