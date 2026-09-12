import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anexo III — Politica de Pagamento dos Fornecedores (Clausula 7.5.2).
//  GET ?contratoId= -> itens de um contrato (ou todos, sem o filtro).
//  POST   -> adiciona um item.
//  DELETE ?id= -> remove um item.
// Autenticacao: sessao de admin (ou Bearer de compatibilidade).

const CAMPOS =
  "id, contrato_id, fornecedor, natureza, valor, moeda, prazo, evento, documento_viabiliza, consequencia_atraso, politica_cancelamento, fonte, ordem, created_at";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

export async function GET(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const contratoId = new URL(request.url).searchParams.get("contratoId");
  const supabase = getSupabase();
  let q = supabase.from("anexo_iii_itens").select(CAMPOS).order("ordem", { ascending: true }).order("created_at", { ascending: true });
  if (contratoId) q = q.eq("contrato_id", contratoId);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao listar itens." }, { status: 500 });
  }

  // Estado de emissão (imutabilidade) do contrato selecionado: o client usa para
  // exibir o selo "emitido" e travar os controles de edição.
  let emissao: { emitido: boolean; emitidoEm: string | null; hash: string | null } | null = null;
  if (contratoId) {
    const { data: c } = await supabase
      .from("contratos")
      .select("anexo_iii_snapshot, anexo_iii_emitido_em, hash_anexo_iii")
      .eq("id", contratoId)
      .maybeSingle();
    emissao = {
      emitido: c?.anexo_iii_snapshot != null,
      emitidoEm: c?.anexo_iii_emitido_em ?? null,
      hash: c?.hash_anexo_iii ?? null,
    };
  }

  return NextResponse.json({ ok: true, itens: data || [], emissao });
}

export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const b = await request.json().catch(() => null);
  const contratoId = b?.contratoId ? String(b.contratoId) : "";
  const fornecedor = b?.fornecedor ? String(b.fornecedor).trim() : "";
  if (!contratoId || !fornecedor) {
    return NextResponse.json({ ok: false, erro: "Informe contrato e fornecedor." }, { status: 400 });
  }
  const valorNum = b?.valor !== undefined && b?.valor !== "" ? Number(b.valor) : null;

  const supabase = getSupabase();

  // Imutabilidade (Cláusula 18.2): depois de EMITIDO, o Anexo III não pode mudar.
  const { data: c } = await supabase.from("contratos").select("anexo_iii_snapshot").eq("id", contratoId).maybeSingle();
  if (c?.anexo_iii_snapshot != null) {
    return NextResponse.json({ ok: false, erro: "Anexo III já emitido — é imutável; não é possível adicionar itens." }, { status: 409 });
  }

  const { data: nova, error } = await supabase
    .from("anexo_iii_itens")
    .insert({
      contrato_id: contratoId,
      fornecedor,
      natureza: b?.natureza ? String(b.natureza).trim() : null,
      valor: valorNum !== null && Number.isFinite(valorNum) ? valorNum : null,
      moeda: b?.moeda ? String(b.moeda).toUpperCase().trim() : null,
      prazo: b?.prazo ? String(b.prazo).trim() : null,
      evento: b?.evento ? String(b.evento).trim() : null,
      documento_viabiliza: b?.documentoViabiliza ? String(b.documentoViabiliza).trim() : null,
      consequencia_atraso: b?.consequenciaAtraso ? String(b.consequenciaAtraso).trim() : null,
      politica_cancelamento: b?.politicaCancelamento ? String(b.politicaCancelamento).trim() : null,
      fonte: b?.fonte ? String(b.fonte).trim() : null,
      ordem: Number.isFinite(Number(b?.ordem)) ? Number(b.ordem) : 0,
    })
    .select("id")
    .single();
  if (error || !nova) {
    return NextResponse.json({ ok: false, erro: "Falha ao salvar o item." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "anexo_iii.criar",
    alvo: nova.id,
    detalhe: { contratoId, fornecedor },
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true, id: nova.id });
}

export async function DELETE(request: Request) {
  if (!(await checarCapacidadeRequest(request, "config.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, erro: "Informe id." }, { status: 400 });
  }
  const supabase = getSupabase();

  // Imutabilidade (Cláusula 18.2): descobre o contrato do item e, se já EMITIDO,
  // recusa a remoção — o Anexo III emitido não pode mudar.
  const { data: item } = await supabase
    .from("anexo_iii_itens")
    .select("contrato_id")
    .eq("id", id)
    .maybeSingle();
  if (item?.contrato_id) {
    const { data: c } = await supabase
      .from("contratos")
      .select("anexo_iii_snapshot")
      .eq("id", item.contrato_id)
      .maybeSingle();
    if (c?.anexo_iii_snapshot != null) {
      return NextResponse.json({ ok: false, erro: "Anexo III já emitido — é imutável; não é possível remover itens." }, { status: 409 });
    }
  }

  const { error } = await supabase.from("anexo_iii_itens").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao remover o item." }, { status: 500 });
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "anexo_iii.remover",
    alvo: id,
    ip: obterIp(request),
  });
  return NextResponse.json({ ok: true });
}
