import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarCampusAdmin, CampusAdminErro } from "@/lib/campus-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/suppliers/[id]/campus — cria um campus para o fornecedor [id]
// (hub, aba "Meus Campi"). Body: corpo cru validado pelo motor puro validarCampus.
// Autorizacao por SESSAO com 'fornecedores.gerir' (falha fechada). A posse do
// fornecedor no tenant e conferida no servico.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id: supplierId } = await params;
  if (!isUuid(supplierId)) return bad("Fornecedor inválido.");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarCampusAdmin(supabase, { tenantId, supplierId, actor: g.usuario, ip: g.ip, entrada: body });
    return okData(r);
  } catch (err) {
    return respostaErroCampus(err);
  }
}

// Mapeia o erro de dominio do servico de campus para HTTP + mensagem. As falhas
// de validacao (por campo) voltam ao cliente para o formulario destacar.
export function respostaErroCampus(err: unknown): NextResponse {
  if (err instanceof CampusAdminErro) {
    switch (err.codigo) {
      case "validacao":
        return NextResponse.json(
          { ok: false, error: { code: "validacao", message: "Há campos inválidos." }, falhas: err.falhas ?? [] },
          { status: 400 },
        );
      case "supplier_invalido":
        return bad("Fornecedor não encontrado neste tenant.", "supplier_invalido", 404);
      case "campus_nao_encontrado":
        return bad("Campus não encontrado para este fornecedor.", "nao_encontrado", 404);
      case "rascunho_duplicado":
        return bad(
          "Só pode existir um campus em rascunho por fornecedor — e este fornecedor já tem um. Ative ou edite o rascunho existente.",
          "rascunho_duplicado",
          409,
        );
      default:
        console.error("[campus] falha ao persistir");
        return NextResponse.json(
          { ok: false, error: { code: "erro_interno", message: "Erro interno ao salvar o campus." } },
          { status: 500 },
        );
    }
  }
  console.error("[campus] erro inesperado:", err instanceof Error ? err.message : err);
  return NextResponse.json({ ok: false, error: { code: "erro_interno", message: "Erro interno." } }, { status: 500 });
}
