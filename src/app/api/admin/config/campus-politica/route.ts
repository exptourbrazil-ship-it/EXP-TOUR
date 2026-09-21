import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { obterCampusPolitica, salvarCampusPolitica } from "@/lib/anexo3-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron e daria a qualquer portador o poder de
// mexer em DINHEIRO de cliente, com a trilha registrando so "bearer-secret",
// sem pessoa. So a tela do admin chama esta rota, por cookie.

// Política do campus (1:1, Anexo III v3.1): intake máximo, reembolso, proteção
// estudantil, fonte da política. Só Gestor (config.gerir); escopo por tenant e
// validação no service.
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
}

export async function GET(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const campusId = new URL(request.url).searchParams.get("campus") ?? "";
  const r = await obterCampusPolitica(getSupabase(), campusId);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true, ...(r.data as object) });
}

export async function PUT(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const supabase = getSupabase();
  const body = (await request.json().catch(() => ({}))) ?? {};
  const campusId = typeof body.campusId === "string" ? body.campusId : "";
  const r = await salvarCampusPolitica(supabase, campusId, body);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "sessao-expirada",
    acao: "config.campus_politica.salvar",
    alvo: campusId,
    detalhe: { reembolso_forma: body.reembolsoForma, protecao: body.protecaoEstudantil },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
