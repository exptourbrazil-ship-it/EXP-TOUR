import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { TIPOS_DOCUMENTO } from "@/lib/documentos";
import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao } from "@/lib/upload-seguro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET_FORNECEDOR = "documentos-fornecedor";

// Upload de um documento PELA ESCOLA (Portal do Parceiro) para um estudante seu.
// Posse: o contrato tem que pertencer ao fornecedor da sessao. O arquivo e
// validado pelo conteudo real (magic bytes) e a chave do Storage nao usa nenhum
// byte vindo do cliente (ver upload-seguro.ts). O registro entra com origem
// 'fornecedor' e status 'recebido' -- fica visivel a escola e ao admin, sem
// entrar na fila de documentos pendentes do titular.
export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const formData = await request.formData();
  const contratoId = String(formData.get("contratoId") || "");
  const tipoDocumento = String(formData.get("tipoDocumento") || "");
  const arquivo = formData.get("arquivo") as File | null;

  if (!contratoId) {
    return NextResponse.json({ error: "Informe o estudante (contrato)." }, { status: 400 });
  }
  if (!TIPOS_DOCUMENTO.some((t) => t.valor === tipoDocumento) || !arquivo) {
    return NextResponse.json({ error: "Informe um tipo de documento válido e o arquivo." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // POSSE: o contrato tem que ser desta escola. 404 se nao for (nao revela nada).
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, supplier_id")
    .eq("id", contratoId)
    .maybeSingle();
  if (!contrato || (contrato as { supplier_id?: string }).supplier_id !== sessao.supplierId) {
    return NextResponse.json({ error: "Estudante nao encontrado" }, { status: 404 });
  }

  const buffer = await arquivo.arrayBuffer();
  const validacao = validarArquivo(arquivo.size, buffer);
  if (!validacao.ok) {
    return NextResponse.json({ error: validacao.erro }, { status: 400 });
  }

  const nomeArquivo = sanitizarNomeExibicao(arquivo.name);
  const caminho = montarChaveStorage(contratoId, validacao.extensao);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_FORNECEDOR)
    .upload(caminho, buffer, { contentType: validacao.mime });
  if (uploadError) {
    console.error("[fornecedor/documentos/upload] falha no Storage:", uploadError.message);
    return NextResponse.json({ error: "Falha ao enviar o arquivo." }, { status: 500 });
  }

  const { data: documento, error: insertError } = await supabase
    .from("documentos")
    .insert({
      titular_id: (contrato as { titular_id: string }).titular_id,
      contrato_id: contratoId,
      tipo_documento: tipoDocumento,
      nome_arquivo: nomeArquivo,
      origem: "fornecedor",
      storage_path: caminho,
      mime_type: validacao.mime,
      tamanho_bytes: arquivo.size,
      status: "recebido",
      enviado_por_supplier_user: sessao.supplierUserId,
    })
    .select("id, tipo_documento, nome_arquivo, status, created_at")
    .single();

  if (insertError || !documento) {
    console.error("[fornecedor/documentos/upload] insert falhou:", insertError?.message);
    return NextResponse.json({ error: "Falha ao registrar o documento." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, documento });
}
