import { NextResponse } from "next/server";
import { materializarTasksDaFila } from "@/lib/admin-fila";

export const runtime = "nodejs";
export const maxDuration = 60;

// Materializa a Fila do Dia na tabela `tasks` (doc 07, 3.1). Persiste as fontes
// automaticas (documentos a analisar, parcelas em D+10) como tarefas — para
// ganharem estado (aberto/em_andamento/concluido), dono e historico — e conclui
// as que ja resolveram. Idempotente por `chave_dedupe`: rodar de novo nao
// duplica. A tela da fila tambem compoe ao vivo, entao o cron nao e pre-requisito
// para ver a fila; ele existe para a camada de trabalho (atribuir/concluir).
//
// Falha fechada: recusa sem CRON_SECRET, como os demais crons.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  try {
    const resultado = await materializarTasksDaFila();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    console.error("[materializar-tasks] falha:", err);
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
