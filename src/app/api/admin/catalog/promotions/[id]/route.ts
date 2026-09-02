import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarPromocao, arquivarPromocao } from "@/lib/promocao-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroPromocao } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/catalog/promotions/[id] — edita uma promoção do tenant (id da URL).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de promoção inválido.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarPromocao(supabase, { tenantId, actor: g.usuario, ip: g.ip, promotionId: id, entrada: body });
    return okData(r);
  } catch (err) {
    return respostaErroPromocao(err);
  }
}

// DELETE /api/admin/catalog/promotions/[id] — arquiva (expira) uma promoção.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de promoção inválido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    await arquivarPromocao(supabase, { tenantId, actor: g.usuario, ip: g.ip, promotionId: id });
    return okData({ arquivado: true });
  } catch (err) {
    return respostaErroPromocao(err);
  }
}
