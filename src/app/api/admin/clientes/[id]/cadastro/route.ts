import { NextResponse } from "next/server";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import {
  atualizarContatoTitular,
  atualizarCpfTitular,
  CadastroInvalido,
} from "@/lib/cadastro-service";

export const runtime = "nodejs";

// Edita os dados cadastrais do titular [id] (Caso 360). Duas secoes:
//  - "contato" (nome/telefone/email): capacidade casos.gerir.
//  - "cpf" (muda a identidade de login): capacidade override + justificativa.
// A mutacao (validacao/transacao/auditoria) vive em src/lib/cadastro-service.ts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const secao = String(body?.secao || "");

  // A capacidade exigida depende da secao — o CPF e sensivel (so Gestor).
  const capacidade = secao === "cpf" ? "override" : "casos.gerir";
  if (!(await checarCapacidadeRequest(request, capacidade))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  const ip = obterIp(request);

  try {
    if (secao === "contato") {
      await atualizarContatoTitular({
        titularId,
        nome_completo: String(body?.nome_completo ?? ""),
        telefone: body?.telefone,
        email: body?.email,
        autor,
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    if (secao === "cpf") {
      await atualizarCpfTitular({
        titularId,
        cpf: String(body?.cpf ?? ""),
        justificativa: String(body?.justificativa ?? ""),
        autor,
        ip,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Secao invalida" }, { status: 400 });
  } catch (err) {
    if (err instanceof CadastroInvalido) {
      const status = err.codigo === "duplicado" ? 409 : 400;
      return NextResponse.json({ ok: false, error: err.message }, { status });
    }
    console.error("[cadastro] falha ao atualizar dados cadastrais do titular");
    return NextResponse.json(
      { ok: false, error: "Falha ao atualizar os dados cadastrais" },
      { status: 500 }
    );
  }
}
