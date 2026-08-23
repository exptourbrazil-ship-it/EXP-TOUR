import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { abrirHoldFraude, HoldBloqueado } from "@/lib/hold-service";

export const runtime = "nodejs";

// Marca um HOLD DE VERIFICACAO (suspeita de fraude, E10 — doc 01 §4) num contrato
// do titular [id]. Abre o E10, que TRAVA o avanco para estados onerosos (envio de
// contrato para assinatura, remessa a escola, passagem) ate a verificacao humana.
// NAO notifica o cliente (hold interno). Autorizacao por capacidade casos.gerir
// (Operacao conduz excecoes; Gestor tudo). Limpar o hold = resolver o E10 no
// Caso 360 (Acoes -> Processos de excecao). Quando a conferencia automatica de
// uploads existir, ela sera outro gatilho para o mesmo servico.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const motivo = typeof body?.motivo === "string" ? body.motivo : null;

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe contratoId" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const abriu = await abrirHoldFraude({
      contratoId,
      titularIdEsperado: titularId,
      motivo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, excecaoAberta: abriu });
  } catch (err) {
    if (err instanceof HoldBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[hold-fraude] falha ao abrir o processo E10");
    return NextResponse.json({ ok: false, error: "Falha ao marcar o hold de verificacao" }, { status: 500 });
  }
}
