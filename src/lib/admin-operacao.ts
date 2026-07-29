// NB: modulo server-only (usa a service role do Supabase). So deve ser
// importado por server components e rotas de API — nunca por codigo client.
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Conta os documentos enviados pelo cliente (origem 'titular') com status
// 'pendente' — a mesma populacao da fila de aprovacao, para o card da home
// bater com a lista. Usa o head count do Supabase (nao traz linhas). Retorna 0
// em caso de falha.
export async function contarDocumentosPendentes(): Promise<number> {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("documentos")
    .select("id", { count: "exact", head: true })
    .eq("origem", "titular")
    .eq("status", "pendente");
  if (error) return 0;
  return count ?? 0;
}
