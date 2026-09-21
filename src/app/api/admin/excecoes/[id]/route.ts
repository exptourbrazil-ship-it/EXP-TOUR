import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { barrarExcecaoForaDoEscopo } from "@/lib/admin-tenant";
import { mudarStatusExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { STATUS_EXCECAO, type StatusExcecao } from "@/lib/excecao";

export const runtime = "nodejs";

// Avanca a maquina de estados de uma excecao (assumir, resolver, cancelar,
// reabrir). Autorizacao por capacidade (casos.gerir). A validacao da transicao,
// do desfecho e da resolucao e feita no servico (src/lib/excecao-service.ts).
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron e daria a qualquer portador o poder de
// mexer em acerto, cancelamento e aditivo de contrato — dinheiro de cliente —
// com a trilha atribuindo tudo a "bearer-secret". O caminho Bearer tambem nao
// tem e-mail de sessao e por isso vira super-admin GLOBAL (admin-tenant.ts),
// atravessando as duas marcas. So as telas do admin chamam estas rotas.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

  const { id } = await params;

  // Isolamento por tenant: excecao de contrato/titular de outro tenant -> 404.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const barrado = await barrarExcecaoForaDoEscopo(supabase, id);
  if (barrado) return barrado;

  const body = await request.json().catch(() => null);
  const para = String(body?.para || "");
  if (!(STATUS_EXCECAO as readonly string[]).includes(para)) {
    return NextResponse.json({ ok: false, error: "Status alvo invalido" }, { status: 400 });
  }

  const autor = (await usuarioAdminAtual()) ?? "sessao-expirada";
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
