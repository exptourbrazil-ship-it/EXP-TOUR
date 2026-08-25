import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getZohoAttachmentContent } from "@/lib/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mapa de origem -> bucket privado do Storage (mesmos do download do admin).
const BUCKET_POR_ORIGEM: Record<string, string> = {
  titular: "documentos-titular",
  admin: "documentos-admin",
  sistema: "documentos-contratos",
};

// Download de um documento pela ESCOLA (Portal do Parceiro). So entrega o que o
// admin compartilhou (compartilhado_fornecedor) E que pertence a um contrato
// desta escola (isolamento). Qualquer falha de posse -> 404 (nao revela nada).
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: documento } = await supabase.from("documentos").select("*").eq("id", id).maybeSingle();
  // Precisa existir, estar compartilhado, nao-rejeitado e vinculado a um contrato.
  if (
    !documento ||
    !documento.compartilhado_fornecedor ||
    documento.status === "rejeitado" ||
    !documento.contrato_id
  ) {
    return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
  }

  // POSSE: o contrato do documento tem que ser desta escola.
  const { data: contrato } = await supabase
    .from("contratos")
    .select("supplier_id")
    .eq("id", documento.contrato_id)
    .maybeSingle();
  if (!contrato || (contrato as { supplier_id?: string }).supplier_id !== sessao.supplierId) {
    return NextResponse.json({ error: "Documento nao encontrado" }, { status: 404 });
  }

  const bucket = BUCKET_POR_ORIGEM[documento.origem as string];
  if (bucket && documento.storage_path) {
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(documento.storage_path, 60, { download: documento.nome_arquivo || true });
    if (signedError || !signed) {
      return NextResponse.json({ error: "Falha ao gerar link do documento" }, { status: 500 });
    }
    return NextResponse.redirect(signed.signedUrl);
  }

  // Demais origens: anexo no Zoho CRM.
  try {
    const conteudo = await getZohoAttachmentContent(
      documento.zoho_module,
      documento.zoho_record_id,
      documento.zoho_attachment_id
    );
    return new NextResponse(conteudo.buffer, {
      headers: {
        "Content-Type": conteudo.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${documento.nome_arquivo}"`,
      },
    });
  } catch (err) {
    console.error("[fornecedor/documentos/download] falha ao buscar no Zoho:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ error: "Falha ao buscar documento" }, { status: 502 });
  }
}
