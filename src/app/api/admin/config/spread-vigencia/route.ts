import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Spread de intermediação e câmbio por vigência. Mesma fonte única do IOF, e
// pelo mesmo motivo: o spread compõe a `cotacao_vet` que o cliente PAGA. Antes
// ele vivia só na env SPREAD_CAMBIO_PERCENTUAL — em produção ficou 6,6% enquanto
// a proposta anunciava 5%, e ninguém viu porque não havia registro nem tela.
//
// Só Gestor (config.gerir). GET lista; POST agenda um percentual a partir de uma
// data; DELETE remove. O percentual é FRAÇÃO em [0,1] (ex.: 0.05 = 5%).
/** Teto de negócio do spread. Acima disso não é operação de tela. */
const SPREAD_MAXIMO = 0.2;

function hojeBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
}

export async function GET(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const { data, error } = await getSupabase()
    .from("spread_cambio_vigencia")
    .select("id, percentual, vigente_desde, observacao, criado_em")
    .order("vigente_desde", { ascending: false });
  if (error) return NextResponse.json({ ok: false, erro: "Falha ao listar." }, { status: 500 });
  return NextResponse.json({ ok: true, itens: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await checarCapacidadeAdmin("config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) ?? {};
  // `typeof number` e nao `Number(...)`: `Number(true)` e 1, que passaria no
  // intervalo e gravaria spread de 100% — o estudante pagaria o dobro.
  const percentual = body.percentual;
  const vigenteDesde = typeof body.vigenteDesde === "string" ? body.vigenteDesde.slice(0, 10) : "";
  if (typeof percentual !== "number" || !Number.isFinite(percentual) || percentual < 0) {
    return NextResponse.json(
      { ok: false, erro: "Spread deve ser uma fração entre 0 e 1 (ex.: 0.05 = 5%)." },
      { status: 400 },
    );
  }
  // Teto de NEGOCIO, nao so de sanidade: o intervalo [0,1] pega o erro grosseiro
  // (5 no lugar de 0.05), mas nao o erro de uma casa (0.5 no lugar de 0.05), que
  // dobraria a conta de todo mundo em silencio.
  if (percentual > SPREAD_MAXIMO) {
    return NextResponse.json(
      { ok: false, erro: `Spread acima de ${SPREAD_MAXIMO * 100}% precisa ser tratado fora desta tela.` },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde) || Number.isNaN(Date.parse(`${vigenteDesde}T00:00:00Z`))) {
    return NextResponse.json({ ok: false, erro: "Informe a data de vigência (AAAA-MM-DD)." }, { status: 400 });
  }
  // Sem retroatividade: a cobranca RECOMPOE a VET no momento do Pix, entao uma
  // vigencia com data passada mudaria o valor de propostas ja apresentadas.
  if (vigenteDesde < hojeBrasil()) {
    return NextResponse.json(
      { ok: false, erro: "A vigência não pode começar no passado; use hoje ou uma data futura." },
      { status: 400 },
    );
  }
  const observacao = typeof body.observacao === "string" ? body.observacao.slice(0, 500) : null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("spread_cambio_vigencia")
    .insert({ percentual, vigente_desde: vigenteDesde, observacao })
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
    acao: "config.spread_vigencia.criar",
    alvo: data.id as string,
    detalhe: { percentual, vigente_desde: vigenteDesde },
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

  const { data: alvo } = await supabase
    .from("spread_cambio_vigencia")
    .select("percentual, vigente_desde")
    .eq("id", id)
    .maybeSingle();
  if (!alvo) return NextResponse.json({ ok: false, erro: "Vigência não encontrada." }, { status: 404 });

  // So vigencia FUTURA pode ser removida — isso e cancelar um agendamento.
  // Apagar a vigente (ou a ultima) devolveria o spread para a variavel de
  // ambiente sem nenhum sinal, que foi exatamente como 6,6% ficou valendo.
  // Mudanca de spread se faz adicionando uma vigencia nova, nunca apagando.
  if ((alvo.vigente_desde as string).slice(0, 10) <= hojeBrasil()) {
    return NextResponse.json(
      {
        ok: false,
        erro: "Só é possível cancelar uma vigência futura. Para mudar o spread, adicione uma nova vigência.",
      },
      { status: 409 },
    );
  }

  const { data: removidas, error } = await supabase
    .from("spread_cambio_vigencia")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ ok: false, erro: "Falha ao remover." }, { status: 500 });
  if (!removidas || removidas.length === 0) {
    return NextResponse.json({ ok: false, erro: "Vigência não encontrada." }, { status: 404 });
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "sessao-expirada",
    acao: "config.spread_vigencia.remover",
    // O "antes" precisa estar aqui: depois do delete nao ha como reconstruir
    // qual percentual saiu.
    detalhe: { percentual_removido: alvo.percentual, vigente_desde: alvo.vigente_desde },
    alvo: id,
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
