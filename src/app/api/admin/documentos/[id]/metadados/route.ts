import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { barrarDocumentoForaDoEscopo } from "@/lib/admin-tenant";
import { ehTipoDocumentoValido, tipoTemValidade } from "@/lib/documentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Valida uma data de calendário REAL (não só o formato). Date.parse aceita
// "2026-02-30" fazendo roll-over — aqui remontamos em UTC e conferimos os
// componentes de volta, rejeitando datas impossíveis.
function ehDataCalendarioValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// Metadados de Vistos de UM documento: data de validade (expiração) e tipo. É a
// INGESTÃO que alimenta os agentes de retaguarda de Vistos (validade vs.
// exigência do destino; carta de recusa e seu prazo de repasse). O detective só
// LÊ estes campos; quem os grava é o admin, aqui, por ação humana.
//
// Autorização por capacidade documentos.analisar (mesma da análise/compartilhar),
// escopo por tenant (barrarDocumentoForaDoEscopo), auditado. Atualização parcial:
// envie `validade` (YYYY-MM-DD ou null p/ limpar) e/ou `tipoDocumento`.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const temValidade = Object.prototype.hasOwnProperty.call(body, "validade");
  const temTipo = Object.prototype.hasOwnProperty.call(body, "tipoDocumento");
  if (!temValidade && !temTipo) {
    return NextResponse.json(
      { ok: false, error: "Informe validade e/ou tipoDocumento." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};

  if (temValidade) {
    const v = body.validade;
    if (v === null || v === "") {
      patch.validade = null;
    } else if (typeof v === "string" && ehDataCalendarioValida(v)) {
      patch.validade = v;
    } else {
      return NextResponse.json(
        { ok: false, error: "Validade inválida. Use o formato AAAA-MM-DD (data real) ou vazio para limpar." },
        { status: 400 },
      );
    }
  }

  if (temTipo) {
    const t = body.tipoDocumento;
    if (typeof t !== "string" || !ehTipoDocumentoValido(t)) {
      return NextResponse.json({ ok: false, error: "Tipo de documento inválido." }, { status: 400 });
    }
    patch.tipo_documento = t;
    // Reclassificar para um tipo SEM validade limpa a validade órfã: senão o
    // detective de Vistos (que olha qualquer doc com validade) seguiria sinalizando
    // com base numa data que não pertence mais ao documento (achado da revisão).
    // Só limpa quando o próprio request não está definindo uma validade.
    if (!tipoTemValidade(t) && !temValidade) {
      patch.validade = null;
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  // Escopo por tenant: documento de outro tenant -> mesma resposta de inexistente.
  const barrado = await barrarDocumentoForaDoEscopo(supabase, id);
  if (barrado) return barrado;

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, titular_id, tipo_documento, validade")
    .eq("id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Documento nao encontrado" }, { status: 404 });
  }

  const { error } = await supabase.from("documentos").update(patch).eq("id", id);
  if (error) {
    console.error("[documentos/metadados] update falhou:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao atualizar o documento." }, { status: 500 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "documento.metadados",
    alvo: id,
    detalhe: {
      titular_id: doc.titular_id,
      // Antes/depois só dos campos efetivamente tocados no patch (inclui a
      // validade limpa automaticamente pela reclassificação).
      ...(temTipo ? { tipo_anterior: doc.tipo_documento, tipo_novo: patch.tipo_documento } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "validade")
        ? { validade_anterior: (doc as { validade?: string | null }).validade ?? null, validade_nova: patch.validade }
        : {}),
    },
    ip: obterIp(request),
  });

  const validadeFinal = Object.prototype.hasOwnProperty.call(patch, "validade")
    ? (patch.validade as string | null)
    : ((doc as { validade?: string | null }).validade ?? null);
  return NextResponse.json({ ok: true, tipo_documento: patch.tipo_documento ?? doc.tipo_documento, validade: validadeFinal });
}
