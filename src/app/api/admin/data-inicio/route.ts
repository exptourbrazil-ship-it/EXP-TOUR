import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarAdminCookie } from "@/lib/admin-guard";

export const runtime = "nodejs";

// Rota administrativa para a equipe da EXP Tour definir manualmente a
// "data_inicio" (inicio do curso) de um titular, inclusive de clientes
// que ainda nao possuem contrato cadastrado. A data e gravada em
// titulares.data_inicio. A aba Inicio usa a data do contrato quando ela
// existe e, caso contrario, cai para esta data do titular.
//
// Autenticacao: cookie de sessao de admin (login em /admin/login). Como
// compatibilidade, tambem aceita o Bearer ADMIN_CAMBIO_SECRET.
function checarAuth(request: Request): boolean {
  if (checarAdminCookie()) return true;
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!adminSecret) return false;
  return authHeader === "Bearer " + adminSecret;
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Lista os titulares (com a data de inicio ja gravada, se houver) para
// preencher o seletor no painel administrativo.
export async function GET(request: Request) {
  if (!checarAuth(request)) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("titulares")
    .select("id, nome_completo, email, data_inicio")
    .order("nome_completo", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel listar os titulares." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, titulares: data || [] });
}

// Grava a data de inicio de um titular. Aceita data vazia para limpar.
export async function POST(request: Request) {
  if (!checarAuth(request)) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const titularId = body?.titularId ? String(body.titularId) : null;
  const dataInicioRaw = body?.dataInicio ? String(body.dataInicio).trim() : "";

  if (!titularId) {
    return NextResponse.json({ ok: false, erro: "Informe 'titularId'." }, { status: 400 });
  }

  // Aceita YYYY-MM-DD ou vazio (para limpar a data).
  let dataInicio: string | null = null;
  if (dataInicioRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicioRaw)) {
      return NextResponse.json({ ok: false, erro: "Data invalida. Use o formato AAAA-MM-DD." }, { status: 400 });
    }
    const teste = new Date(dataInicioRaw + "T00:00:00");
    if (isNaN(teste.getTime())) {
      return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
    }
    dataInicio = dataInicioRaw;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("titulares")
    .update({ data_inicio: dataInicio })
    .eq("id", titularId);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel salvar a data." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
