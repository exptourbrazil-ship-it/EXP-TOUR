import { NextResponse } from "next/server";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { executarAcerto, AcertoBloqueado } from "@/lib/acerto-service";

export const runtime = "nodejs";

// Executa o estorno de um acerto ACEITO do titular [id]: dispara o(s) refund(s)
// via Mercado Pago (ou registra a devolucao manual) e marca `executado` quando
// confirmado. Recusa acerto PROVISORIO (retencao nao validada). Autorizacao por
// SESSAO com financeiro.gerir (checarCapacidadeAdmin, SEM Bearer): move dinheiro,
// exige admin identificado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }
  const autor = await usuarioAdminAtual();
  if (!autor) {
    return NextResponse.json({ ok: false, error: "Sessao admin nao identificada" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const acertoId = String(body?.acertoId || "");
  if (!acertoId) {
    return NextResponse.json({ ok: false, error: "Informe acertoId" }, { status: 400 });
  }

  try {
    const r = await executarAcerto({ acertoId, titularIdEsperado: titularId, autor, ip: obterIp(request) });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto-executar] falha ao executar o acerto");
    return NextResponse.json({ ok: false, error: "Falha ao executar o acerto" }, { status: 500 });
  }
}
