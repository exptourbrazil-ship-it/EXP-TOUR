import { NextResponse } from "next/server";
import { contextoAdminFatura, ehUuid } from "@/lib/admin-contas-a-receber-api";
import { barrarSupplierForaDoEscopo } from "@/lib/admin-tenant";
import { arquivarRegra, carregarRegrasDaEscola, listarProdutosDaEscola, salvarAcordoPadrao, salvarRegra } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Comissao da escola: acordo padrao + regras por tipo de item e por produto/programa/
// servico (a mais especifica vale). GET: financeiro.ver; POST/DELETE: financeiro.gerir.
// Sessao admin (sem bearer) + escopo de tenant da escola.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoAdminFatura(request, "financeiro.ver");
  if (!c.ok) return c.res;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Escola inválida." }, { status: 400 });
  const barrado = await barrarSupplierForaDoEscopo(c.ctx.supabase, id);
  if (barrado) return barrado;
  const [r, produtos] = await Promise.all([
    carregarRegrasDaEscola(c.ctx.supabase, c.ctx.tenantId, id),
    listarProdutosDaEscola(c.ctx.supabase, c.ctx.tenantId, id),
  ]);
  return NextResponse.json({ ok: true, padrao: r.padrao, regras: r.regras, produtos });
}

// Corpo: { acao: "padrao" | "regra", ...campos } — "padrao" define o acordo padrao da
// escola; "regra" define a regra de um tipo de item (scope=kind) ou produto (scope=product).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoAdminFatura(request, "financeiro.gerir");
  if (!c.ok) return c.res;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Escola inválida." }, { status: 400 });
  const barrado = await barrarSupplierForaDoEscopo(c.ctx.supabase, id);
  if (barrado) return barrado;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  const base = { tenantId: c.ctx.tenantId, adminUser: c.ctx.adminUser, ip: c.ctx.ip, supplierId: id };
  const r = body.acao === "padrao" ? await salvarAcordoPadrao(c.ctx.supabase, { ...base, entrada: body }) : await salvarRegra(c.ctx.supabase, { ...base, entrada: body });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoAdminFatura(request, "financeiro.gerir");
  if (!c.ok) return c.res;
  const { id } = await params;
  const regraId = new URL(request.url).searchParams.get("regraId");
  if (!ehUuid(id) || !ehUuid(regraId)) return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  const barrado = await barrarSupplierForaDoEscopo(c.ctx.supabase, id);
  if (barrado) return barrado;
  const r = await arquivarRegra(c.ctx.supabase, { tenantId: c.ctx.tenantId, adminUser: c.ctx.adminUser, ip: c.ctx.ip, supplierId: id, regraId });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
