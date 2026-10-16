import { NextResponse } from "next/server";
import { contextoAdminFatura, ehUuid } from "@/lib/admin-contas-a-receber-api";
import { gerarPdfDaFatura } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PDF da fatura de comissao (financeiro.ver).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoAdminFatura(request, "financeiro.ver");
  if (!c.ok) return c.res;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Fatura inválida." }, { status: 400 });
  const r = await gerarPdfDaFatura(c.ctx.supabase, c.ctx.tenantId, id);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return new NextResponse(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="commission-invoice-${r.numero}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
