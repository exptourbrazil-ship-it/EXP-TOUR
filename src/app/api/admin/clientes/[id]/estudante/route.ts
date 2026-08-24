import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { atualizarEstudanteContrato, CadastroInvalido } from "@/lib/cadastro-service";

export const runtime = "nodejs";

// Edita os dados do estudante de UM contrato do titular [id] (Caso 360). Os
// dados do estudante sao POR CONTRATO; a mutacao valida a posse (o contrato
// tem que ser deste titular). Capacidade casos.gerir. A mutacao
// (validacao/transacao/auditoria) vive em src/lib/cadastro-service.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe o contrato" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";

  try {
    await atualizarEstudanteContrato({
      titularId,
      contratoId,
      estudante_nome: body?.estudante_nome,
      estudante_sexo: body?.estudante_sexo,
      estudante_data_nascimento: body?.estudante_data_nascimento,
      estudante_email: body?.estudante_email,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CadastroInvalido) {
      const status = err.codigo === "duplicado" ? 409 : 400;
      return NextResponse.json({ ok: false, error: err.message }, { status });
    }
    console.error("[estudante] falha ao atualizar dados do estudante");
    return NextResponse.json(
      { ok: false, error: "Falha ao atualizar os dados do estudante" },
      { status: 500 }
    );
  }
}
