import { NextResponse } from "next/server";
import { contextoFornecedorFatura } from "@/lib/fornecedor-faturas-api";
import { pdfDaFaturaParaEscola } from "@/lib/comissao-fatura-service";
import { ehUuid } from "@/lib/admin-contas-a-receber-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// PDF da fatura da PROPRIA escola (posse pelo supplierId da sessao; 404 generico).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoFornecedorFatura();
  if (!c.ok) return c.res;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Fatura não encontrada." }, { status: 404 });
  const r = await pdfDaFaturaParaEscola(c.supabase, c.tenantId, c.sessao.supplierId, id);
  if (!r.ok) return NextResponse.json({ ok: false, erro: "Fatura não encontrada." }, { status: 404 });
  return new NextResponse(new Uint8Array(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="commission-invoice-${r.numero}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
