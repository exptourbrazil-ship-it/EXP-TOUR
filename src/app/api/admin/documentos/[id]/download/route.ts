import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { usuarioAdminAtual } from "@/lib/admin-guard";
import { checarCapacidadeRequest } from "@/lib/admin-guard";
import { getZohoAttachmentContent } from "@/lib/zoho";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Download/visualizacao de um documento pelo ADMIN (fecha o gap: a versao do
// cliente exige que o documento seja do proprio titular; aqui o admin pode ver
// qualquer documento). Resolve os dois casos: arquivo no Storage do Supabase
// (origem 'titular'/'admin'/'sistema' -> URL assinada de 60s) ou anexo no Zoho
// CRM (demais origens -> stream do conteudo). Autenticacao: sessao de admin (ou
// Bearer de compatibilidade).
//
// Mapa de origem -> bucket do Storage. 'sistema' cobre os contratos assinados
// gerados pelo Zoho Sign (ver docs/plano-zoho-sign.md).
const BUCKET_POR_ORIGEM: Record<string, string> = {
  titular: "documentos-titular",
  admin: "documentos-admin",
  sistema: "documentos-contratos",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeRequest(request, "documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: documento, error } = await supabase.from("documentos").select("*").eq("id", id).single();
  if (error || !documento) {
    return NextResponse.json({ ok: false, error: "Documento nao encontrado" }, { status: 404 });
  }

  // Auditoria de leitura de PII. Esta rota entrega documento de identidade de
  // QUALQUER titular — o cofre guarda passaporte, CPF e comprovantes. Ate aqui
  // a leitura nao deixava rastro nenhum: nao havia como saber, depois, quem
  // abriu o documento de quem. Para um cofre de documentos, isso e a lacuna
  // mais seria de registro.
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "bearer-secret",
    acao: "documento.ler",
    alvo: id,
    detalhe: {
      titular_id: documento.titular_id,
      tipo_documento: documento.tipo_documento,
      origem: documento.origem,
    },
    ip: obterIp(request),
  });

  const bucket = BUCKET_POR_ORIGEM[documento.origem as string];
  if (bucket && documento.storage_path) {
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(documento.storage_path, 60, { download: documento.nome_arquivo || true });
    if (signedError || !signed) {
      return NextResponse.json({ ok: false, error: "Falha ao gerar link do documento" }, { status: 500 });
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
    console.error(err);
    return NextResponse.json({ ok: false, error: "Falha ao buscar documento no Zoho" }, { status: 502 });
  }
}
