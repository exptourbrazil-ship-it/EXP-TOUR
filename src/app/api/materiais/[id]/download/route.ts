import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { materialClienteParaDownload } from "@/lib/material-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Download de um material pela ÁREA DO CLIENTE. Só materiais 'cliente', ativos e
// não vencidos, de uma escola com quem o cliente tem contrato. Qualquer falha de
// posse -> 404. URL assinada de curta duração.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const { id } = await ctx.params;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

  // Escolas com quem o cliente tem contrato (não cancelado).
  const { data: contratos } = await supabase
    .from("contratos")
    .select("supplier_id")
    .eq("titular_id", sessao.titularId)
    .is("cancelado_em", null)
    .not("supplier_id", "is", null);
  const supplierIds = [...new Set((contratos ?? []).map((c) => (c as { supplier_id: string }).supplier_id))];
  if (supplierIds.length === 0) return NextResponse.json({ error: "Material nao encontrado" }, { status: 404 });

  const hoje = new Date().toISOString().slice(0, 10);
  let alvo: { storagePath: string; nomeArquivo: string | null } | null = null;
  for (const sid of supplierIds) {
    alvo = await materialClienteParaDownload(supabase, sid, id, hoje);
    if (alvo) break;
  }
  if (!alvo) return NextResponse.json({ error: "Material nao encontrado" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("documentos-fornecedor")
    .createSignedUrl(alvo.storagePath, 60, { download: alvo.nomeArquivo || true });
  if (error || !signed) return NextResponse.json({ error: "Falha ao gerar link do material" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
