import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";
import { obterIp } from "@/lib/rate-limit";
import { registrarCancelamentoEscola, CancelamentoEscolaBloqueado } from "@/lib/e6-service";

export const runtime = "nodejs";

// Registra um cancelamento pela ESCOLA (doc 01 §4, E6) num contrato do titular
// [id] — turma nao abriu / escola fechou. Abre o processo E6 (pausa a regua; cai
// na fila da Operacao) e avisa o cliente de forma proativa. NAO realoca nem
// reembolsa — execucao humana / motor de acerto (marco proprio). Autorizacao por
// capacidade casos.gerir (Operacao conduz excecoes; Gestor tudo). Quando o
// portal do fornecedor existir, ele sera outro gatilho para o mesmo servico.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron e daria a qualquer portador o poder de
// mexer em acerto, cancelamento e aditivo de contrato — dinheiro de cliente —
// com a trilha atribuindo tudo a "bearer-secret". O caminho Bearer tambem nao
// tem e-mail de sessao e por isso vira super-admin GLOBAL (admin-tenant.ts),
// atravessando as duas marcas. So as telas do admin chamam estas rotas.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

  const { id: titularId } = await params;
  const body = await request.json().catch(() => null);
  const contratoId = String(body?.contratoId || "");
  const motivo = typeof body?.motivo === "string" ? body.motivo : null;

  if (!contratoId) {
    return NextResponse.json({ ok: false, error: "Informe contratoId" }, { status: 400 });
  }

  // Isolamento por tenant: barra se o titular da URL nao esta no escopo do admin.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const barrado = await barrarTitularForaDoEscopo(supabase, titularId);
  if (barrado) return barrado;

  const autor = (await usuarioAdminAtual()) ?? "sessao-expirada";
  try {
    const resultado = await registrarCancelamentoEscola({
      contratoId,
      titularIdEsperado: titularId,
      motivo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    if (err instanceof CancelamentoEscolaBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[cancelamento-escola] falha ao abrir o processo E6");
    return NextResponse.json({ ok: false, error: "Falha ao registrar o cancelamento pela escola" }, { status: 500 });
  }
}
