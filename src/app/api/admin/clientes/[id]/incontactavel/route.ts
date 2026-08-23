import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { abrirIncontactavelContrato, IncontactavelBloqueado } from "@/lib/e11-service";

export const runtime = "nodejs";

// Marca um cliente como INCONTACTAVEL (E11, doc 01 §4) num contrato do titular
// [id] — pendencia parada, cliente nao responde. Abre o E11 (escalada a humano;
// nao suspende nada, nao notifica). Autorizacao por capacidade casos.gerir
// (Operacao conduz excecoes; Gestor tudo). Limpar = resolver o E11 no Caso 360.
// O cron escalar-incontactavel abre o mesmo E11 automaticamente (documento
// rejeitado nao reenviado ha >=30 dias).
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
    const abriu = await abrirIncontactavelContrato({
      contratoId,
      titularIdEsperado: titularId,
      motivo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, excecaoAberta: abriu });
  } catch (err) {
    if (err instanceof IncontactavelBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[incontactavel] falha ao abrir o processo E11");
    return NextResponse.json({ ok: false, error: "Falha ao marcar incontactavel" }, { status: 500 });
  }
}
