import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import {
  obterOuCriarRascunho,
  salvarRascunhoConteudo,
  enviarConteudoParaAdmin,
} from "@/lib/content-submission-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conteúdo de programa proposto pela escola (Fase B1). JSON:
//  - acao "iniciar": abre/reusa o rascunho de um produto (productId) e o devolve.
//  - acao "salvar":  grava o payload do rascunho (id).
//  - acao "aprovar": envia para a EXP Tour (id; draft -> pending_admin).
// Posse sempre pelo supplier_id da sessão.
export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const supabase = getServiceClient();
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");

  if (acao === "iniciar") {
    const productId = String(body?.productId || "");
    if (!productId) return NextResponse.json({ ok: false, erro: "Programa ausente." }, { status: 400 });
    const tenantId = await tenantIdAtual(supabase);
    const r = await obterOuCriarRascunho(supabase, {
      tenantId,
      supplierId: sessao.supplierId,
      productId,
      createdBy: sessao.email,
    });
    return r.ok
      ? NextResponse.json({ ok: true, detalhe: r.detalhe })
      : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }

  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "Rascunho ausente." }, { status: 400 });

  if (acao === "salvar") {
    const r = await salvarRascunhoConteudo(supabase, sessao.supplierId, id, body?.payload);
    return r.ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, erro: r.erro, falhas: r.falhas ?? [] }, { status: 400 });
  }
  if (acao === "aprovar") {
    const r = await enviarConteudoParaAdmin(supabase, sessao.supplierId, id, sessao.email);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }
  return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
}
