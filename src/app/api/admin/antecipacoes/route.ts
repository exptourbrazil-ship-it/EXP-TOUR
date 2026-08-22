import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Antecipacoes por exigencia de visto/fornecedor (Clausula 7.5).
//  GET   -> lista as antecipacoes (com rotulo do contrato/titular).
//  POST  -> registra uma nova antecipacao exigida (com lastro documental).
//  PATCH -> muda o status (atendida/cancelada).
// Autenticacao: sessao de admin (ou Bearer de compatibilidade).

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

export async function GET(request: Request) {
  if (!(await checarCapacidadeRequest(request, "financeiro.ver"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("antecipacoes")
    .select("id, contrato_id, documento, justificativa, valor, moeda, data_limite, comprovante_url, status, created_at, contrato:contratos(nome, estudante_nome, titular:titulares(nome_completo))")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao listar antecipacoes." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, antecipacoes: data || [] });
}

export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const contratoId = body?.contratoId ? String(body.contratoId) : "";
  const documento = body?.documento ? String(body.documento).trim() : "";
  const justificativa = body?.justificativa ? String(body.justificativa).trim() : null;
  const valor = Number(body?.valor);
  const moeda = body?.moeda ? String(body.moeda).toUpperCase().trim() : "";
  const dataLimite = body?.dataLimite ? String(body.dataLimite).trim() : "";
  const comprovanteUrl = body?.comprovanteUrl ? String(body.comprovanteUrl).trim() : null;

  if (!contratoId || !documento || !moeda || !dataLimite || !Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json(
      { ok: false, erro: "Informe contrato, documento, valor (>0), moeda e data-limite." },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLimite)) {
    return NextResponse.json({ ok: false, erro: "Data-limite invalida (use AAAA-MM-DD)." }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: nova, error } = await supabase
    .from("antecipacoes")
    .insert({
      contrato_id: contratoId,
      documento,
      justificativa,
      valor,
      moeda,
      data_limite: dataLimite,
      comprovante_url: comprovanteUrl,
      criado_por: (await usuarioAdminAtual()) ?? "bearer-secret",
    })
    .select("id")
    .single();
  if (error || !nova) {
    return NextResponse.json({ ok: false, erro: "Falha ao registrar a antecipacao." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "antecipacao.criar",
    alvo: nova.id,
    detalhe: { contratoId, documento, valor, moeda, dataLimite },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, id: nova.id });
}

export async function PATCH(request: Request) {
  if (!(await checarCapacidadeRequest(request, "financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const id = body?.id ? String(body.id) : "";
  const status = body?.status ? String(body.status) : "";
  if (!id || !["pendente", "atendida", "cancelada"].includes(status)) {
    return NextResponse.json({ ok: false, erro: "Informe id e status valido." }, { status: 400 });
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from("antecipacoes")
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar a antecipacao." }, { status: 500 });
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "antecipacao.status",
    alvo: id,
    detalhe: { status },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
