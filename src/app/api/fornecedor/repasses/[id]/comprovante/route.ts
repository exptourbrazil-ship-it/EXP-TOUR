import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { comprovanteDoFornecedor } from "@/lib/extrato-fornecedor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Download do COMPROVANTE de uma remessa (supplier_payout) pela escola. So
// entrega se o payout for deste fornecedor (posse pelo supplier_id da sessao).
// Qualquer falha -> 404 (nao revela nada). Comprovante fica no bucket privado
// documentos-fornecedor; entregue por URL assinada de curta duracao.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const comprovante = await comprovanteDoFornecedor(supabase, sessao.supplierId, id);
  if (!comprovante) {
    return NextResponse.json({ error: "Comprovante nao encontrado" }, { status: 404 });
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from("documentos-fornecedor")
    .createSignedUrl(comprovante.path, 60, { download: comprovante.filename || true });
  if (signedError || !signed) {
    return NextResponse.json({ error: "Falha ao gerar link do comprovante" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
