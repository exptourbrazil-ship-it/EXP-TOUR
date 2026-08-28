import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { validarResposta } from "@/lib/confirmacao-disponibilidade";
import { responderSolicitacao } from "@/lib/confirmacao-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A escola responde a um pedido de confirmacao de disponibilidade (alerta 5):
// aceitar/recusar (+ nota). Posse pelo supplier_id da sessao (o servico reconfere
// que o pedido e desta escola e que ainda esta pendente).
export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Nao autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "Pedido ausente." }, { status: 400 });

  const v = validarResposta(body);
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });

  const supabase = getServiceClient();
  const r = await responderSolicitacao(supabase, sessao.supplierId, id, v.dados, sessao.email);
  return r.ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
}
