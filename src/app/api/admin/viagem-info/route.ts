import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import type { CapacidadeAdmin } from "@/lib/admin-roles";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Rota administrativa para preencher os dados da aba Viagem (viagem_info) de um
// contrato: escola, endereco, acomodacao, contato local e observacoes.
//
// Autenticacao: cookie de sessao de admin (login em /admin/login), com
// fallback ao Bearer ADMIN_CAMBIO_SECRET.
async function checarAuth(request: Request, capacidade: CapacidadeAdmin): Promise<boolean> {
  if (await checarCapacidadeAdmin(capacidade)) return true;
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!adminSecret) return false;
  return authHeader === "Bearer " + adminSecret;
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Lista os contratos com o nome do titular/estudante e os dados de viagem ja
// preenchidos (se houver), para o seletor do painel.
export async function GET(request: Request) {
  if (!(await checarAuth(request, "casos.ver"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = getSupabase();

  // Duas queries separadas (mais robusto que embed reverso do PostgREST):
  // 1) contratos + nome do titular; 2) viagem_info; merge por contrato_id.
  const { data: contratosRaw, error } = await supabase
    .from("contratos")
    .select("id, nome, estudante_nome, pais_destino, titular_id")
    .order("estudante_nome", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel listar os contratos: " + error.message }, { status: 500 });
  }

  const titularIds = Array.from(new Set((contratosRaw || []).map((c: any) => c.titular_id).filter(Boolean)));
  const contratoIds = (contratosRaw || []).map((c: any) => c.id);

  const { data: titulares } = titularIds.length
    ? await supabase.from("titulares").select("id, nome_completo").in("id", titularIds)
    : { data: [] };
  const mapaTitular = new Map((titulares || []).map((t: any) => [t.id, t.nome_completo]));

  const { data: infos } = contratoIds.length
    ? await supabase
        .from("viagem_info")
        .select("contrato_id, escola_nome, escola_endereco, acomodacao_endereco, contato_local_nome, contato_local_telefone, observacoes")
        .in("contrato_id", contratoIds)
    : { data: [] };
  const mapaInfo = new Map((infos || []).map((i: any) => [i.contrato_id, i]));

  const contratos = (contratosRaw || []).map((c: any) => ({
    id: c.id,
    nome: c.nome,
    estudante_nome: c.estudante_nome,
    pais_destino: c.pais_destino,
    titular_nome: mapaTitular.get(c.titular_id) || null,
    info: mapaInfo.get(c.id) || null,
  }));

  return NextResponse.json({ ok: true, contratos });
}

// Salva (cria ou atualiza) os dados de viagem de um contrato.
export async function POST(request: Request) {
  if (!(await checarAuth(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const contratoId = body?.contratoId ? String(body.contratoId) : null;
  if (!contratoId) {
    return NextResponse.json({ ok: false, erro: "Informe 'contratoId'." }, { status: 400 });
  }

  const limpar = (v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s ? s.slice(0, 2000) : null;
  };

  const registro = {
    contrato_id: contratoId,
    escola_nome: limpar(body?.escolaNome),
    escola_endereco: limpar(body?.escolaEndereco),
    acomodacao_endereco: limpar(body?.acomodacaoEndereco),
    contato_local_nome: limpar(body?.contatoLocalNome),
    contato_local_telefone: limpar(body?.contatoLocalTelefone),
    observacoes: limpar(body?.observacoes),
    atualizado_em: new Date().toISOString(),
  };

  const supabase = getSupabase();
  const { error } = await supabase.from("viagem_info").upsert(registro, { onConflict: "contrato_id" });

  if (error) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel salvar os dados." }, { status: 500 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "viagem_info.definir",
    alvo: contratoId,
    detalhe: { escola_nome: registro.escola_nome },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true });
}
