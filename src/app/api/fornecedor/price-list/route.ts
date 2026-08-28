import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { garantirCampusDoFornecedor } from "@/lib/catalog-disponibilidade";
import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao } from "@/lib/upload-seguro";
import { extrairPriceListPdf, normalizarPriceListExtraido } from "@/lib/price-list-extract";
import { criarSubmission, atualizarExtracted, aprovarPelaEscola } from "@/lib/price-submission-service";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documentos-fornecedor";
// Teto de envios de price list por usuario (a extracao chama a IA — custo).
const JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const MAX_UPLOAD = Number(process.env.RATE_LIMIT_FORNECEDOR_PRICELIST || "10");

// Envio e edicao de price list pela escola. Multipart = upload do PDF (extrai por
// IA e cria o rascunho); JSON = salvar edicao do rascunho / aprovar-e-enviar.
// Posse sempre pelo supplier_id da sessao.
export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Nao autenticado" }, { status: 401 });

  const supabase = getServiceClient();
  const contentType = request.headers.get("content-type") || "";

  // ── Edicao / aprovacao (JSON) ─────────────────────────────────────────────
  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const acao = String(body?.acao || "");
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ ok: false, erro: "Price list ausente." }, { status: 400 });

    if (acao === "salvar") {
      const r = await atualizarExtracted(supabase, sessao.supplierId, id, body?.extracted);
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }
    if (acao === "aprovar") {
      const r = await aprovarPelaEscola(supabase, sessao.supplierId, id, sessao.email);
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }
    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  }

  // ── Upload do PDF (multipart) ─────────────────────────────────────────────
  if (!(await checarELimitar(supabase, `fornecedor-pricelist:${sessao.supplierUserId}`, MAX_UPLOAD, JANELA_SEG))) {
    return NextResponse.json({ ok: false, erro: "Muitos envios em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const formData = await request.formData();
  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo) return NextResponse.json({ ok: false, erro: "Envie o arquivo do price list (PDF)." }, { status: 400 });

  const buffer = await arquivo.arrayBuffer();
  const validacao = validarArquivo(arquivo.size, buffer);
  if (!validacao.ok) return NextResponse.json({ ok: false, erro: validacao.erro }, { status: 400 });
  if (validacao.mime !== "application/pdf") {
    return NextResponse.json({ ok: false, erro: "O price list deve ser um PDF." }, { status: 400 });
  }

  let tenantId: string;
  let campusId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
    campusId = await garantirCampusDoFornecedor(supabase, sessao.supplierId, tenantId);
  } catch (err) {
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : "Falha ao preparar o catálogo." },
      { status: 500 }
    );
  }

  const caminho = montarChaveStorage(`pricelist/${sessao.supplierId}`, validacao.extensao);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: validacao.mime });
  if (upErr) {
    console.error("[fornecedor/price-list] falha no Storage:", upErr.message);
    return NextResponse.json({ ok: false, erro: "Falha ao enviar o arquivo." }, { status: 500 });
  }

  // Extracao por IA (falha-fechada: sem chave -> rascunho vazio, escola preenche).
  const base64 = Buffer.from(buffer).toString("base64");
  const extracao = await extrairPriceListPdf(base64);
  const extracted = extracao.ok ? extracao.dados : normalizarPriceListExtraido({});
  const extractStatus = extracao.ok ? "ok" : extracao.status;

  const r = await criarSubmission(supabase, {
    tenantId,
    supplierId: sessao.supplierId,
    campusId,
    sourceStoragePath: caminho,
    sourceFilename: sanitizarNomeExibicao(arquivo.name),
    extracted,
    extractStatus,
    createdBy: sessao.email,
  });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 500 });

  return NextResponse.json({ ok: true, id: r.id, extractStatus, itens: extracted.programs.length + extracted.accommodations.length + extracted.fees.length });
}
