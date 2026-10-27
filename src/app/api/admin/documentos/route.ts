import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { barrarTitularForaDoEscopo } from "@/lib/admin-tenant";
import { espelharDocumentoNoContatoZoho } from "@/lib/zoho-documentos";
import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao } from "@/lib/upload-seguro";
import { ehTipoDocumentoValido } from "@/lib/documentos";

export const runtime = "nodejs";

// Envio de documento pelo admin, em nome do titular (CPF). O tipo e validado
// contra a MESMA taxonomia que a tela mostra (src/lib/documentos.ts): antes
// havia uma lista fixa de 11 tipos aqui, e a tela oferecia ~30, entao tipos como
// Passaporte ou Documento de Identidade voltavam "tipoDocumento invalido".
export async function POST(request: Request) {
  if (!(await checarCapacidadeAdmin("documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

  const formData = await request.formData();
  const cpf = String(formData.get("cpf") || "").replace(/\D/g, "");
  const tipoDocumento = String(formData.get("tipoDocumento") || "");
  const arquivo = formData.get("arquivo") as File | null;

  if (!cpf) {
    return NextResponse.json({ ok: false, error: "Informe o CPF do titular." }, { status: 400 });
  }
  if (!ehTipoDocumentoValido(tipoDocumento)) {
    return NextResponse.json({ ok: false, error: "Tipo de documento invalido." }, { status: 400 });
  }
  if (!arquivo) {
    return NextResponse.json({ ok: false, error: "Selecione o arquivo." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const { data: titular, error: titularError } = await supabase.from("titulares").select("id").eq("cpf", cpf).single();
  if (titularError || !titular) {
    return NextResponse.json({ ok: false, error: "Titular nao encontrado para este CPF" }, { status: 404 });
  }
  const barrado = await barrarTitularForaDoEscopo(supabase, titular.id);
  if (barrado) return barrado;

  const buffer = await arquivo.arrayBuffer();
  const validacao = validarArquivo(arquivo.size, buffer);
  if (!validacao.ok) {
    return NextResponse.json({ ok: false, error: validacao.erro }, { status: 400 });
  }

  const nomeArquivo = sanitizarNomeExibicao(arquivo.name);
  const caminho = montarChaveStorage(titular.id, validacao.extensao);
  const { error: uploadError } = await supabase.storage.from("documentos-admin").upload(caminho, buffer, { contentType: validacao.mime });
  if (uploadError) {
    console.error("[documentos] upload admin no storage:", uploadError.message);
    return NextResponse.json({ ok: false, error: "Falha ao enviar arquivo" }, { status: 500 });
  }

  // Autor real (sessao), nao um e-mail fixo.
  const usuario = (await usuarioAdminAtual()) ?? "sessao-expirada";

  const { error: insertError } = await supabase.from("documentos").insert({
    titular_id: titular.id,
    tipo_documento: tipoDocumento,
    nome_arquivo: nomeArquivo,
    origem: "admin",
    storage_path: caminho,
    mime_type: validacao.mime,
    tamanho_bytes: arquivo.size,
    criado_por: usuario,
  });
  if (insertError) {
    console.error("[documentos] registro do documento admin:", insertError.message);
    return NextResponse.json({ ok: false, error: "Falha ao salvar registro do documento" }, { status: 500 });
  }

  // Copia no Contato do Zoho CRM (best-effort). O resultado volta para a tela:
  // antes uma falha so ia para o log do servidor e ninguem ficava sabendo.
  const zoho = await espelharDocumentoNoContatoZoho(supabase, titular.id, nomeArquivo, buffer, validacao.mime);

  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "documento.upload",
    alvo: cpf,
    detalhe: { tipoDocumento, nomeArquivo, titularId: titular.id, zohoEspelhado: zoho.espelhado, zohoMotivo: zoho.motivo ?? null },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true, zoho });
}
