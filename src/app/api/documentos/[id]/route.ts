import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { categoriaDoTipoDocumento } from "@/lib/documentos";

export const runtime = "nodejs";

// Exclui um documento do cofre pelo proprio cliente. Regras (SEMPRE no servidor):
//  - sessao autenticada;
//  - o documento precisa pertencer ao titular da sessao;
//  - so documentos da categoria "estudante" enviados pelo proprio titular
//    (origem "titular") podem ser excluidos aqui — documentos da escola/
//    financeiro (inseridos pela EXP Tour) ficam protegidos.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: doc, error } = await supabase
    .from("documentos")
    .select("id, titular_id, tipo_documento, origem, storage_path")
    .eq("id", id)
    .single();

  if (error || !doc) {
    return NextResponse.json({ ok: false, erro: "Documento não encontrado" }, { status: 404 });
  }
  if ((doc as any).titular_id !== sessao.titularId) {
    return NextResponse.json({ ok: false, erro: "Documento não pertence a você" }, { status: 403 });
  }
  if (categoriaDoTipoDocumento((doc as any).tipo_documento) !== "estudante" || (doc as any).origem !== "titular") {
    return NextResponse.json({ ok: false, erro: "Este documento não pode ser excluído por aqui." }, { status: 403 });
  }

  // Remove o arquivo do Storage (melhor esforco) e depois o registro no banco.
  const storagePath = (doc as any).storage_path as string | null;
  if (storagePath) {
    try {
      await supabase.storage.from("documentos-titular").remove([storagePath]);
    } catch {
      // segue para remover o registro mesmo se a limpeza do arquivo falhar
    }
  }

  const { error: delErr } = await supabase
    .from("documentos")
    .delete()
    .eq("id", id)
    .eq("titular_id", sessao.titularId);

  if (delErr) {
    return NextResponse.json({ ok: false, erro: "Não foi possível excluir o documento." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
