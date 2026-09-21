import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// IOF-câmbio por vigência (§8, fonte única). Global (federal). Só Gestor
// (config.gerir). GET lista; POST agenda uma alíquota a partir de uma data;
// DELETE remove. A alíquota é FRAÇÃO em [0,1] (ex.: 0.035 = 3,5%).
//
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET: esse
// segredo existe para cambio/cron e daria a qualquer portador o poder de mudar a
// aliquota aplicada a TODO estudante. Nenhum cron chama esta rota — so a tela,
// por cookie —, entao fechar nao quebra integracao nenhuma.
function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
}

export async function GET(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const { data, error } = await getSupabase()
    .from("iof_vigencia")
    .select("id, aliquota, vigente_desde, observacao, criado_em")
    .order("vigente_desde", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erro: "Falha ao listar." }, { status: 500 });
  return NextResponse.json({ ok: true, itens: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) ?? {};
  const aliquota = Number(body.aliquota);
  const vigenteDesde = typeof body.vigenteDesde === "string" ? body.vigenteDesde.slice(0, 10) : "";
  if (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 1) {
    return NextResponse.json({ ok: false, erro: "Alíquota deve ser uma fração entre 0 e 1 (ex.: 0.035 = 3,5%)." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde)) {
    return NextResponse.json({ ok: false, erro: "Informe a data de vigência (AAAA-MM-DD)." }, { status: 400 });
  }
  const observacao = typeof body.observacao === "string" ? body.observacao.slice(0, 500) : null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("iof_vigencia")
    .insert({ aliquota, vigente_desde: vigenteDesde, observacao })
    .select("id")
    .single();
  if (error || !data) {
    const dup = (error as { code?: string } | null)?.code === "23505";
    return NextResponse.json(
      { ok: false, erro: dup ? "Já existe uma vigência para essa data." : "Falha ao salvar." },
      { status: dup ? 409 : 500 },
    );
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "sessao-expirada",
    acao: "config.iof_vigencia.criar",
    alvo: data.id as string,
    detalhe: { aliquota, vigente_desde: vigenteDesde },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });
  const supabase = getSupabase();
  const { error } = await supabase.from("iof_vigencia").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: "Falha ao remover." }, { status: 500 });
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "sessao-expirada",
    acao: "config.iof_vigencia.remover",
    alvo: id,
    detalhe: {},
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
