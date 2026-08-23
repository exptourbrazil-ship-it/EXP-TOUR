import { NextResponse } from "next/server";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { aplicarAlteracao, AlteracaoBloqueada } from "@/lib/alteracao-service";

export const runtime = "nodejs";

// Executa em CASCATA um rascunho de alteracao (E2/E3) do titular [id]: reescreve
// as parcelas em aberto conforme o plano revisado, atualiza o contrato (nova
// data de inicio no E2; novo valor_total no E3) e marca o rascunho como
// aplicado — tudo atomico (funcao SQL). NAO cobra e NAO devolve: so cria
// cobrancas a vencer (pagas via webhook). Autorizacao por SESSAO com
// financeiro.gerir (checarCapacidadeAdmin, SEM fallback Bearer): esta e a
// mutacao mais sensivel a dinheiro; exige um admin identificado (atribuicao no
// audit) e nao pode ser disparada por segredo estatico de câmbio/cron.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const alteracaoId = String(body?.alteracaoId || "");
  if (!alteracaoId) {
    return NextResponse.json({ ok: false, error: "Informe alteracaoId" }, { status: 400 });
  }

  const autor = await usuarioAdminAtual();
  if (!autor) {
    return NextResponse.json({ ok: false, error: "Sessao admin nao identificada" }, { status: 401 });
  }
  try {
    const resultado = await aplicarAlteracao({
      alteracaoId,
      titularIdEsperado: titularId,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    if (err instanceof AlteracaoBloqueada) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[alteracao-aplicar] falha ao aplicar a cascata");
    return NextResponse.json({ ok: false, error: "Falha ao aplicar a alteracao" }, { status: 500 });
  }
}
