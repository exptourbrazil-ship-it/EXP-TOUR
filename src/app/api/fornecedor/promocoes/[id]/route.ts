import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { obterPropostaPromocao, atualizarPropostaFornecedor } from "@/lib/promocao-proposta-service";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const MAX_ESCRITA = Number(process.env.RATE_LIMIT_FORNECEDOR_PROMOCAO || "30");

// Uma proposta de promoção do fornecedor. Posse reconferida aqui (a proposta
// tem que ser deste supplier_id) mesmo obterPropostaPromocao não filtrando por
// fornecedor — a rota nunca devolve proposta de outra escola.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const supabase = getServiceClient();
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const proposta = await obterPropostaPromocao(supabase, tenantId, id);
  if (!proposta || proposta.supplierId !== sessao.supplierId) {
    return NextResponse.json({ ok: false, erro: "Proposta não encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, proposta });
}

// Edita a proposta ENQUANTO pending_admin (o serviço recusa fora desse
// status). supplier_id sempre o da sessão.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  const { id } = await params;

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

  const r = await atualizarPropostaFornecedor(supabase, { tenantId, supplierId: sessao.supplierId, id, entrada });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro, falhas: r.falhas ?? [] }, { status: 400 });
  return NextResponse.json({ ok: true });
}
