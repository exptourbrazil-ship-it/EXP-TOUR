// NB: modulo server-only (service role). Efeito do webhook do Zoho Sign, no
// mesmo espirito do mp-processar-pagamento: recebe o payload, atualiza o estado
// local e, quando o contrato e assinado, persiste o PDF no Storage (fonte de
// verdade), registra em `documentos`, espelha no Contato do Zoho CRM e liga o
// documento ao envelope. Idempotente por envelope (nao persiste o PDF duas vezes).
import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairEventoSign } from "@/lib/sign-events";
import { baixarPdfAssinado } from "@/lib/zoho-sign";
import { espelharDocumentoNoContatoZoho } from "@/lib/zoho-documentos";

const BUCKET_CONTRATOS = "documentos-contratos";

export type ResultadoSign = {
  status: "processado" | "ignorado" | "erro";
  motivo?: string;
  erro?: string;
};

export async function processarEventoSign(
  supabase: SupabaseClient,
  payload: any
): Promise<ResultadoSign> {
  const ev = extrairEventoSign(payload);
  if (!ev) return { status: "ignorado", motivo: "payload sem request_id" };
  if (ev.status === "desconhecido") {
    return { status: "ignorado", motivo: `status nao tratado: ${ev.statusRaw}` };
  }

  try {
    // Localiza o envelope que criamos (contratos_assinatura). Se nao existe,
    // e um request que nao originou daqui — ignora.
    const { data: assinatura } = await supabase
      .from("contratos_assinatura")
      .select("id, contrato_id, status, documento_id")
      .eq("envelope_id_zoho", ev.envelopeId)
      .maybeSingle();

    if (!assinatura) {
      return { status: "ignorado", motivo: "envelope desconhecido" };
    }

    const agora = new Date().toISOString();

    // Nao assinado (recusado/expirado/em_andamento): so reflete o status.
    if (ev.status !== "assinado") {
      await supabase
        .from("contratos_assinatura")
        .update({ status: ev.status, atualizado_em: agora })
        .eq("id", assinatura.id);
      return { status: "processado", motivo: ev.status };
    }

    // Assinado e ja persistido antes: idempotente, nada a refazer.
    if (assinatura.documento_id) {
      await supabase
        .from("contratos_assinatura")
        .update({ status: "assinado", assinado_em: assinatura.status === "assinado" ? undefined : agora, atualizado_em: agora })
        .eq("id", assinatura.id);
      return { status: "processado", motivo: "ja persistido" };
    }

    // Titular do contrato (para vincular o documento e espelhar no CRM).
    const { data: contrato } = await supabase
      .from("contratos")
      .select("titular_id")
      .eq("id", assinatura.contrato_id)
      .maybeSingle();
    if (!contrato?.titular_id) {
      return { status: "erro", erro: "Contrato/titular nao encontrado para o envelope." };
    }

    // Baixa o PDF final (precisa de credenciais Zoho; sem elas, lanca -> erro,
    // e o evento fica reprocessavel).
    const pdf = await baixarPdfAssinado(ev.envelopeId);
    const nomeArquivo = "Contrato de Prestacao de Servicos.pdf";
    const storagePath = `${assinatura.contrato_id}/${ev.envelopeId}-contrato.pdf`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET_CONTRATOS)
      .upload(storagePath, pdf.buffer, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      return { status: "erro", erro: "Falha ao salvar o PDF no Storage: " + upErr.message };
    }

    const { data: documento, error: docErr } = await supabase
      .from("documentos")
      .insert({
        titular_id: contrato.titular_id,
        contrato_id: assinatura.contrato_id,
        tipo_documento: "contrato_prestacao_servicos",
        nome_arquivo: nomeArquivo,
        origem: "sistema",
        storage_path: storagePath,
        mime_type: "application/pdf",
        status: "aprovado",
        criado_por: "zoho-sign",
      })
      .select("id")
      .single();
    if (docErr || !documento) {
      return { status: "erro", erro: "Falha ao registrar o documento do contrato." };
    }

    await supabase
      .from("contratos_assinatura")
      .update({
        status: "assinado",
        assinado_em: agora,
        atualizado_em: agora,
        documento_id: documento.id,
      })
      .eq("id", assinatura.id);

    // Copia no Contato do Zoho CRM (best-effort; Supabase e a fonte).
    await espelharDocumentoNoContatoZoho(
      supabase,
      contrato.titular_id,
      nomeArquivo,
      pdf.buffer,
      "application/pdf"
    );

    return { status: "processado", motivo: "contrato assinado persistido" };
  } catch (err: any) {
    return { status: "erro", erro: err?.message || "Falha ao processar evento do Zoho Sign." };
  }
}
