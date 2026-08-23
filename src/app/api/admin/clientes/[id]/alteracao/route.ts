import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { calcularERegistrarAlteracao, AlteracaoBloqueada } from "@/lib/alteracao-service";

export const runtime = "nodejs";

// Calcula e grava (rascunho) a PREVIA do plano recalculado no adiamento (E2) de
// um contrato do titular [id] — nova data-limite de quitacao + reagendamento do
// saldo em aberto, para o Financeiro/Operacao revisar. NAO reescreve parcelas,
// NAO gera aditivo, NAO toca dinheiro (aplicacao = marco proprio). Autorizacao
// por capacidade casos.gerir (E2 e do dono do caso). Requer um E2 ATIVO.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const novaDataInicio = String(body?.novaDataInicio || "");

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe contratoId" }, { status: 400 });
  }
  if (!novaDataInicio) {
    return NextResponse.json({ ok: false, error: "Informe a nova data de inicio" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const alteracao = await calcularERegistrarAlteracao({
      contratoId,
      titularIdEsperado: titularId,
      novaDataInicio,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, alteracao });
  } catch (err) {
    if (err instanceof AlteracaoBloqueada) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[alteracao] falha ao calcular o plano");
    return NextResponse.json({ ok: false, error: "Falha ao calcular o plano" }, { status: 500 });
  }
}
