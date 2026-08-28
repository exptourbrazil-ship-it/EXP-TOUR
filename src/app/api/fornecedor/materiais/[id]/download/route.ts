import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { materialParaDownload } from "@/lib/material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Download de um material por ARQUIVO (bucket privado documentos-fornecedor).
// Só entrega se o material for deste fornecedor (posse pelo supplier_id da
// sessão). Qualquer falha -> 404. URL assinada de curta duração.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

  const material = await materialParaDownload(supabase, sessao.supplierId, id);
  if (!material) return NextResponse.json({ error: "Material nao encontrado" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("documentos-fornecedor")
    .createSignedUrl(material.storagePath, 60, { download: material.nomeArquivo || true });
  if (error || !signed) return NextResponse.json({ error: "Falha ao gerar link do material" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
