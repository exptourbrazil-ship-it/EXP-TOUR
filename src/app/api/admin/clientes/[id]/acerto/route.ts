import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { calcularERegistrarAcerto, AcertoBloqueado } from "@/lib/acerto-service";

export const runtime = "nodejs";

// Calcula e grava (rascunho) o acerto de cancelamento de um contrato do titular
// [id] — retencao/multa, saldo a devolver e memoria de calculo, para o Financeiro
// revisar. NAO propoe ao cliente, NAO coleta aceite, NAO executa refund (marcos
// proprios). Autorizacao por capacidade financeiro.gerir (o acerto e do
// Financeiro). Requer uma excecao de cancelamento ATIVA no contrato.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "financeiro.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const refundEscolaEsperado =
    body?.refundEscolaEsperado != null && Number.isFinite(Number(body.refundEscolaEsperado))
      ? Number(body.refundEscolaEsperado)
      : null;

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe contratoId" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const acerto = await calcularERegistrarAcerto({
      contratoId,
      titularIdEsperado: titularId,
      refundEscolaEsperado,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, acerto });
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto] falha ao calcular o acerto");
    return NextResponse.json({ ok: false, error: "Falha ao calcular o acerto" }, { status: 500 });
  }
}
