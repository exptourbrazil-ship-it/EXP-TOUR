import { NextResponse } from "next/server";
import { contextoAdminFatura } from "@/lib/admin-contas-a-receber-api";
import { obterEmissor, salvarEmissor } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dados do emissor que saem na fatura (razao social, endereco, id fiscal, e-mail,
// instrucoes de pagamento, prazo padrao). GET: financeiro.ver; PUT: financeiro.gerir.
export async function GET(request: Request) {
  const c = await contextoAdminFatura(request, "financeiro.ver");
  if (!c.ok) return c.res;
  const emissor = await obterEmissor(c.ctx.supabase, c.ctx.tenantId);
  return NextResponse.json({ ok: true, emissor });
}

export async function PUT(request: Request) {
  const c = await contextoAdminFatura(request, "financeiro.gerir");
  if (!c.ok) return c.res;
  const body = await request.json().catch(() => null);
  const r = await salvarEmissor(c.ctx.supabase, { tenantId: c.ctx.tenantId, adminUser: c.ctx.adminUser, ip: c.ctx.ip, entrada: body });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
