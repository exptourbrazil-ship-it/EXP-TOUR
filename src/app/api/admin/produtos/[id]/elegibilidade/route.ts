import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { salvarElegibilidade, ElegibilidadeAdminErro } from "@/lib/elegibilidade-admin-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/produtos/[id]/elegibilidade — substitui o conjunto de regras de
// elegibilidade do produto. O id vem da URL (nunca do corpo). Body: { regras: [...] }.
// Autorização por SESSÃO com 'fornecedores.gerir'.
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
    const r = await salvarElegibilidade(supabase, {
      tenantId,
      actor: g.usuario,
      ip: g.ip,
      productId: id,
      regras: (body as { regras?: unknown }).regras,
      justificativa: (body as { justificativa?: unknown }).justificativa,
    });
    return okData(r);
  } catch (err) {
    if (err instanceof ElegibilidadeAdminErro) {
      switch (err.codigo) {
        case "validacao":
          return NextResponse.json(
            { ok: false, error: { code: "validacao", message: "Há regras inválidas." }, falhas: err.falhas ?? [] },
            { status: 400 },
          );
        case "produto_nao_encontrado":
          return bad("Produto não encontrado.", "nao_encontrado", 404);
        case "justificativa_obrigatoria":
          return bad(
            "Remover uma regra bloqueante exige uma justificativa (mín. 10 caracteres).",
            "justificativa_obrigatoria",
            400,
          );
        case "migracao_ausente":
          return bad(
            "Função de banco 'substituir_elegibilidade' ainda não aplicada. Rode a migração antes de editar a elegibilidade.",
            "migracao_ausente",
            503,
          );
        default:
          console.error("[elegibilidade] falha ao persistir");
          return NextResponse.json(
            { ok: false, error: { code: "erro_interno", message: "Erro interno ao salvar as regras." } },
            { status: 500 },
          );
      }
    }
    console.error("[elegibilidade] erro inesperado:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: { code: "erro_interno", message: "Erro interno." } }, { status: 500 });
  }
}
