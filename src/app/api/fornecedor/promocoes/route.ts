import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarPropostasPromocao, criarPropostaFornecedor } from "@/lib/promocao-proposta-service";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const MAX_ESCRITA = Number(process.env.RATE_LIMIT_FORNECEDOR_PROMOCAO || "30");

// Propostas de promoção DO FORNECEDOR (criação manual, sem material/IA): a
// escola monta a proposta direto no portal e ela entra na MESMA fila de
// revisão do admin (promotion_submission) — só aprovarPropostaPromocao
// publica. Posse sempre pelo supplier_id da sessão (nunca aceito do corpo).
export async function GET() {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });

  const supabase = getServiceClient();
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const propostas = await listarPropostasPromocao(supabase, tenantId, { supplierId: sessao.supplierId });
  return NextResponse.json({ ok: true, propostas });
}

export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });

  const supabase = getServiceClient();
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  if (!(await checarELimitar(supabase, `fornecedor-promocao:${sessao.supplierUserId}`, MAX_ESCRITA, JANELA_SEG))) {
    return NextResponse.json({ ok: false, erro: "Muitas operações em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const entrada = (body?.entrada && typeof body.entrada === "object" ? body.entrada : {}) as Record<string, unknown>;

  const r = await criarPropostaFornecedor(supabase, { tenantId, supplierId: sessao.supplierId, entrada, actor: sessao.email });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro, falhas: r.falhas ?? [] }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}
