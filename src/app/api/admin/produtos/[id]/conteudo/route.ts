import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarConteudoProduto, ConteudoAdminErro } from "@/lib/produto-conteudo-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/produtos/[id]/conteudo — substitui o conteúdo editorial + a
// mídia do produto. O id vem da URL. Body: { content: [...], media: [...] }.
// Autorização por SESSÃO com 'fornecedores.gerir'.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de produto inválido.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarConteudoProduto(supabase, {
      tenantId,
      actor: g.usuario,
      ip: g.ip,
      productId: id,
      content: (body as { content?: unknown }).content,
      media: (body as { media?: unknown }).media,
    });
    return okData(r);
  } catch (err) {
    if (err instanceof ConteudoAdminErro) {
      switch (err.codigo) {
        case "validacao":
          return NextResponse.json(
            { ok: false, error: { code: "validacao", message: "Há campos inválidos." }, falhas: err.falhas ?? [] },
            { status: 400 },
          );
        case "produto_nao_encontrado":
          return bad("Produto não encontrado.", "nao_encontrado", 404);
        default:
          console.error("[conteudo] falha ao persistir");
          return NextResponse.json(
            { ok: false, error: { code: "erro_interno", message: "Erro interno ao salvar o conteúdo." } },
            { status: 500 },
          );
      }
    }
    console.error("[conteudo] erro inesperado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: { code: "erro_interno", message: "Erro interno." } }, { status: 500 });
  }
}
