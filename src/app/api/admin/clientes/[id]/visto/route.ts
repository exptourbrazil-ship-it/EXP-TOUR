import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { registrarStatusVisto, VistoBloqueado } from "@/lib/visto-service";

export const runtime = "nodejs";

// Registra o resultado do visto de um contrato do titular [id] (doc 07: Operacao
// "atualiza visto"). Na transicao para "negado", dispara a automacao E1 (abre
// excecao -> pausa regua, cria tarefa ao consultor, avisa o cliente). Ver
// src/lib/visto-service.ts. Autorizacao por capacidade (casos.gerir).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const status = String(body?.status || "");

  if (!contratoId || !status) {
    return NextResponse.json({ ok: false, error: "Informe contratoId e status" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const resultado = await registrarStatusVisto({
      contratoId,
      titularIdEsperado: titularId,
      status,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    if (err instanceof VistoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[visto] falha ao registrar status do visto");
    return NextResponse.json({ ok: false, error: "Falha ao registrar o status do visto" }, { status: 500 });
  }
}
