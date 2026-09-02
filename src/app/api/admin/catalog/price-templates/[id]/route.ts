import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarTabelaPreco, arquivarTabelaPreco } from "@/lib/price-template-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroPreco } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/catalog/price-templates/[id] — edita uma tabela manual do
// tenant (o id vem da URL). Recusa tabela gerida por price list. Autorização por
// SESSÃO com 'fornecedores.gerir'.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de tabela inválido.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarTabelaPreco(supabase, { tenantId, actor: g.usuario, ip: g.ip, templateId: id, entrada: body });
    return okData(r);
  } catch (err) {
    return respostaErroPreco(err);
  }
}

// DELETE /api/admin/catalog/price-templates/[id] — arquiva (expira) uma tabela
// manual do tenant.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de tabela inválido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    await arquivarTabelaPreco(supabase, { tenantId, actor: g.usuario, ip: g.ip, templateId: id });
    return okData({ arquivado: true });
  } catch (err) {
    return respostaErroPreco(err);
  }
}
