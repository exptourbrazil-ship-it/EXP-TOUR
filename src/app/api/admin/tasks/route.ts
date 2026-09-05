import { NextResponse } from "next/server";
import { checarAdminCookie, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { acaoTarefa, type AcaoTarefa } from "@/lib/admin-fila";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACOES = new Set<AcaoTarefa>(["assumir", "concluir", "devolver"]);
// Chave de dedupe: prefixo curto + id (limitada em tamanho/charset). Defense-in
// depth — evita string arbitrária/longa chegar ao filtro e à trilha de auditoria.
const CHAVE_RE = /^[a-z_]{2,30}:[A-Za-z0-9-]{1,64}$/;

// POST /api/admin/tasks — o admin ASSUME, CONCLUI ou DEVOLVE uma tarefa da Fila
// do Dia. Body: { acao, chaveDedupe }. Qualquer admin autenticado pode operar a
// fila (ela já é filtrada por papel na exibição). A ação é auditada; o conteúdo
// da task, quando materializada on-demand, vem da FONTE (nunca do corpo).
export async function POST(request: Request) {
  if (!(await checarAdminCookie())) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const acao = (body as { acao?: string } | null)?.acao;
  const chaveDedupe = (body as { chaveDedupe?: string } | null)?.chaveDedupe;
  if (!acao || !ACOES.has(acao as AcaoTarefa) || typeof chaveDedupe !== "string" || !CHAVE_RE.test(chaveDedupe)) {
    return NextResponse.json({ ok: false, erro: "Ação ou chave inválida." }, { status: 400 });
  }

  const actor = (await usuarioAdminAtual()) ?? "admin";
  try {
    const r = await acaoTarefa(acao as AcaoTarefa, chaveDedupe, actor, obterIp(request));
    if (!r.ok) {
      return NextResponse.json({ ok: false, erro: "Tarefa não encontrada ou já resolvida." }, { status: 409 });
    }
    return NextResponse.json(r);
  } catch (err) {
    console.error("[admin/tasks] erro:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro ao processar a tarefa." }, { status: 500 });
  }
}
