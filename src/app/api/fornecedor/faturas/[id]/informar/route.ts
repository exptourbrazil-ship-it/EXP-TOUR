import { NextResponse } from "next/server";
import { contextoFornecedorFatura } from "@/lib/fornecedor-faturas-api";
import { informarPagamentoDaEscola } from "@/lib/comissao-fatura-service";
import { ehUuid } from "@/lib/admin-contas-a-receber-api";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const MAX = Number(process.env.RATE_LIMIT_FORNECEDOR_FATURA_INFORMAR || "20");

// A escola informa a data prevista de pagamento e/ou uma observacao. NAO marca a
// fatura como paga: o dinheiro so muda por registro do financeiro da EXP Tour.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoFornecedorFatura();
  if (!c.ok) return c.res;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Fatura não encontrada." }, { status: 404 });
  if (!(await checarELimitar(c.supabase, `fornecedor-fatura-informar:${c.sessao.supplierUserId}`, MAX, JANELA_SEG, Date.now(), true))) {
    return NextResponse.json({ ok: false, erro: "Muitas operações em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }
  const body = (await request.json().catch(() => ({}))) as { expectedAt?: unknown; note?: unknown };
  const r = await informarPagamentoDaEscola(c.supabase, {
    tenantId: c.tenantId,
    supplierId: c.sessao.supplierId,
    supplierUserEmail: c.sessao.email,
    id,
    expectedAt: body.expectedAt,
    note: body.note,
  });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
