import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { proporAcerto, AcertoBloqueado } from "@/lib/acerto-service";

export const runtime = "nodejs";

// Propoe ao cliente um acerto em rascunho (rascunho -> proposto): renderiza o
// Termo de Acerto (texto + hash) e o expoe na Area do Cliente para aceite
// eletronico. NAO move dinheiro. Autorizacao por financeiro.gerir; posse pelo
// id do path.
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

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const acerto = await proporAcerto({ acertoId, titularIdEsperado: titularId, autor, ip: obterIp(request) });
    return NextResponse.json({ ok: true, acerto });
  } catch (err) {
    if (err instanceof AcertoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[acerto-propor] falha ao propor o acerto");
    return NextResponse.json({ ok: false, error: "Falha ao propor o acerto" }, { status: 500 });
  }
}
