import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { definirProcessamentoImediato } from "@/lib/payout-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: marca/desmarca "processamento imediato" (Clausulas 2.5.2 / 8.4) — a
// autorizacao do cliente que LIBERA a remessa da Entrada antes de decorrido o
// arrependimento. Money-touching (levanta a trava): exige SESSAO admin com
// financeiro.gerir (sem o bearer de env). Body: { imediato: boolean }.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) ?? {};
  if (typeof body.imediato !== "boolean") {
    return NextResponse.json({ ok: false, error: "Informe imediato (boolean)." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  // Guard e sessao-only (sem bearer): o usuario da sessao SEMPRE existe aqui.
  // Levantar a trava e ato juridicamente sensivel -> exige autoria conhecida.
  const usuario = await usuarioAdminAtual();
  if (!usuario) return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });

  const ok = await definirProcessamentoImediato(supabase, id, body.imediato);
  if (!ok) return NextResponse.json({ ok: false, error: "Contrato não encontrado." }, { status: 404 });

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "financeiro.processamento_imediato",
    alvo: id,
    detalhe: { imediato: body.imediato },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
