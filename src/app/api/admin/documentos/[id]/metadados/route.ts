import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { barrarDocumentoForaDoEscopo } from "@/lib/admin-tenant";
import { ehTipoDocumentoValido } from "@/lib/documentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    } else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) {
      patch.validade = v;
    } else {
      return NextResponse.json(
        { ok: false, error: "Validade inválida. Use o formato AAAA-MM-DD ou vazio para limpar." },
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
      // Antes/depois só dos campos tocados (trilha do que mudou).
      ...(temTipo ? { tipo_anterior: doc.tipo_documento, tipo_novo: patch.tipo_documento } : {}),
      ...(temValidade ? { validade_anterior: (doc as { validade?: string | null }).validade ?? null, validade_nova: patch.validade } : {}),
    },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, tipo_documento: patch.tipo_documento ?? doc.tipo_documento, validade: temValidade ? patch.validade : (doc as { validade?: string | null }).validade ?? null });
}
