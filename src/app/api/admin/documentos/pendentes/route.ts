import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarAdminRequest } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fila de documentos para a operacao: lista os documentos de TODOS os titulares
// (por padrao apenas status 'pendente') com nome/CPF do titular e uma URL
// assinada de curta duracao para o admin conferir o arquivo antes de aprovar
// ou rejeitar. Autenticacao: sessao de admin (ou Bearer de compatibilidade).
//
// O balde depende da origem do documento: 'titular' -> documentos-titular,
// 'admin' -> documentos-admin. Documentos vindos do Zoho (outra origem) nao tem
// arquivo no Storage aqui; nesse caso a URL vem nula.
export async function GET(request: Request) {
  if (!(await checarAdminRequest(request))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pendente"; // 'pendente' | 'todos' | ...

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // A fila e sobre o que o CLIENTE enviou (origem 'titular'). Docs inseridos
  // pela equipe (origem 'admin') ou vindos do Zoho nao entram na revisao.
  let query = supabase
    .from("documentos")
    .select("id, tipo_documento, origem, status, nome_arquivo, storage_path, created_at, titular_id")
    .eq("origem", "titular")
    .order("created_at", { ascending: true });

  if (status !== "todos") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: "Falha ao carregar documentos." }, { status: 500 });
  }

  // Busca os titulares em uma segunda query e junta em codigo. Evita depender
  // de uma FK declarada entre documentos e titulares (a tabela documentos foi
  // aplicada via SQL Editor; o embedding do Supabase exige a constraint).
  const titularIds = Array.from(new Set((data || []).map((d: any) => d.titular_id).filter(Boolean)));
  const titularPorId = new Map<string, { nome_completo: string | null; cpf: string | null }>();
  if (titularIds.length > 0) {
    const { data: titulares } = await supabase
      .from("titulares")
      .select("id, nome_completo, cpf")
      .in("id", titularIds);
    for (const t of titulares || []) {
      titularPorId.set(t.id, { nome_completo: t.nome_completo, cpf: t.cpf });
    }
  }

  // Gera URLs assinadas (5 min) para os documentos que vivem no Storage.
  const documentos = await Promise.all(
    (data || []).map(async (d: any) => {
      const t = titularPorId.get(d.titular_id) || { nome_completo: null, cpf: null };
      let url: string | null = null;
      if ((d.origem === "titular" || d.origem === "admin") && d.storage_path) {
        const bucket = d.origem === "admin" ? "documentos-admin" : "documentos-titular";
        const { data: signed } = await supabase.storage
          .from(bucket)
          .createSignedUrl(d.storage_path, 300);
        url = signed?.signedUrl || null;
      }
      return {
        id: d.id,
        tipo_documento: d.tipo_documento,
        origem: d.origem,
        status: d.status,
        nome_arquivo: d.nome_arquivo,
        created_at: d.created_at,
        titular_id: d.titular_id,
        titular_nome: t.nome_completo || null,
        titular_cpf: t.cpf || null,
        url,
      };
    })
  );

  return NextResponse.json({ ok: true, documentos });
}
