import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Propostas (checkout / estados 0-1, Clausula 2.5).
//  GET   -> lista as propostas.
//  POST  -> cria uma proposta (token + validade de 10 dias) para o link publico.
//  PATCH -> muda o status (ex.: cancelada).
// Autenticacao: sessao de admin (ou Bearer de compatibilidade).
// A ACEITACAO (assinatura -> provisiona titular/contrato) sera Fase C, na
// pagina publica; aqui e so a criacao/gestao.

const CAMPOS =
  "id, token, status, nome_completo, cpf, email, telefone, programa_nome, estudante_nome, pais_destino, moeda, custo_programa, data_inicio, validade, aceito_em, contrato_id, created_at";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

export async function GET(request: Request) {
  if (!(await checarCapacidadeRequest(request, "propostas.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("propostas")
    .select(CAMPOS)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao listar propostas." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, propostas: data || [] });
}

export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "propostas.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const b = await request.json().catch(() => null);
  const nome = b?.nomeCompleto ? String(b.nomeCompleto).trim() : "";
  const cpf = b?.cpf ? String(b.cpf).replace(/\D/g, "") : "";
  const moeda = b?.moeda ? String(b.moeda).toUpperCase().trim() : "";
  const custo = b?.custoPrograma !== undefined && b?.custoPrograma !== "" ? Number(b.custoPrograma) : null;

  if (!nome || !cpf || !moeda || custo === null || !Number.isFinite(custo) || custo <= 0) {
    return NextResponse.json(
      { ok: false, erro: "Informe nome, CPF, moeda e custo do programa (>0)." },
      { status: 400 }
    );
  }
  const dataInicio = b?.dataInicio ? String(b.dataInicio).trim() : null;
  if (dataInicio && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) {
    return NextResponse.json({ ok: false, erro: "Data de inicio invalida (AAAA-MM-DD)." }, { status: 400 });
  }
  // Plano sugerido opcional: [{ descricao, valor, vencimento }]
  const plano = Array.isArray(b?.plano) ? b.plano : null;

  const supabase = getSupabase();
  const { data: nova, error } = await supabase
    .from("propostas")
    .insert({
      status: "enviada",
      nome_completo: nome,
      cpf,
      email: b?.email ? String(b.email).trim() : null,
      telefone: b?.telefone ? String(b.telefone).trim() : null,
      programa_nome: b?.programaNome ? String(b.programaNome).trim() : null,
      estudante_nome: b?.estudanteNome ? String(b.estudanteNome).trim() : null,
      pais_destino: b?.paisDestino ? String(b.paisDestino).trim() : null,
      moeda,
      custo_programa: custo,
      plano,
      data_inicio: dataInicio,
      criado_por: (await usuarioAdminAtual()) ?? "bearer-secret",
    })
    .select("id, token")
    .single();
  if (error || !nova) {
    return NextResponse.json({ ok: false, erro: "Falha ao criar a proposta." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "proposta.criar",
    alvo: nova.id,
    detalhe: { cpf, moeda, custo },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, id: nova.id, token: nova.token });
}

export async function PATCH(request: Request) {
  if (!(await checarCapacidadeRequest(request, "propostas.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const b = await request.json().catch(() => null);
  const id = b?.id ? String(b.id) : "";
  const status = b?.status ? String(b.status) : "";
  // Admin so cancela manualmente; 'aceita'/'expirada' sao efeitos do fluxo.
  if (!id || !["cancelada", "enviada"].includes(status)) {
    return NextResponse.json({ ok: false, erro: "Informe id e status valido (cancelada/enviada)." }, { status: 400 });
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from("propostas")
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar a proposta." }, { status: 500 });
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "proposta.status",
    alvo: id,
    detalhe: { status },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
