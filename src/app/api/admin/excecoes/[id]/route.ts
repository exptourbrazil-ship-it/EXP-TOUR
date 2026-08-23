import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { mudarStatusExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { STATUS_EXCECAO, type StatusExcecao } from "@/lib/excecao";

export const runtime = "nodejs";

// Avanca a maquina de estados de uma excecao (assumir, resolver, cancelar,
// reabrir). Autorizacao por capacidade (casos.gerir). A validacao da transicao,
// do desfecho e da resolucao e feita no servico (src/lib/excecao-service.ts).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const para = String(body?.para || "");
  if (!(STATUS_EXCECAO as readonly string[]).includes(para)) {
    return NextResponse.json({ ok: false, error: "Status alvo invalido" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const excecao = await mudarStatusExcecao({
      id,
      para: para as StatusExcecao,
      etapa: body?.etapa,
      suspende: body?.suspende,
      desfecho: body?.desfecho ?? null,
      resolucao: body?.resolucao ?? null,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, excecao });
  } catch (err) {
    if (err instanceof ExcecaoBloqueada) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[excecoes] falha ao mudar status da excecao");
    return NextResponse.json({ ok: false, error: "Falha ao atualizar a excecao" }, { status: 500 });
  }
}
