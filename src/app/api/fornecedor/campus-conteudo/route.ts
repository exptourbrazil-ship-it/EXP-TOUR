import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import {
  obterOuCriarRascunhoCampus,
  salvarRascunhoCampus,
  enviarConteudoCampusParaAdmin,
} from "@/lib/campus-content-submission-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conteúdo de ESCOLA proposto pela escola (Fase B2). JSON:
//  - "iniciar": abre/reusa o rascunho de um campus (campusId) e o devolve.
//  - "salvar":  grava o payload do rascunho (id).
//  - "aprovar": envia para a EXP Tour (id; draft -> pending_admin).
// Posse sempre pelo supplier_id da sessão.
export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });

  const supabase = getServiceClient();
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");

  if (acao === "iniciar") {
    const campusId = String(body?.campusId || "");
    if (!campusId) return NextResponse.json({ ok: false, erro: "Escola ausente." }, { status: 400 });
    const tenantId = await tenantIdAtual(supabase);
    const r = await obterOuCriarRascunhoCampus(supabase, { tenantId, supplierId: sessao.supplierId, campusId, createdBy: sessao.email });
    return r.ok ? NextResponse.json({ ok: true, detalhe: r.detalhe }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }

  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "Rascunho ausente." }, { status: 400 });

  if (acao === "salvar") {
    const r = await salvarRascunhoCampus(supabase, sessao.supplierId, id, body?.payload);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro, falhas: r.falhas ?? [] }, { status: 400 });
  }
  if (acao === "aprovar") {
    const r = await enviarConteudoCampusParaAdmin(supabase, sessao.supplierId, id, sessao.email);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }
  return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
}
