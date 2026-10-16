import { NextResponse } from "next/server";
import { contextoAdminFatura, ehUuid } from "@/lib/admin-contas-a-receber-api";
import { emitirFatura } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Emite a fatura (rascunho -> emitida) e, com { enviar: true }, envia por e-mail
// aos contatos financeiros da escola (+ e-mails extras opcionais). Reenvio: chamar
// de novo com { enviar: true } numa fatura ja emitida/enviada.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoAdminFatura(request, "financeiro.gerir");
  if (!c.ok) return c.res;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Fatura inválida." }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { enviar?: unknown; destinatarios?: unknown };
  const extras = Array.isArray(body.destinatarios) ? body.destinatarios.filter((e): e is string => typeof e === "string").slice(0, 5) : [];
  const r = await emitirFatura(c.ctx.supabase, {
    tenantId: c.ctx.tenantId,
    adminUser: c.ctx.adminUser,
    ip: c.ctx.ip,
    id,
    enviar: body.enviar === true,
    destinatariosExtras: extras,
  });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, status: r.status, enviados: r.enviados, falhas: r.falhas, semDestinatario: r.semDestinatario });
}
