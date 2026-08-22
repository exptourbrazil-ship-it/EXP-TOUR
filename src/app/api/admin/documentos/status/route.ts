import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { enviarAvisoDocumentoEmail } from "@/lib/email";
import { labelDoTipoDocumento } from "@/lib/documentos";

export const runtime = "nodejs";

const STATUS_VALIDOS = ["pendente", "aprovado", "rejeitado"];
const MOTIVO_MAX = 500;

// Analise inline de um documento pelo admin (Caso 360): aprovar/rejeitar. Ao
// rejeitar, exige um motivo (lista fechada + texto livre na UI), grava em
// documentos.motivo_rejeicao, registra na trilha e avisa o titular por e-mail.
// Autorizacao por capacidade (documentos.analisar).
export async function PATCH(request: Request) {
  if (!(await checarCapacidadeRequest(request, "documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const id = String(body.id || "");
  const status = String(body.status || "");
  const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, MOTIVO_MAX) : "";

  if (!id || !STATUS_VALIDOS.includes(status)) {
    return NextResponse.json({ ok: false, error: "Informe id e status valido" }, { status: 400 });
  }
  // Rejeicao sem motivo nao ajuda o cliente a saber o que refazer.
  if (status === "rejeitado" && !motivo) {
    return NextResponse.json(
      { ok: false, error: "Informe o motivo da rejeicao" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Carrega o documento (e o titular) ANTES de atualizar: precisamos do tipo e
  // do e-mail para o aviso, e confirma que o documento existe.
  const { data: documento } = await supabase
    .from("documentos")
    .select("id, tipo_documento, titular_id")
    .eq("id", id)
    .maybeSingle();
  if (!documento) {
    return NextResponse.json({ ok: false, error: "Documento nao encontrado" }, { status: 404 });
  }

  // motivo_rejeicao so faz sentido no estado rejeitado; nos demais e limpo.
  const motivoPersistir = status === "rejeitado" ? motivo : null;
  const { error } = await supabase
    .from("documentos")
    .update({ status, motivo_rejeicao: motivoPersistir })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Falha ao atualizar status" }, { status: 500 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "documento.status.definir",
    alvo: id,
    detalhe: {
      status,
      titular_id: documento.titular_id,
      tipo_documento: documento.tipo_documento,
      ...(motivoPersistir ? { motivo: motivoPersistir } : {}),
    },
    ip: obterIp(request),
  });

  // Aviso ao titular (aprovado/rejeitado). Best-effort: uma falha de e-mail nao
  // desfaz a mudanca de status ja gravada.
  let avisoEnviado = false;
  if (status === "aprovado" || status === "rejeitado") {
    const { data: titular } = await supabase
      .from("titulares")
      .select("nome_completo, email")
      .eq("id", documento.titular_id)
      .maybeSingle();
    if (titular?.email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
      try {
        await enviarAvisoDocumentoEmail(titular.email, titular.nome_completo || "", {
          tipoDocumento: labelDoTipoDocumento(documento.tipo_documento),
          aprovado: status === "aprovado",
          motivo: motivoPersistir,
          portalUrl: appUrl || null,
        });
        avisoEnviado = true;
      } catch {
        // Sem o erro cru: a mensagem do provedor pode conter o e-mail (PII).
        // A falha ja fica registrada, com detalhe, em email_logs.
        console.error("[documentos/status] falha ao avisar o titular por e-mail (ver email_logs)");
      }
    }
  }

  return NextResponse.json({ ok: true, avisoEnviado });
}
