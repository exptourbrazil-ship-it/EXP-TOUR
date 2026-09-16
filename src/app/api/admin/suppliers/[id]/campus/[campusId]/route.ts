import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarCampusAdmin, arquivarCampusAdmin } from "@/lib/campus-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroCampus } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/suppliers/[id]/campus/[campusId] — edita um campus do fornecedor.
// Posse dupla (tenant + fornecedor) conferida no servico.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; campusId: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id: supplierId, campusId } = await params;
  if (!isUuid(supplierId) || !isUuid(campusId)) return bad("Identificador inválido.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarCampusAdmin(supabase, {
      tenantId,
      supplierId,
      actor: g.usuario,
      ip: g.ip,
      campusId,
      entrada: body,
    });
    return okData(r);
  } catch (err) {
    return respostaErroCampus(err);
  }
}

// DELETE /api/admin/suppliers/[id]/campus/[campusId] — arquiva (soft-delete).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; campusId: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id: supplierId, campusId } = await params;
  if (!isUuid(supplierId) || !isUuid(campusId)) return bad("Identificador inválido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    await arquivarCampusAdmin(supabase, { tenantId, supplierId, actor: g.usuario, ip: g.ip, campusId });
    return okData({ id: campusId, arquivado: true });
  } catch (err) {
    return respostaErroCampus(err);
  }
}
