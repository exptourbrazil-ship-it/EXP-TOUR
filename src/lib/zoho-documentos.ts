// NB: modulo server-only. Espelha documentos do Supabase (fonte de verdade)
// como ANEXOS no Contato correspondente do Zoho CRM. Sincronizacao
// unidirecional Supabase -> Zoho: o CRM guarda uma copia comercial, nunca a
// verdade. Usado no upload do cliente, no upload do admin e (futuramente) no
// contrato assinado do Zoho Sign — sempre pelo mesmo caminho.
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadZohoAttachment } from "@/lib/zoho";

// Sobe uma copia do documento no Contato do Zoho do titular, se ele tiver um
// zoho_contact_id vinculado. Best-effort: qualquer falha (credenciais
// ausentes, contato sem vinculo, erro de rede) e apenas logada — nunca
// derruba a operacao principal, ja que o Supabase e a fonte de verdade.
export async function espelharDocumentoNoContatoZoho(
  supabase: SupabaseClient,
  titularId: string,
  nomeArquivo: string,
  buffer: ArrayBuffer,
  mimeType?: string | null
): Promise<{ espelhado: boolean; motivo?: string }> {
  try {
    const { data: titular } = await supabase
      .from("titulares")
      .select("zoho_contact_id")
      .eq("id", titularId)
      .single();

    if (!titular?.zoho_contact_id) {
      return { espelhado: false, motivo: "titular sem zoho_contact_id" };
    }

    await uploadZohoAttachment(
      "Contacts",
      titular.zoho_contact_id,
      nomeArquivo,
      buffer,
      mimeType || undefined
    );
    return { espelhado: true };
  } catch (err: any) {
    console.error("Falha ao espelhar documento no Contato do Zoho CRM:", err);
    return { espelhado: false, motivo: err?.message || "erro desconhecido" };
  }
}
