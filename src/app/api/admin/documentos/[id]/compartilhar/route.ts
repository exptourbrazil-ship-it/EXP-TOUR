import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compartilha (ou deixa de compartilhar) UM documento com a escola no Portal do
// Fornecedor. Nada e visivel a escola por padrao; aqui o admin decide caso a
// caso. Autorizacao por capacidade documentos.analisar (mesma da analise inline).
//
// A visibilidade no portal e SEMPRE por contrato (isolamento entre escolas). Por
// isso, ao compartilhar um documento de nivel titular (sem contrato_id), tentamos
// vincula-lo ao contrato do titular quando ele tem exatamente UM; se houver mais
// de um (ou nenhum), recusamos e pedimos que a viagem/contrato seja resolvida
// antes — compartilhar sem contrato deixaria o doc invisivel (ou ambiguo).
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "ID ausente." }, { status: 400 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  if (typeof body?.compartilhar !== "boolean") {
    return NextResponse.json({ ok: false, error: "Informe compartilhar (boolean)." }, { status: 400 });
  }
  const compartilhar = body.compartilhar as boolean;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: doc } = await supabase
    .from("documentos")
    .select("id, titular_id, contrato_id, tipo_documento, status")
    .eq("id", id)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ ok: false, error: "Documento nao encontrado" }, { status: 404 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  const patch: Record<string, unknown> = {
    compartilhado_fornecedor: compartilhar,
    compartilhado_em: compartilhar ? new Date().toISOString() : null,
    compartilhado_por: compartilhar ? usuario : null,
  };

  // Ao compartilhar, garante o vinculo por contrato (isolamento entre escolas).
  let contratoVinculado: string | null = null;
  if (compartilhar && !doc.contrato_id) {
    const { data: contratos } = await supabase
      .from("contratos")
      .select("id")
      .eq("titular_id", doc.titular_id);
    if ((contratos?.length ?? 0) === 1) {
      patch.contrato_id = contratos![0].id;
      contratoVinculado = contratos![0].id;
    } else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Documento sem contrato vinculado (o titular tem 0 ou mais de 1 contrato). Vincule o documento a um contrato antes de compartilhar.",
        },
        { status: 422 }
      );
    }
  }

  const { error } = await supabase.from("documentos").update(patch).eq("id", id);
  if (error) {
    console.error("[documentos/compartilhar] update falhou:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao atualizar o compartilhamento." }, { status: 500 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: compartilhar ? "documento.compartilhar" : "documento.descompartilhar",
    alvo: id,
    detalhe: {
      titular_id: doc.titular_id,
      tipo_documento: doc.tipo_documento,
      // Registra o vinculo automatico de contrato (muda a que contrato o doc
      // pertence), para a trilha ter o antes/depois.
      ...(contratoVinculado ? { contrato_id_anterior: null, contrato_id_novo: contratoVinculado } : {}),
    },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, compartilhado: compartilhar });
}
