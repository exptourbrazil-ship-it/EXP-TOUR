import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aceite do Termo de Adesão pelo próprio cliente (área do cliente).
// GET  -> termo vigente + se o titular logado já aceitou essa versão.
// POST -> registra o aceite (prova: titular, versão, hash, data/hora, IP, UA).
// A verdade do consentimento é o registro em `aceites`; a UI deve exibir o
// texto completo antes de habilitar o aceite (CDC art. 46).

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );
}

async function titularDaSessao(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verificarSessao(token)?.titularId ?? null;
}

// Termo de Adesão vigente (ativo mais recente).
async function termoVigente(supabase: ReturnType<typeof getSupabase>) {
  const { data } = await supabase
    .from("termos")
    .select("id, versao, conteudo, storage_path, hash")
    .eq("tipo", "adesao")
    .eq("ativo", true)
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function GET() {
  const titularId = await titularDaSessao();
  if (!titularId) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });
  }

  const supabase = getSupabase();
  const termo = await termoVigente(supabase);
  if (!termo) {
    return NextResponse.json({ ok: true, termo: null, jaAceito: false });
  }

  const { data: aceite } = await supabase
    .from("aceites")
    .select("id, data_hora")
    .eq("titular_id", titularId)
    .eq("termo_id", termo.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    termo: { id: termo.id, versao: termo.versao, conteudo: termo.conteudo, storage_path: termo.storage_path },
    jaAceito: !!aceite,
    aceiteEm: aceite?.data_hora ?? null,
  });
}

export async function POST(request: Request) {
  const titularId = await titularDaSessao();
  if (!titularId) {
    return NextResponse.json({ ok: false, error: "Nao autenticado" }, { status: 401 });
  }

  const supabase = getSupabase();
  const termo = await termoVigente(supabase);
  if (!termo) {
    return NextResponse.json({ ok: false, error: "Nenhum termo vigente para aceitar." }, { status: 400 });
  }

  // Idempotente: se já aceitou esta versão, devolve o registro existente (a
  // prova é o primeiro aceite; não duplicamos).
  const { data: existente } = await supabase
    .from("aceites")
    .select("id, data_hora")
    .eq("titular_id", titularId)
    .eq("termo_id", termo.id)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ ok: true, jaAceito: true, aceiteEm: existente.data_hora });
  }

  const { data: novo, error } = await supabase
    .from("aceites")
    .insert({
      titular_id: titularId,
      termo_id: termo.id,
      versao: termo.versao,
      hash_conteudo: termo.hash,
      contexto: "area_cliente",
      ip: obterIp(request),
      user_agent: request.headers.get("user-agent") || null,
    })
    .select("id, data_hora")
    .single();

  if (error || !novo) {
    return NextResponse.json({ ok: false, error: "Falha ao registrar o aceite." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, aceiteEm: novo.data_hora });
}
