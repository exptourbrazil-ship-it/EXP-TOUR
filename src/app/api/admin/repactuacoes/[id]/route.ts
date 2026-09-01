import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { aprovarRepactuacao, recusarRepactuacao, RepactuacaoBloqueada } from "@/lib/repactuacao-service";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Aprovacao/recusa (admin) de uma repactuacao 'aguardando_aprovacao' (Clausula
// 7.11, a 3a+ do trimestre). A aprovacao REESCREVE as parcelas (move dinheiro):
// autorizacao por SESSAO com financeiro.gerir (checarCapacidadeAdmin, SEM Bearer)
// e admin IDENTIFICADO — mesma regra de acerto/executar e alteracao/aplicar, para
// a atribuicao no audit_log ser sempre um admin real, nunca "bearer-secret".
// Body: { acao: "aprovar" | "recusar", motivo?: string }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const autor = await usuarioAdminAtual();
  if (!autor) {
    return NextResponse.json({ ok: false, erro: "Sessão admin não identificada" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) ?? {};
  const acao = body?.acao;
  if (acao !== "aprovar" && acao !== "recusar") {
    return NextResponse.json({ ok: false, erro: "Informe acao 'aprovar' ou 'recusar'." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const ip = obterIp(request);

  try {
    if (acao === "aprovar") {
      const r = await aprovarRepactuacao({ supabase, repactuacaoId: id, autor, ip });
      return NextResponse.json({ ok: true, status: r.status });
    }
    await recusarRepactuacao({ supabase, repactuacaoId: id, autor, motivo: body?.motivo ?? null, ip });
    return NextResponse.json({ ok: true, status: "recusada" });
  } catch (err) {
    if (err instanceof RepactuacaoBloqueada) {
      // status_invalido / repactuacao_nao_encontrada -> 404/409; guarda-corpos HARD
      // que falharam na re-validacao -> 400 (o estado mudou desde a solicitacao).
      const naoEncontrada = err.codigo === "repactuacao_nao_encontrada";
      const status = naoEncontrada ? 404 : err.codigo === "status_invalido" ? 409 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: mensagem(err.codigo) }, { status });
    }
    return NextResponse.json({ ok: false, erro: "Falha ao processar a repactuação." }, { status: 500 });
  }
}

function mensagem(codigo: string): string {
  switch (codigo) {
    case "repactuacao_nao_encontrada":
      return "Repactuação não encontrada.";
    case "status_invalido":
      return "Esta repactuação não está mais aguardando aprovação.";
    case "parcela_em_atraso":
      return "Há uma parcela em atraso — o plano não pode ser aplicado. Regularize antes.";
    case "parcela_bloqueada_alterada":
    case "parcela_bloqueada_removida":
      return "Uma parcela foi paga desde a solicitação; o plano proposto não é mais aplicável.";
    case "soma_diverge":
    case "total_indisponivel":
      return "A soma do plano proposto não bate mais com a dívida atual.";
    default:
      return "Não foi possível aplicar a repactuação (o estado do contrato mudou).";
  }
}
