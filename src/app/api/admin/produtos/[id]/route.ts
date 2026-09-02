import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarProdutoAdmin, arquivarProdutoAdmin } from "@/lib/produto-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroProduto } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/produtos/[id] — edita um produto do tenant (o id vem da URL,
// nunca do corpo). O kind e imutavel (o servico recusa a troca). Autorizacao por
// SESSAO com 'fornecedores.gerir'.
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
    const r = await salvarProdutoAdmin(supabase, {
      tenantId,
      actor: g.usuario,
      ip: g.ip,
      productId: id,
      entrada: body,
    });
    return okData(r);
  } catch (err) {
    return respostaErroProduto(err);
  }
}

// DELETE /api/admin/produtos/[id] — arquiva (soft-delete) um produto do tenant.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de produto inválido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    await arquivarProdutoAdmin(supabase, { tenantId, actor: g.usuario, ip: g.ip, productId: id });
    return okData({ arquivado: true });
  } catch (err) {
    return respostaErroProduto(err);
  }
}
