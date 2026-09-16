import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid } from "@/lib/catalog-route";
import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao, TAMANHO_MAXIMO_BYTES } from "@/lib/upload-seguro";
import { normalizarEntradaMaterial } from "@/lib/material-helpers";
import {
  criarMaterialAdmin,
  aprovarMaterialAdmin,
  rejeitarMaterialAdmin,
  arquivarMaterialAdmin,
} from "@/lib/material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documentos-fornecedor";

// Materiais de um fornecedor pelo ADMIN (hub, aba Material — F2).
//  multipart              -> upload de ARQUIVO + metadados -> cria material APROVADO.
//  JSON acao 'criar_link' -> cria material por LINK, APROVADO.
//  JSON acao 'aprovar'    -> publica um material PENDENTE (do fornecedor).
//  JSON acao 'rejeitar'   -> recusa um PENDENTE com motivo (o fornecedor lê no portal).
//  JSON acao 'arquivar'   -> arquiva (soft delete).
// Autorizacao por SESSAO com 'fornecedores.gerir' (falha fechada). Posse: o
// fornecedor da URL tem que ser do tenant (servico); materiais escopados por tenant.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id: supplierId } = await params;
  if (!isUuid(supplierId)) return bad("Fornecedor inválido.");

  const supabase = getSupabase();
  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch {
    return NextResponse.json({ ok: false, error: { code: "tenant", message: "Falha ao resolver o tenant." } }, { status: 500 });
  }

  // POSSE antes de QUALQUER escrita (inclusive o upload ao Storage): o fornecedor
  // da URL tem que ser do tenant vigente — senao um supplierId de outro tenant ou
  // inexistente deixaria arquivo orfao no bucket (achado M2 da revisao). O
  // servico repete a checagem (defesa em profundidade).
  const { data: sup } = await supabase
    .from("supplier")
    .select("id")
    .eq("id", supplierId)
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .maybeSingle();
  if (!sup) return bad("Fornecedor não encontrado neste tenant.", "supplier_invalido", 404);

  const contentType = request.headers.get("content-type") || "";

  // ── JSON: aprovar / rejeitar / arquivar / criar por link ─────────────────
  if (!contentType.includes("multipart/form-data")) {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const acao = String(body?.acao || "");

    if (acao === "aprovar" || acao === "rejeitar" || acao === "arquivar") {
      const id = String(body?.id || "");
      if (!isUuid(id)) return bad("Material inválido.");
      // Versao vista pelo admin (updated_at da tela): guarda otimista no servico.
      // Ausente = sem guarda (compat); string = tem que bater; outro tipo = IS NULL.
      const vistoEm: string | null | undefined =
        body?.vistoEm === undefined ? undefined : typeof body.vistoEm === "string" ? body.vistoEm : null;
      if (acao === "aprovar") {
        const r = await aprovarMaterialAdmin(supabase, tenantId, id, g.usuario, g.ip, vistoEm);
        return r.ok ? okData({ id }) : bad(r.erro, "aprovar", 409);
      }
      if (acao === "rejeitar") {
        const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 1000) : "";
        if (!motivo) return bad("Informe o motivo da recusa (o fornecedor vai lê-lo).", "motivo_obrigatorio", 400);
        const r = await rejeitarMaterialAdmin(supabase, tenantId, id, g.usuario, motivo, g.ip, vistoEm);
        return r.ok ? okData({ id }) : bad(r.erro, "rejeitar", 409);
      }
      const r = await arquivarMaterialAdmin(supabase, tenantId, id, g.usuario, g.ip);
      return r.ok ? okData({ id }) : bad(r.erro, "arquivar", 400);
    }

    if (acao === "criar_link") {
      const norm = normalizarEntradaMaterial(body, { exigirLink: true });
      if (!norm.ok) return bad(norm.erro);
      const r = await criarMaterialAdmin(supabase, { tenantId, supplierId, actor: g.usuario, ip: g.ip, entrada: norm.dados });
      return r.ok ? okData({ id: r.id }) : bad(r.erro, "criar", 400);
    }

    return bad("Ação inválida.");
  }

  // ── Multipart: upload de arquivo pelo admin ──────────────────────────────
  const formData = await request.formData();
  const norm = normalizarEntradaMaterial(Object.fromEntries(formData.entries()), { exigirLink: false });
  if (!norm.ok) return bad(norm.erro);

  const arquivo = formData.get("arquivo") as File | null;
  if (!arquivo) return bad("Envie o arquivo do material.");
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    const mb = Math.floor(TAMANHO_MAXIMO_BYTES / (1024 * 1024));
    return bad(`Arquivo acima do limite de ${mb} MB.`);
  }
  const buffer = await arquivo.arrayBuffer();
  const validacao = validarArquivo(arquivo.size, buffer);
  if (!validacao.ok) return bad(validacao.erro);

  // Mesmo prefixo do portal (materiais/<supplierId>/...) — um so lugar por fornecedor.
  const caminho = montarChaveStorage(`materiais/${supplierId}`, validacao.extensao);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: validacao.mime });
  if (upErr) {
    console.error("[admin/materiais] falha no Storage:", upErr.message);
    return NextResponse.json({ ok: false, error: { code: "storage", message: "Falha ao enviar o arquivo." } }, { status: 500 });
  }

  // Remove o arquivo orfao se o insert falhar (erro de negocio ou throw).
  try {
    const r = await criarMaterialAdmin(supabase, {
      tenantId,
      supplierId,
      actor: g.usuario,
      ip: g.ip,
      entrada: norm.dados,
      arquivo: { storagePath: caminho, nomeArquivo: sanitizarNomeExibicao(arquivo.name), mime: validacao.mime },
    });
    if (!r.ok) {
      await supabase.storage.from(BUCKET).remove([caminho]).catch(() => {});
      return bad(r.erro, "criar", 400);
    }
    return okData({ id: r.id });
  } catch {
    await supabase.storage.from(BUCKET).remove([caminho]).catch(() => {});
    return NextResponse.json({ ok: false, error: { code: "erro_interno", message: "Falha ao salvar o material." } }, { status: 500 });
  }
}
