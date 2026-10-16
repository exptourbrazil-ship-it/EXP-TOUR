import { NextResponse } from "next/server";
import { contextoAdminFatura, ehUuid } from "@/lib/admin-contas-a-receber-api";
import { cancelarFatura } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cancela a fatura (sem recebimentos), com motivo obrigatorio e trilha.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoAdminFatura(request, "financeiro.gerir");
  if (!c.ok) return c.res;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Fatura inválida." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { motivo?: unknown };
  const r = await cancelarFatura(c.ctx.supabase, { tenantId: c.ctx.tenantId, adminUser: c.ctx.adminUser, ip: c.ctx.ip, id, motivo: body.motivo });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
