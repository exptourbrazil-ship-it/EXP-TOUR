import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";
import { obterIp } from "@/lib/rate-limit";
import { abrirHoldFraude, HoldBloqueado } from "@/lib/hold-service";

export const runtime = "nodejs";

// Marca um HOLD DE VERIFICACAO (suspeita de fraude, E10 — doc 01 §4) num contrato
// do titular [id]. Abre o E10, que TRAVA o avanco para estados onerosos (envio de
// contrato para assinatura, remessa a escola, passagem) ate a verificacao humana.
// NAO notifica o cliente (hold interno). Autorizacao por capacidade casos.gerir
// (Operacao conduz excecoes; Gestor tudo). Limpar o hold = resolver o E10 no
// Caso 360 (Acoes -> Processos de excecao). Quando a conferencia automatica de
// uploads existir, ela sera outro gatilho para o mesmo servico.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron. O caminho Bearer nao tem e-mail de
// sessao, entao a trilha atribui tudo a "bearer-secret" e o escopoTenantAdmin
// o promove a super-admin GLOBAL, atravessando as duas marcas. So as telas do
// admin chamam esta rota, por cookie.
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
    const abriu = await abrirHoldFraude({
      contratoId,
      titularIdEsperado: titularId,
      motivo,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, excecaoAberta: abriu });
  } catch (err) {
    if (err instanceof HoldBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[hold-fraude] falha ao abrir o processo E10");
    return NextResponse.json({ ok: false, error: "Falha ao marcar o hold de verificacao" }, { status: 500 });
  }
}
