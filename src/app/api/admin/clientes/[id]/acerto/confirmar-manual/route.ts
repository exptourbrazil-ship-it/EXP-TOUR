import { NextResponse } from "next/server";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { confirmarDevolucaoManual, AcertoBloqueado } from "@/lib/acerto-service";

export const runtime = "nodejs";

// Confirma a DEVOLUCAO MANUAL de um acerto (o Financeiro devolveu por fora e
// anexa o comprovante): marca o estorno manual confirmado e finaliza o acerto.
// Autorizacao por SESSAO com financeiro.gerir (sem Bearer).
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
  const comprovanteUrl =
    typeof body?.comprovanteUrl === "string" && body.comprovanteUrl.trim() ? body.comprovanteUrl.trim() : null;
  if (!acertoId) {
    return NextResponse.json({ ok: false, error: "Informe acertoId" }, { status: 400 });
  }

  try {
    const r = await confirmarDevolucaoManual({
      acertoId,
      titularIdEsperado: titularId,
      comprovanteUrl,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto-confirmar-manual] falha ao confirmar a devolucao");
    return NextResponse.json({ ok: false, error: "Falha ao confirmar a devolucao" }, { status: 500 });
  }
}
