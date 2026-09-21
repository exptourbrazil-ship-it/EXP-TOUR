import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";
import { obterIp } from "@/lib/rate-limit";
import { registrarStatusVisto, VistoBloqueado } from "@/lib/visto-service";

export const runtime = "nodejs";

// Registra o resultado do visto de um contrato do titular [id] (doc 07: Operacao
// "atualiza visto"). Na transicao para "negado", dispara a automacao E1 (abre
// excecao -> pausa regua, cria tarefa ao consultor, avisa o cliente). Ver
// src/lib/visto-service.ts. Autorizacao por capacidade (casos.gerir).
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
  const status = String(body?.status || "");

  if (!contratoId || !status) {
    return NextResponse.json({ ok: false, error: "Informe contratoId e status" }, { status: 400 });
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
    const resultado = await registrarStatusVisto({
      contratoId,
      titularIdEsperado: titularId,
      status,
      autor,
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (err) {
    if (err instanceof VistoBloqueado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("[visto] falha ao registrar status do visto");
    return NextResponse.json({ ok: false, error: "Falha ao registrar o status do visto" }, { status: 500 });
  }
}
