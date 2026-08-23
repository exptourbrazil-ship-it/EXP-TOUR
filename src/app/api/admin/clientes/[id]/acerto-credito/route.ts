import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { gerarAcertoCreditoEscopo, AcertoBloqueado } from "@/lib/acerto-service";

export const runtime = "nodejs";

// Gera (rascunho) o acerto de CREDITO de uma alteracao de escopo (E3 downgrade)
// do titular [id]: o excedente pago (ja pago - novo valor) vira um refund a
// apurar, na mesma superficie de acerto dos cancelamentos. NAO executa refund
// (dinheiro so muda por webhook). Autorizacao por financeiro.gerir (apura
// devolucao em dinheiro). Requer um E3 ativo e o rascunho de escopo.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "financeiro.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const alteracaoId = String(body?.alteracaoId || "");
  if (!alteracaoId) {
    return NextResponse.json({ ok: false, error: "Informe alteracaoId" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const acerto = await gerarAcertoCreditoEscopo({
      alteracaoId,
      titularIdEsperado: titularId,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, acerto });
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto-credito] falha ao gerar o acerto de credito");
    return NextResponse.json({ ok: false, error: "Falha ao gerar o acerto de credito" }, { status: 500 });
  }
}
