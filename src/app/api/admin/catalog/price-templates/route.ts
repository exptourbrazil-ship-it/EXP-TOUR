import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarTabelaPreco, PrecoAdminErro } from "@/lib/price-template-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/catalog/price-templates — cria uma tabela de preço manual
// (template + faixas + vínculo a produtos). Autorização por SESSÃO com
// 'fornecedores.gerir' (Gestor + Operação). Corpo validado pelo motor puro.
export async function POST(request: Request) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON invalido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    const r = await salvarTabelaPreco(supabase, { tenantId, actor: g.usuario, ip: g.ip, entrada: body });
    return okData(r);
  } catch (err) {
    return respostaErroPreco(err);
  }
}

// Mapeia o erro de domínio para HTTP + mensagem. As falhas de validação (por
// campo) voltam ao cliente para o formulário destacar.
export function respostaErroPreco(err: unknown): NextResponse {
  if (err instanceof PrecoAdminErro) {
    switch (err.codigo) {
      case "validacao":
        return NextResponse.json(
          { ok: false, error: { code: "validacao", message: "Há campos inválidos." }, falhas: err.falhas ?? [] },
          { status: 400 },
        );
      case "campus_invalido":
        return bad("Campus inválido para este tenant.", "campus_invalido", 400);
      case "market_invalido":
        return bad("Mercado inválido para este tenant.", "market_invalido", 400);
      case "produto_invalido":
        return bad("Produto inválido (deve ser deste tenant e do mesmo campus da tabela).", "produto_invalido", 400);
      case "template_nao_encontrado":
        return bad("Tabela de preço não encontrada.", "nao_encontrado", 404);
      case "template_gerido":
        return bad("Esta tabela veio de um price list de escola e é gerida por aquele fluxo.", "template_gerido", 409);
      default:
        console.error("[precos] falha ao persistir");
        return NextResponse.json(
          { ok: false, error: { code: "erro_interno", message: "Erro interno ao salvar a tabela de preço." } },
          { status: 500 },
        );
    }
  }
  console.error("[precos] erro inesperado:", err instanceof Error ? err.message : err);
  return NextResponse.json({ ok: false, error: { code: "erro_interno", message: "Erro interno." } }, { status: 500 });
}
