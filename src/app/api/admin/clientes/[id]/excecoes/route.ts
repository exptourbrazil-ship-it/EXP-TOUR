import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";

export const runtime = "nodejs";

// Abre um processo de excecao (doc 01, Secao 4) num contrato do titular [id].
// Autorizacao por capacidade (casos.gerir — Operacao conduz excecoes; Gestor
// tudo). A posse (contrato pertence ao titular da URL) e validada dentro de
// abrirExcecao (padrao de mutacao, doc 07 §4).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const tipo = String(body?.tipo || "");
  const motivo = typeof body?.motivo === "string" ? body.motivo : null;
  const suspende = body?.suspende; // opcional; o servico sanitiza / usa o padrao

  if (!contratoId || !tipo) {
    return NextResponse.json({ ok: false, error: "Informe contratoId e tipo" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const excecao = await abrirExcecao({
      contratoId,
      tipo,
      motivo,
      suspende,
      titularIdEsperado: titularId,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, excecao });
  } catch (err) {
    if (err instanceof ExcecaoBloqueada) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[excecoes] falha ao abrir excecao");
    return NextResponse.json({ ok: false, error: "Falha ao abrir a excecao" }, { status: 500 });
  }
}
