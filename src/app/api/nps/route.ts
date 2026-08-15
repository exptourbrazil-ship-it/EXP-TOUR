import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { validarNotaNps, classificarNps } from "@/lib/nps";

export const runtime = "nodejs";

// Recebe a avaliacao NPS do cliente (aba Retorno): nota 0-10 + comentario
// opcional. Uma resposta por titular+contrato; reenvio atualiza a anterior.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const nota = body?.nota;
  const comentario = typeof body?.comentario === "string" ? body.comentario.trim().slice(0, 2000) : null;
  const contratoId = body?.contratoId ? String(body.contratoId) : null;

  if (!validarNotaNps(nota)) {
    return NextResponse.json({ ok: false, erro: "Informe uma nota inteira de 0 a 10." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Checagem de posse: o contratoId vinha do corpo e era gravado junto ao
  // titular_id da sessao sem nunca verificar que o contrato pertence a quem
  // esta chamando — dava para vincular a resposta ao contrato de outro cliente.
  if (contratoId) {
    const { data: contratoDono } = await supabase
      .from("contratos")
      .select("id")
      .eq("id", contratoId)
      .eq("titular_id", sessao.titularId)
      .maybeSingle();
    if (!contratoDono) {
      return NextResponse.json({ ok: false, erro: "Contrato nao encontrado" }, { status: 404 });
    }
  }


  const registro = {
    titular_id: sessao.titularId,
    contrato_id: contratoId,
    nota,
    classificacao: classificarNps(nota),
    comentario: comentario || null,
    atualizado_em: new Date().toISOString(),
  };

  // Ja respondeu para este titular+contrato? Se sim, atualiza; se nao, insere.
  const filtro = supabase.from("nps_respostas").select("id").eq("titular_id", sessao.titularId);
  const { data: existente } = contratoId
    ? await filtro.eq("contrato_id", contratoId).maybeSingle()
    : await filtro.is("contrato_id", null).maybeSingle();

  const { error } = existente
    ? await supabase.from("nps_respostas").update(registro).eq("id", (existente as any).id)
    : await supabase.from("nps_respostas").insert(registro);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Não foi possível salvar a avaliação." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
