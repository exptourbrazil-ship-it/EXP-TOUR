import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { proporAditivo, AlteracaoBloqueada } from "@/lib/alteracao-service";

export const runtime = "nodejs";

// Propoe ao cliente o ADITIVO DE COMPRA de um E3 (delta>0) do titular [id]:
// renderiza o Termo de Aditivo e o expoe na Area do Cliente para aceite
// eletronico. NAO cobra (o delta e cobrado pela cascata). Autorizacao por
// financeiro.gerir; posse pelo id do path.
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
    await proporAditivo({ alteracaoId, titularIdEsperado: titularId, autor, ip: obterIp(request) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AlteracaoBloqueada) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[aditivo-propor] falha ao propor o aditivo");
    return NextResponse.json({ ok: false, error: "Falha ao propor o aditivo" }, { status: 500 });
  }
}
