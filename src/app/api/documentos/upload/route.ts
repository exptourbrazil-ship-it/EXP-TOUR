import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { TIPOS_DOCUMENTO } from "@/lib/documentos";
import { uploadZohoAttachment } from "@/lib/zoho";

// Recebe um documento enviado pelo proprio titular na area do cliente,
// salva no Supabase Storage (bucket documentos-titular), registra na
// tabela documentos com status "pendente" e envia uma copia de backup
// para o Zoho CRM (Contacts/Attachments), quando o titular tiver um
// zoho_contact_id vinculado.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessaoToken = cookieStore.get(SESSION_COOKIE)?.value;
  const sessao = verificarSessao(sessaoToken);

if (!sessao) {
  return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
}

const titularId = sessao.titularId;

const formData = await request.formData();
  const tipoDocumento = String(formData.get("tipoDocumento") || "");
  const arquivo = formData.get("arquivo") as File | null;

if (!TIPOS_DOCUMENTO.some((t) => t.valor === tipoDocumento) || !arquivo) {
  return NextResponse.json({ error: "Informe tipoDocumento valido e arquivo" }, { status: 400 });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

const nomeArquivo = arquivo.name;
  const caminho = `${titularId}/${Date.now()}-${nomeArquivo}`;
  const buffer = await arquivo.arrayBuffer();

const { error: uploadError } = await supabase.storage.from("documentos-titular").upload(caminho, buffer, { contentType: arquivo.type || "application/octet-stream" });
  if (uploadError) {
    return NextResponse.json({ error: "Falha ao enviar arquivo" }, { status: 500 });
  }

const { data: documento, error: insertError } = await supabase
  .from("documentos")
  .insert({
    titular_id: titularId,
    tipo_documento: tipoDocumento,
    nome_arquivo: nomeArquivo,
    origem: "titular",
    storage_path: caminho,
    mime_type: arquivo.type || null,
    tamanho_bytes: arquivo.size,
    criado_por: titularId,
    status: "pendente",
  })
  .select()
  .single();

if (insertError) {
  return NextResponse.json({ error: "Falha ao salvar registro do documento" }, { status: 500 });
}

try {
  const { data: titular } = await supabase.from("titulares").select("zoho_contact_id").eq("id", titularId).single();
  if (titular?.zoho_contact_id) {
    await uploadZohoAttachment("Contacts", titular.zoho_contact_id, nomeArquivo, buffer, arquivo.type || undefined);
  }
} catch (err) {
  console.error("Falha ao enviar backup do documento para o Zoho CRM:", err);
}

return NextResponse.json({ ok: true, documento });
}
