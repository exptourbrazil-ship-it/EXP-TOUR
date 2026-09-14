import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";
import { obterIp } from "@/lib/rate-limit";
import { abrirCancelamentoContrato, CancelamentoBloqueado } from "@/lib/e4-service";

export const runtime = "nodejs";

// Registra um PEDIDO de cancelamento do cliente (doc 01 §4, E4) num contrato do
// titular [id] — para quando o cliente pede por WhatsApp/telefone (inclusive
// apos os 7 dias). Abre o processo E4 (pausa a regua; cai na fila do Consultor
// para a retencao). NAO cancela nem reembolsa — isso e execucao humana / motor
// de acerto (marco proprio). Autorizacao por capacidade cancelamento.gerir
// (Consultor faz retencao; Financeiro faz o acerto; Gestor tudo).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "cancelamento.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
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

  const autor = (await usuarioAdminAtual()) ?? "bearer-secret";
  try {
    const abriu = await abrirCancelamentoContrato({
      contratoId,
      titularIdEsperado: titularId,
      origem: "admin",
      motivo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, excecaoAberta: abriu });
  } catch (err) {
    if (err instanceof CancelamentoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[cancelamento] falha ao abrir o processo E4");
    return NextResponse.json({ ok: false, error: "Falha ao registrar o pedido de cancelamento" }, { status: 500 });
  }
}
