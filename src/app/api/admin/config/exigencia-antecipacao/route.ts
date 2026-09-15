import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { listarExigencias, criarExigencia, removerExigencia } from "@/lib/anexo3-admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exigência de antecipação por campus (ativa a Cláusula 7.5, Anexo III v3.1).
// Só Gestor (config.gerir); escopo por tenant e validação no service.
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
}

export async function GET(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const campusId = new URL(request.url).searchParams.get("campus") ?? "";
  const r = await listarExigencias(getSupabase(), campusId);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });
  return NextResponse.json({ ok: true, itens: r.data });
}

export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const supabase = getSupabase();
  const body = (await request.json().catch(() => ({}))) ?? {};
  const campusId = typeof body.campusId === "string" ? body.campusId : "";
  const r = await criarExigencia(supabase, campusId, body);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "config.exigencia_antecipacao.criar",
    alvo: r.data.id,
    detalhe: { campus_id: campusId, evento: body.eventoGerador, ativa: body.ativa === true },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true, id: r.data.id });
}

export async function DELETE(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const supabase = getSupabase();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const r = await removerExigencia(supabase, id);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: r.status });
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "config.exigencia_antecipacao.remover",
    alvo: id,
    detalhe: {},
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
