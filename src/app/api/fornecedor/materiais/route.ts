import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao, TAMANHO_MAXIMO_BYTES } from "@/lib/upload-seguro";
import { normalizarEntradaMaterial } from "@/lib/material-helpers";
import { criarMaterial, atualizarMaterial, arquivarMaterial } from "@/lib/material-service";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documentos-fornecedor";
const JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const MAX_UPLOAD = Number(process.env.RATE_LIMIT_FORNECEDOR_MATERIAL || "30");

// Materiais do fornecedor (doc 06 §3.3). Posse sempre pelo supplier_id da sessão.
//  multipart = upload de ARQUIVO (PDF/imagem) + metadados -> cria material.
//  JSON acao 'criar_link' -> cria material por LINK (vídeo etc.).
//  JSON acao 'salvar'     -> atualiza metadados.
//  JSON acao 'arquivar'   -> arquiva (soft delete).
export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Nao autenticado" }, { status: 401 });

  const supabase = getServiceClient();
  const contentType = request.headers.get("content-type") || "";

  // ── JSON: criar por link / salvar / arquivar ──────────────────────────────
  if (!contentType.includes("multipart/form-data")) {
    // Rate-limit tambem nos caminhos de escrita JSON (nao so no upload), contra
    // criacao/edicao em laco.
    if (!(await checarELimitar(supabase, `fornecedor-material:${sessao.supplierUserId}`, MAX_UPLOAD, JANELA_SEG))) {
      return NextResponse.json({ ok: false, erro: "Muitas operações em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
    }
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const acao = String(body?.acao || "");

    if (acao === "arquivar") {
      const id = String(body?.id || "");
      if (!id) return NextResponse.json({ ok: false, erro: "Material ausente." }, { status: 400 });
      const r = await arquivarMaterial(supabase, sessao.supplierId, id);
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }

    if (acao === "salvar") {
      const id = String(body?.id || "");
      if (!id) return NextResponse.json({ ok: false, erro: "Material ausente." }, { status: 400 });
      const norm = normalizarEntradaMaterial(body, { exigirLink: false });
      if (!norm.ok) return NextResponse.json({ ok: false, erro: norm.erro }, { status: 400 });
      const r = await atualizarMaterial(supabase, sessao.supplierId, id, norm.dados);
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }

    if (acao === "criar_link") {
      const norm = normalizarEntradaMaterial(body, { exigirLink: true });
      if (!norm.ok) return NextResponse.json({ ok: false, erro: norm.erro }, { status: 400 });
      const r = await criarMaterial(supabase, { supplierId: sessao.supplierId, createdBy: sessao.email, entrada: norm.dados });
      return r.ok ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 500 });
    }

    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  }

  // ── Multipart: upload de arquivo ──────────────────────────────────────────
  if (!(await checarELimitar(supabase, `fornecedor-material:${sessao.supplierUserId}`, MAX_UPLOAD, JANELA_SEG))) {
    return NextResponse.json({ ok: false, erro: "Muitos envios em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const formData = await request.formData();
  const norm = normalizarEntradaMaterial(Object.fromEntries(formData.entries()), { exigirLink: false });
  if (!norm.ok) return NextResponse.json({ ok: false, erro: norm.erro }, { status: 400 });

  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo) return NextResponse.json({ ok: false, erro: "Envie o arquivo do material." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    const mb = Math.floor(TAMANHO_MAXIMO_BYTES / (1024 * 1024));
    return NextResponse.json({ ok: false, erro: `Arquivo acima do limite de ${mb} MB.` }, { status: 400 });
  }
  const buffer = await arquivo.arrayBuffer();
  const validacao = validarArquivo(arquivo.size, buffer);
  if (!validacao.ok) return NextResponse.json({ ok: false, erro: validacao.erro }, { status: 400 });

  const caminho = montarChaveStorage(`materiais/${sessao.supplierId}`, validacao.extensao);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: validacao.mime });
  if (upErr) {
    console.error("[fornecedor/materiais] falha no Storage:", upErr.message);
    return NextResponse.json({ ok: false, erro: "Falha ao enviar o arquivo." }, { status: 500 });
  }

  // try/catch: remove o arquivo orfao tanto no erro de negocio quanto num throw
  // inesperado (rede/driver) entre o upload e o insert.
  try {
    const r = await criarMaterial(supabase, {
      supplierId: sessao.supplierId,
      createdBy: sessao.email,
      entrada: norm.dados,
      arquivo: { storagePath: caminho, nomeArquivo: sanitizarNomeExibicao(arquivo.name), mime: validacao.mime },
    });
    if (!r.ok) {
      await supabase.storage.from(BUCKET).remove([caminho]).catch(() => {});
      return NextResponse.json({ ok: false, erro: r.erro }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: r.id });
  } catch {
    await supabase.storage.from(BUCKET).remove([caminho]).catch(() => {});
    return NextResponse.json({ ok: false, erro: "Falha ao salvar o material." }, { status: 500 });
  }
}
