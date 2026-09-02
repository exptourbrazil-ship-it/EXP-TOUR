import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarTaxa, arquivarTaxa } from "@/lib/fee-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { respostaErroTaxa } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/catalog/fees/[id] — edita uma taxa manual do tenant (id da URL).
// Recusa taxa gerida por price list. Autorização por SESSÃO com 'fornecedores.gerir'.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de taxa inválido.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarTaxa(supabase, { tenantId, actor: g.usuario, ip: g.ip, feeId: id, entrada: body });
    return okData(r);
  } catch (err) {
    return respostaErroTaxa(err);
  }
}

// DELETE /api/admin/catalog/fees/[id] — arquiva (soft-delete) uma taxa manual.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id } = await params;
  if (!isUuid(id)) return bad("Id de taxa inválido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    await arquivarTaxa(supabase, { tenantId, actor: g.usuario, ip: g.ip, feeId: id });
    return okData({ arquivado: true });
  } catch (err) {
    return respostaErroTaxa(err);
  }
}
