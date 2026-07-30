import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarAdminRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { calcularHashTermo } from "@/lib/termos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gestao das versoes do Termo de Adesao (admin).
//  GET   -> lista as versoes (sem o conteudo, para a lista).
//  POST  -> cria uma nova versao (calcula o hash) e a torna a vigente, marcando
//           as demais como inativas (uma unica versao ativa por tipo).
//  PATCH -> ativa/desativa uma versao (ativar desativa as demais do mesmo tipo).
// Autenticacao: sessao de admin (ou Bearer de compatibilidade).

const TIPO = "adesao";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

export async function GET(request: Request) {
  if (!(await checarAdminRequest(request))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("termos")
    .select("id, tipo, versao, hash, ativo, vigente_desde, criado_em")
    .eq("tipo", TIPO)
    .order("vigente_desde", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao listar as versoes." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, termos: data || [] });
}

export async function POST(request: Request) {
  if (!(await checarAdminRequest(request))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const versao = body?.versao ? String(body.versao).trim() : "";
  const conteudo = typeof body?.conteudo === "string" ? body.conteudo : "";
  if (!versao || !conteudo.trim()) {
    return NextResponse.json({ ok: false, erro: "Informe 'versao' e 'conteudo'." }, { status: 400 });
  }

  const supabase = getSupabase();
  const hash = calcularHashTermo(conteudo);

  const { data: novo, error } = await supabase
    .from("termos")
    .insert({ tipo: TIPO, versao, conteudo, hash, ativo: true })
    .select("id, versao, hash")
    .single();
  if (error || !novo) {
    // 23505 = unique_violation (versao repetida para o tipo).
    const dup = (error as any)?.code === "23505";
    return NextResponse.json(
      { ok: false, erro: dup ? "Ja existe uma versao com esse identificador." : "Falha ao salvar a versao." },
      { status: dup ? 409 : 500 }
    );
  }

  // Torna esta a unica vigente: desativa as demais do mesmo tipo.
  await supabase.from("termos").update({ ativo: false }).eq("tipo", TIPO).neq("id", novo.id);

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "termo.criar",
    alvo: novo.id,
    detalhe: { versao, hash: novo.hash },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, termo: novo });
}

export async function PATCH(request: Request) {
  if (!(await checarAdminRequest(request))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const id = body?.id ? String(body.id) : "";
  const ativo = Boolean(body?.ativo);
  if (!id) {
    return NextResponse.json({ ok: false, erro: "Informe 'id'." }, { status: 400 });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("termos").update({ ativo }).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar a versao." }, { status: 500 });
  }
  // Ao ativar, garante versao unica vigente (desativa as demais).
  if (ativo) {
    await supabase.from("termos").update({ ativo: false }).eq("tipo", TIPO).neq("id", id);
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "termo.status",
    alvo: id,
    detalhe: { ativo },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true });
}
