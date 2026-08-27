import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { obterIp } from "@/lib/rate-limit";
import { prazoArrependimentoISO, dentroDoPrazoArrependimento } from "@/lib/termos";
import { enviarConfirmacaoAceiteEmail } from "@/lib/email";
import { slugDoTenant } from "@/lib/tenant-slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aceite do Termo de Adesão pelo próprio cliente (área do cliente).
// GET  -> termo vigente + situação do aceite do titular (aceito? prazo de
//         arrependimento? já arrependido?).
// POST -> registra o aceite (prova: titular, versão, hash, data/hora, IP, UA) e
//         envia a cópia/confirmação por e-mail (best-effort).
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

function fmtDataHora(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function fmtData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
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
    .select("id, data_hora, arrependido_em")
    .eq("titular_id", titularId)
    .eq("termo_id", termo.id)
    .maybeSingle();

  const arrependido = !!aceite?.arrependido_em;
  const arrependimentoAte = aceite ? prazoArrependimentoISO(aceite.data_hora) : null;
  const podeArrepender =
    !!aceite && !arrependido && dentroDoPrazoArrependimento(aceite.data_hora, new Date().toISOString());

  return NextResponse.json({
    ok: true,
    termo: { id: termo.id, versao: termo.versao, conteudo: termo.conteudo, storage_path: termo.storage_path },
    jaAceito: !!aceite,
    aceiteEm: aceite?.data_hora ?? null,
    arrependido,
    arrependimentoAte,
    podeArrepender,
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

  // Idempotente: se já aceitou esta versão, devolve o registro existente.
  const { data: existente } = await supabase
    .from("aceites")
    .select("id, data_hora")
    .eq("titular_id", titularId)
    .eq("termo_id", termo.id)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({
      ok: true,
      jaAceito: true,
      aceiteEm: existente.data_hora,
      arrependimentoAte: prazoArrependimentoISO(existente.data_hora),
    });
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

  const arrependimentoAte = prazoArrependimentoISO(novo.data_hora);

  // Cópia/confirmação por e-mail (best-effort: não derruba o aceite).
  try {
    const { data: titular } = await supabase
      .from("titulares")
      .select("nome_completo, email, tenant_id")
      .eq("id", titularId)
      .maybeSingle();
    if (titular?.email) {
      const slug = await slugDoTenant(supabase, titular.tenant_id);
      await enviarConfirmacaoAceiteEmail(titular.email, titular.nome_completo || "", {
        versao: termo.versao,
        dataFormatada: fmtDataHora(novo.data_hora),
        arrependimentoAte: fmtData(arrependimentoAte),
        conteudo: termo.conteudo,
      }, slug);
    }
  } catch {
    // Sem o erro cru: a mensagem do provedor pode conter o e-mail (PII).
    // A falha ja fica registrada, com detalhe, em email_logs.
    console.error("[aceite] falha ao enviar e-mail de confirmacao (ver email_logs)");
  }

  return NextResponse.json({ ok: true, aceiteEm: novo.data_hora, arrependimentoAte });
}
