import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarPromocao, PromocaoAdminErro } from "@/lib/promocao-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/catalog/promotions — cria uma promoção (+ segmentos).
// Autorização por SESSÃO com 'fornecedores.gerir'. Corpo validado pelo motor puro.
export async function POST(request: Request) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarPromocao(supabase, { tenantId, actor: g.usuario, ip: g.ip, entrada: body });
    return okData(r);
  } catch (err) {
    return respostaErroPromocao(err);
  }
}

export function respostaErroPromocao(err: unknown): NextResponse {
  if (err instanceof PromocaoAdminErro) {
    switch (err.codigo) {
      case "validacao":
        return NextResponse.json(
          { ok: false, error: { code: "validacao", message: "Há campos inválidos." }, falhas: err.falhas ?? [] },
          { status: 400 },
        );
      case "supplier_invalido":
        return bad("Fornecedor inválido para este tenant.", "supplier_invalido", 400);
      case "campus_invalido":
        return bad("Campus inválido (deve ser deste tenant e do fornecedor).", "campus_invalido", 400);
      case "ref_invalido":
        return bad("Alvo específico inválido (taxa ou produto deste tenant).", "ref_invalido", 400);
      case "promocao_nao_encontrada":
        return bad("Promoção não encontrada.", "nao_encontrado", 404);
      default:
        console.error("[promocoes] falha ao persistir");
        return NextResponse.json(
          { ok: false, error: { code: "erro_interno", message: "Erro interno ao salvar a promoção." } },
          { status: 500 },
        );
    }
  }
  console.error("[promocoes] erro inesperado:", err instanceof Error ? err.message : err);
  return NextResponse.json({ ok: false, error: { code: "erro_interno", message: "Erro interno." } }, { status: 500 });
}
