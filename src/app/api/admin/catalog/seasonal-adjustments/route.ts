import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid, fail } from "@/lib/catalog-route";
import { salvarAjusteSazonal, arquivarAjusteSazonal, SazonalErro } from "@/lib/sazonal-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/catalog/seasonal-adjustments — ajuste sazonal (alta/baixa
// temporada) de uma acomodacao, editado no hub (Produto > Precos & Taxas).
//   { acao: 'salvar',  ...campos }  -> cria (sem id) ou edita (com id)
//   { acao: 'arquivar', id, productId } -> para de cobrar (nao apaga o rastro)
// Autorizacao por SESSAO com 'fornecedores.gerir' (falha fechada). A posse do
// produto (tenant e, quando enviado, fornecedor) e conferida no servico.
export async function POST(request: Request) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return bad("Corpo JSON inválido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);
    // supplierId vem da URL do hub: restringe a edicao ao fornecedor daquela tela.
    const supplierIdEsperado =
      typeof body.supplierId === "string" && isUuid(body.supplierId) ? body.supplierId : undefined;

    if (body.acao === "arquivar") {
      const id = String(body.id || "");
      const productId = String(body.productId || "");
      if (!isUuid(id) || !isUuid(productId)) return bad("Ajuste inválido.");
      await arquivarAjusteSazonal(supabase, { tenantId, id, productId, actor: g.usuario, ip: g.ip, supplierIdEsperado });
      return okData({ id });
    }

    // id malformado no "salvar" viraria erro cru do Postgres (500) em vez de 400.
    if (body.id !== undefined && body.id !== null && body.id !== "" && !isUuid(String(body.id))) {
      return bad("Ajuste inválido.");
    }

    const r = await salvarAjusteSazonal(supabase, { tenantId, corpo: body, actor: g.usuario, ip: g.ip, supplierIdEsperado });
    return okData(r);
  } catch (err) {
    if (err instanceof SazonalErro) {
      switch (err.codigo) {
        case "validacao":
          return NextResponse.json(
            { ok: false, error: { code: "validacao", message: "Há campos inválidos." }, falhas: err.falhas ?? [] },
            { status: 400 },
          );
        case "produto_invalido":
          return bad("Acomodação não encontrada para este fornecedor.", "produto_invalido", 404);
        case "nao_encontrado":
          return bad("Ajuste não encontrado para esta acomodação.", "nao_encontrado", 404);
        case "faixa_sobreposta":
          return bad(
            "Já existe um ajuste do mesmo tipo e período cobrindo essa faixa de semanas — a estadia seria cobrada duas vezes.",
            "faixa_sobreposta",
            409,
          );
        default:
          return bad("Não foi possível salvar o ajuste.", "falha_persistir", 500);
      }
    }
    return fail(err);
  }
}
