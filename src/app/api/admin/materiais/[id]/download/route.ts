import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { materialAdminParaDownload } from "@/lib/material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Download de material pelo ADMIN (biblioteca de materiais). Capacidade casos.ver
// (igual à página, não só "qualquer sessão"); posse por tenant. URL assinada.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("casos.ver"))) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const tenantId = await tenantIdAtual(supabase);

  const alvo = await materialAdminParaDownload(supabase, tenantId, id);
  if (!alvo) return NextResponse.json({ error: "Material nao encontrado" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("documentos-fornecedor")
    .createSignedUrl(alvo.storagePath, 60, { download: alvo.nomeArquivo || true });
  if (error || !signed) return NextResponse.json({ error: "Falha ao gerar link do material" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
