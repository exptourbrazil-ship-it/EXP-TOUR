import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarProdutoAdmin, ProdutoAdminErro } from "@/lib/produto-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData } from "@/lib/catalog-route";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/produtos — cria um produto (qualquer vertical). Body: o corpo
// cru validado pelo motor puro `validarProduto` (kind, name, campus_id, ...,
// detail). Autorizacao por SESSAO com 'fornecedores.gerir' (Gestor + Operacao).
export async function POST(request: Request) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarProdutoAdmin(supabase, {
      tenantId,
      actor: g.usuario,
      ip: g.ip,
      entrada: body,
    });
    return okData(r);
  } catch (err) {
    return respostaErroProduto(err);
  }
}

// Mapeia o erro de dominio do servico de produto para HTTP + mensagem. As falhas
// de validacao (por campo) sao devolvidas ao cliente para o formulario destacar.
export function respostaErroProduto(err: unknown): NextResponse {
  if (err instanceof ProdutoAdminErro) {
    switch (err.codigo) {
      case "validacao":
        return NextResponse.json(
          { ok: false, error: { code: "validacao", message: "Há campos inválidos." }, falhas: err.falhas ?? [] },
          { status: 400 },
        );
      case "campus_invalido":
        return bad("Campus inválido para este tenant.", "campus_invalido", 400);
      case "produto_nao_encontrado":
        return bad("Produto não encontrado.", "nao_encontrado", 404);
      case "kind_imutavel":
        return bad("O tipo do produto (kind) não pode ser alterado.", "kind_imutavel", 409);
      case "item_invalido":
        return bad("Item de pacote inválido (deve ser um produto deste tenant e diferente do próprio pacote).", "item_invalido", 400);
      default:
        console.error("[produtos] falha ao persistir");
        return NextResponse.json(
          { ok: false, error: { code: "erro_interno", message: "Erro interno ao salvar o produto." } },
          { status: 500 },
        );
    }
  }
  console.error("[produtos] erro inesperado:", err instanceof Error ? err.message : err);
  return NextResponse.json(
    { ok: false, error: { code: "erro_interno", message: "Erro interno." } },
    { status: 500 },
  );
}
