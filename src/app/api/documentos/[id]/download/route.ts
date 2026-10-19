import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { getZohoAttachmentContent } from "@/lib/zoho";
import { fornecedorDocVisivelAoCliente } from "@/lib/documentos";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessaoToken = cookieStore.get(SESSION_COOKIE)?.value;
  const sessao = verificarSessao(sessaoToken);
  if (!sessao) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  const titularId = sessao.titularId;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: documento, error } = await supabase.from("documentos").select("*").eq("id", id).single();
  if (error || !documento || documento.titular_id !== titularId) {
    return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
  }
  if (documento.origem === "admin" || documento.origem === "titular") {
    const bucket = documento.origem === "admin" ? "documentos-admin" : "documentos-titular";
    const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(documento.storage_path, 60, { download: documento.nome_arquivo || true });
    if (signedError || !signed) {
      return NextResponse.json({ error: "Falha ao gerar link do documento" }, { status: 500 });
    }
    return NextResponse.redirect(signed.signedUrl);
  }
  // Documento enviado pela ESCOLA (origem 'fornecedor', ex.: certificado de
  // conclusao e relatorio academico): so fica visivel ao CLIENTE depois que o
  // admin APROVA (status 'aprovado') E apenas para os tipos destinados ao
  // cliente (allowlist). A escola tambem envia faturas (invoice/recibo) com
  // origem 'fornecedor' que NUNCA podem chegar ao cliente, mesmo aprovadas —
  // 'aprovado' aqui e o status generico de validacao interna, nao "liberar ao
  // cliente". Enquanto 'recebido'/'rejeitado', ou tipo fora da allowlist, 404 —
  // nao revela sequer que o documento existe.
  if (documento.origem === "fornecedor") {
    if (documento.status !== "aprovado" || !fornecedorDocVisivelAoCliente(documento.tipo_documento)) {
      return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
    }
    const { data: signed, error: signedError } = await supabase.storage
      .from("documentos-fornecedor")
      .createSignedUrl(documento.storage_path, 60, { download: documento.nome_arquivo || true });
    if (signedError || !signed) {
      return NextResponse.json({ error: "Falha ao gerar link do documento" }, { status: 500 });
    }
    return NextResponse.redirect(signed.signedUrl);
  }
  try {
    const conteudo = await getZohoAttachmentContent(documento.zoho_module, documento.zoho_record_id, documento.zoho_attachment_id);
    return new NextResponse(conteudo.buffer, { headers: { "Content-Type": conteudo.contentType || "application/octet-stream", "Content-Disposition": `inline; filename="${documento.nome_arquivo}"` } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Falha ao buscar documento no Zoho" }, { status: 502 });
  }
}
