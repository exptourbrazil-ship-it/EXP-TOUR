import { NextResponse } from "next/server";
import { contextoAdminFatura, ehUuid } from "@/lib/admin-contas-a-receber-api";
import { obterFatura, registrarRecebimento } from "@/lib/comissao-fatura-service";
import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao, TAMANHO_MAXIMO_BYTES } from "@/lib/upload-seguro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documentos-fornecedor";

// Registra um recebimento (total ou parcial) da comissao, com comprovante opcional.
// Rota MONEY-TOUCHING: sessao admin com financeiro.gerir, sem bearer. A mudanca de
// estado e feita pela RPC atomica registrar_recebimento_comissao.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await contextoAdminFatura(request, "financeiro.gerir");
  if (!c.ok) return c.res;
  const { supabase, tenantId, adminUser, ip } = c.ctx;
  const { id } = await params;
  if (!ehUuid(id)) return NextResponse.json({ ok: false, erro: "Fatura inválida." }, { status: 400 });

  const fatura = await obterFatura(supabase, tenantId, id);
  if (!fatura) return NextResponse.json({ ok: false, erro: "Fatura não encontrada." }, { status: 404 });

  const form = await request.formData();

  let proofStoragePath: string | null = null;
  let proofFilename: string | null = null;
  const arquivo = form.get("comprovante") as File | null;
  if (arquivo && typeof arquivo === "object" && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      return NextResponse.json({ ok: false, erro: `Comprovante acima do limite de ${Math.floor(TAMANHO_MAXIMO_BYTES / (1024 * 1024))} MB.` }, { status: 400 });
    }
    const buffer = await arquivo.arrayBuffer();
    const val = validarArquivo(arquivo.size, buffer);
    if (!val.ok) return NextResponse.json({ ok: false, erro: val.erro }, { status: 400 });
    const caminho = montarChaveStorage(`recebimento-comissao/${tenantId}`, val.extensao);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: val.mime });
    if (upErr) {
      console.error("[admin/contas-a-receber] falha no Storage:", upErr.message);
      return NextResponse.json({ ok: false, erro: "Falha ao enviar o comprovante." }, { status: 500 });
    }
    proofStoragePath = caminho;
    proofFilename = sanitizarNomeExibicao(arquivo.name);
  }

  const r = await registrarRecebimento(supabase, {
    tenantId,
    adminUser,
    ip,
    faturaId: id,
    amount: form.get("amount"),
    receivedAt: form.get("receivedAt"),
    reference: form.get("reference") ? String(form.get("reference")) : null,
    notes: form.get("notes") ? String(form.get("notes")) : null,
    proofStoragePath,
    proofFilename,
  });
  if (!r.ok) {
    if (proofStoragePath) await supabase.storage.from(BUCKET).remove([proofStoragePath]).catch(() => {});
    return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }
  return NextResponse.json({ ok: true, status: r.status, recebidoTotal: r.recebidoTotal });
}
