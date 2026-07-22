import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarAdminCookie } from "@/lib/admin-guard";

export const runtime = "nodejs";

// Lista os eventos do barramento (tabela "events") para inspecao no painel
// administrativo — util para ver pagamentos com status "erro" que precisam de
// reprocessamento. Filtro opcional por ?status= e ?source=.
//
// Autenticacao: cookie de sessao de admin, com fallback ao Bearer
// ADMIN_CAMBIO_SECRET (mesmo padrao das demais rotas admin).
function checarAuth(request: Request): boolean {
  if (checarAdminCookie()) return true;
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  if (!adminSecret) return false;
  return request.headers.get("authorization") === "Bearer " + adminSecret;
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(request: Request) {
  if (!checarAuth(request)) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const source = url.searchParams.get("source");
  const limite = Math.min(Number(url.searchParams.get("limite") || "100"), 500);

  const supabase = getSupabase();
  let query = supabase
    .from("events")
    .select("id, source, event_type, external_id, status, tentativas, erro, processed_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limite);

  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel listar os eventos." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: data || [] });
}
