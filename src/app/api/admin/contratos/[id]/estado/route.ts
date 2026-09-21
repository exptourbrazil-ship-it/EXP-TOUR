import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { barrarContratoForaDoEscopo } from "@/lib/admin-tenant";
import { obterIp } from "@/lib/rate-limit";
import { estadoDoContrato, registrarTransicao } from "@/lib/contrato-estado-service";
import { podeTransicionar, proximosEstados, estadoValido, rotuloEstado, type EstadoContrato } from "@/lib/contrato-estados";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Máquina de estados do contrato — leitura e transição MANUAL pelo admin.
//  GET  -> estado atual (persistido ou derivado) + próximos válidos + histórico.
//  POST -> transição manual. { para, motivo, override? }.
// RBAC: leitura = casos.ver; transição válida = casos.gerir; transição fora da
// tabela (override) = capacidade 'override' (só Gestor) + justificativa.

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron. O caminho Bearer nao tem e-mail de
// sessao, entao a trilha atribui tudo a "bearer-secret" e o escopoTenantAdmin
// o promove a super-admin GLOBAL, atravessando as duas marcas. So as telas do
// admin chamam esta rota, por cookie.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("casos.ver"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 403 });
  }
  const { id } = await params;
  const supabase = getSupabase();

  // Isolamento por marca: sem isto, um admin da Forio lia o estado e o historico
  // completo de transicoes (autor, motivo, datas) de um contrato da EXP Tour so
  // por ter `casos.ver`. A rota irma enviar-assinatura ja fazia esta checagem.
  const barrado = await barrarContratoForaDoEscopo(supabase, id);
  if (barrado) return barrado;

  const estado = await estadoDoContrato(supabase, id);
  if (estado === null) {
    return NextResponse.json({ ok: false, erro: "Contrato não encontrado." }, { status: 404 });
  }

  const { data: historico } = await supabase
    .from("contrato_transicoes")
    .select("de, para, origem, autor, motivo, override, created_at")
    .eq("contrato_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    ok: true,
    estado,
    rotulo: rotuloEstado(estado),
    proximos: proximosEstados(estado).map((e) => ({ estado: e, rotulo: rotuloEstado(e) })),
    historico: historico ?? [],
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Autorização base: precisa poder gerir casos para transição normal.
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 403 });
  }

  const { id } = await params;
  const b = await request.json().catch(() => null);
  const para = b?.para ? String(b.para) : "";
  const motivo = b?.motivo ? String(b.motivo).trim() : "";

  if (!estadoValido(para)) {
    return NextResponse.json({ ok: false, erro: "Estado de destino inválido." }, { status: 400 });
  }
  // Cancelamento tem rota/domínio próprio (grava cancelado_em/tipo/motivo e exige
  // cancelamento.gerir). Não permitir 'cancelado' por aqui evita bypass de RBAC e
  // divergência com a régua de cobrança (que se baseia em cancelado_em).
  if (para === "cancelado") {
    return NextResponse.json(
      { ok: false, erro: "Use a ação de cancelamento (exige a capacidade de cancelamento)." },
      { status: 400 },
    );
  }
  // Transição manual sempre exige justificativa registrada (docs/07).
  if (motivo.length < 3) {
    return NextResponse.json({ ok: false, erro: "Descreva o motivo (mínimo 3 caracteres)." }, { status: 400 });
  }

  const supabase = getSupabase();

  // Mesma barreira do GET: sem ela um admin de uma marca transiciona — e com
  // `override`, para fora da tabela de transicoes validas — contrato da outra.
  const barrado = await barrarContratoForaDoEscopo(supabase, id);
  if (barrado) return barrado;
  const de = await estadoDoContrato(supabase, id);
  if (de === null) {
    return NextResponse.json({ ok: false, erro: "Contrato não encontrado." }, { status: 404 });
  }
  if (de === para) {
    return NextResponse.json({ ok: false, erro: "O contrato já está neste estado." }, { status: 400 });
  }

  const valida = podeTransicionar(de, para as EstadoContrato);
  // Transição fora da tabela de válidas exige a capacidade 'override' (só Gestor).
  if (!valida) {
    if (!(await checarCapacidadeAdmin("override"))) {
      return NextResponse.json(
        { ok: false, erro: `Transição ${rotuloEstado(de)} → ${rotuloEstado(para as EstadoContrato)} exige permissão de override.` },
        { status: 403 },
      );
    }
  }

  const usuario = (await usuarioAdminAtual()) ?? "sessao-expirada";
  const res = await registrarTransicao(supabase, {
    contratoId: id,
    de,
    para: para as EstadoContrato,
    origem: "admin",
    autor: usuario,
    motivo,
    override: !valida,
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, erro: res.erro }, { status: 400 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "contrato.estado.transicao",
    alvo: id,
    detalhe: { de, para, override: !valida, motivo },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, de: res.de, para: res.para, override: res.override });
}
