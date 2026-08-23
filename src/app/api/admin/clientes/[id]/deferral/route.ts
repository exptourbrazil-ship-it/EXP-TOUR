import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { abrirDeferralContrato, DeferralBloqueado } from "@/lib/e2-service";

export const runtime = "nodejs";

// Registra um pedido de ADIAMENTO DE INICIO (E2, doc 01 §4) num contrato do
// titular [id]. Abre o E2 (suspende o avanco; cai na fila da Operacao para
// consultar a escola) com a nova data solicitada. NAO recalcula marcos/parcelas
// nem gera aditivo — motor de alteracao e marco proprio. Autorizacao por
// capacidade casos.gerir (Operacao conduz excecoes; Gestor tudo).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const novaDataInicio =
    typeof body?.novaDataInicio === "string" && body.novaDataInicio ? body.novaDataInicio : null;
  const motivo = typeof body?.motivo === "string" ? body.motivo : null;

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe contratoId" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const abriu = await abrirDeferralContrato({
      contratoId,
      titularIdEsperado: titularId,
      novaDataInicio,
      motivo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, excecaoAberta: abriu });
  } catch (err) {
    if (err instanceof DeferralBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[deferral] falha ao abrir o processo E2");
    return NextResponse.json({ ok: false, error: "Falha ao registrar o pedido de adiamento" }, { status: 500 });
  }
}
