import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { validarFaixasRetencao } from "@/lib/acerto";

export const runtime = "nodejs";

// Config de RETENCAO por instancia (motor de acerto, Fatia A). GET le a config
// vigente; PUT atualiza faixas / tipos-sem-retencao / validacao juridica. So
// Gestor (config.gerir) por SESSAO, sem Bearer — parametro de negocio sensivel.

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(url, key);
}

export async function GET() {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }
  const supabase = getSupabase();
  const { data } = await supabase
    .from("config_retencao")
    .select("faixas, tipos_sem_retencao, validado_juridicamente, observacao, atualizada_em, atualizado_por")
    .eq("vigente", true)
    .maybeSingle();
  return NextResponse.json({ ok: true, config: data ?? null });
}

export async function PUT(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }
  const autor = await usuarioAdminAtual();
  if (!autor) {
    return NextResponse.json({ ok: false, error: "Sessao admin nao identificada" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const faixas = body?.faixas;
  const val = validarFaixasRetencao(faixas);
  if (!val.ok) {
    return NextResponse.json({ ok: false, error: `Faixas invalidas (${val.motivo})` }, { status: 400 });
  }
  const tiposSemRetencao = Array.isArray(body?.tiposSemRetencao)
    ? body.tiposSemRetencao.filter((t: unknown) => typeof t === "string")
    : [];
  const validado = body?.validadoJuridicamente === true;
  const observacao = typeof body?.observacao === "string" ? body.observacao.slice(0, 2000) : null;

  const supabase = getSupabase();
  const patch = {
    faixas,
    tipos_sem_retencao: tiposSemRetencao,
    validado_juridicamente: validado,
    observacao,
    atualizado_por: autor,
    atualizada_em: new Date().toISOString(),
  };

  // Atualiza a linha vigente; se nao houver, insere.
  const { data: existente } = await supabase
    .from("config_retencao")
    .select("id")
    .eq("vigente", true)
    .maybeSingle();

  let erro: unknown = null;
  if (existente?.id) {
    ({ error: erro } = await supabase.from("config_retencao").update(patch).eq("id", existente.id));
  } else {
    ({ error: erro } = await supabase.from("config_retencao").insert({ ...patch, vigente: true }));
  }
  if (erro) {
    console.error("[config-retencao] falha ao salvar a config");
    return NextResponse.json({ ok: false, error: "Falha ao salvar a config" }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: autor,
    acao: "config.retencao.atualizar",
    alvo: "config_retencao",
    detalhe: { faixas, tipos_sem_retencao: tiposSemRetencao, validado_juridicamente: validado },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true });
}
