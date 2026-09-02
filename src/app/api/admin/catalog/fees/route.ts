import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarTaxa, TaxaAdminErro } from "@/lib/fee-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/catalog/fees — cria uma taxa manual (fee + vínculo a produtos).
// Autorização por SESSÃO com 'fornecedores.gerir'. Corpo validado pelo motor puro.
export async function POST(request: Request) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarTaxa(supabase, { tenantId, actor: g.usuario, ip: g.ip, entrada: body });
    return okData(r);
  } catch (err) {
    return respostaErroTaxa(err);
  }
}

export function respostaErroTaxa(err: unknown): NextResponse {
  if (err instanceof TaxaAdminErro) {
    switch (err.codigo) {
      case "validacao":
        return NextResponse.json(
          { ok: false, error: { code: "validacao", message: "Há campos inválidos." }, falhas: err.falhas ?? [] },
          { status: 400 },
        );
      case "campus_invalido":
        return bad("Campus inválido para este tenant.", "campus_invalido", 400);
      case "template_invalido":
        return bad("Tabela de preço inválida (deve ser deste tenant e do mesmo campus).", "template_invalido", 400);
      case "produto_invalido":
        return bad("Produto inválido (deve ser deste tenant e do mesmo campus da taxa).", "produto_invalido", 400);
      case "taxa_nao_encontrada":
        return bad("Taxa não encontrada.", "nao_encontrado", 404);
      case "taxa_gerida":
        return bad("Esta taxa veio de um price list de escola e é gerida por aquele fluxo.", "taxa_gerida", 409);
      default:
        console.error("[taxas] falha ao persistir");
        return NextResponse.json(
          { ok: false, error: { code: "erro_interno", message: "Erro interno ao salvar a taxa." } },
          { status: 500 },
        );
    }
  }
  console.error("[taxas] erro inesperado:", err instanceof Error ? err.message : err);
  return NextResponse.json({ ok: false, error: { code: "erro_interno", message: "Erro interno." } }, { status: 500 });
}
