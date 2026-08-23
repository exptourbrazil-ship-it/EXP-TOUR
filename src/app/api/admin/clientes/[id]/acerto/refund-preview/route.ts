import { NextResponse } from "next/server";
import { checarCapacidadeRequest } from "@/lib/admin-guard";
import { planejarRefundAcerto, AcertoBloqueado } from "@/lib/acerto-service";

export const runtime = "nodejs";

// Previa (READ-ONLY) do plano de estorno de um acerto ACEITO do titular [id]:
// meio (mp/manual + motivo), valor em BRL e particionamento entre os pagamentos
// originais. NAO dispara refund nem grava estorno (isso e a Fatia D). Autorizacao
// por financeiro.gerir; posse pelo id do path.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "financeiro.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const acertoId = String(body?.acertoId || "");
  if (!acertoId) {
    return NextResponse.json({ ok: false, error: "Informe acertoId" }, { status: 400 });
  }

  try {
    const plano = await planejarRefundAcerto({ acertoId, titularIdEsperado: titularId });
    return NextResponse.json({ ok: true, plano });
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto-refund-preview] falha ao planejar o estorno");
    return NextResponse.json({ ok: false, error: "Falha ao planejar o estorno" }, { status: 500 });
  }
}
