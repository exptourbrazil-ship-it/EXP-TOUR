import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { listarContasBancariasFornecedor, propostaBancariaFornecedor } from "@/lib/supplier-bank-service";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const MAX_ESCRITA = Number(process.env.RATE_LIMIT_FORNECEDOR_CONTA_BANCARIA || "20");

// Dados bancarios DO FORNECEDOR (destino do repasse). GET -> historico completo
// (o que esta confirmado/pendente/rejeitado/superado); POST -> propoe ou
// atualiza a proposta pendente. NUNCA confirma sozinho: a proposta so vira a
// conta usada no repasse depois que o admin confirmar (ver supplier-bank-service.ts).
// Posse sempre pelo supplier_id da SESSAO (nunca aceito do corpo).
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
  const contas = await listarContasBancariasFornecedor(supabase, tenantId, sessao.supplierId);
  return NextResponse.json({ ok: true, contas });
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
  // Falha fechada: sem contador de rate limit, RECUSA (superficie financeira sensivel).
  if (!(await checarELimitar(supabase, `fornecedor-conta-bancaria:${sessao.supplierUserId}`, MAX_ESCRITA, JANELA_SEG, Date.now(), true))) {
    return NextResponse.json({ ok: false, erro: "Muitas operações em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const entrada = (body?.entrada && typeof body.entrada === "object" ? body.entrada : {}) as Record<string, unknown>;

  const r = await propostaBancariaFornecedor(supabase, { tenantId, supplierId: sessao.supplierId, entrada, actor: sessao.email });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro, falhas: r.falhas ?? [] }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}
