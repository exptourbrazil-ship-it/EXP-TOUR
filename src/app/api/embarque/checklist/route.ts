import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { chavesDeTarefa } from "@/lib/embarque";

export const runtime = "nodejs";

// Marca/desmarca uma TAREFA manual do checklist de pre-embarque. Itens de
// documento nao passam por aqui (marcam sozinhos pelo cofre). Autenticado pela
// sessao do cliente. Estado salvo por (titular, contrato, item).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const itemChave = body?.itemChave ? String(body.itemChave) : "";
  const contratoId = body?.contratoId ? String(body.contratoId) : null;
  const concluido = body?.concluido === true;

  // So aceita chaves de TAREFA conhecidas (impede marcar itens de documento
  // ou chaves arbitrarias).
  if (!chavesDeTarefa().has(itemChave)) {
    return NextResponse.json({ ok: false, erro: "Item inválido." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const registro = {
    titular_id: sessao.titularId,
    contrato_id: contratoId,
    item_chave: itemChave,
    concluido,
    atualizado_em: new Date().toISOString(),
  };

  // Ja existe marcacao para este (titular, contrato, item)? Atualiza; senao insere.
  const filtro = supabase
    .from("embarque_checklist")
    .select("id")
    .eq("titular_id", sessao.titularId)
    .eq("item_chave", itemChave);
  const { data: existente } = contratoId
    ? await filtro.eq("contrato_id", contratoId).maybeSingle()
    : await filtro.is("contrato_id", null).maybeSingle();

  const { error } = existente
    ? await supabase.from("embarque_checklist").update(registro).eq("id", (existente as any).id)
    : await supabase.from("embarque_checklist").insert(registro);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Não foi possível salvar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
