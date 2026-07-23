import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";

// Restaura o plano de parcelas do contrato para o "plano_original"
// guardado em contratos.plano_original (snapshot do plano inicial).
//
// Regras de seguranca (SEMPRE no servidor):
//  - sessao autenticada;
//  - contrato pertence ao titular da sessao;
//  - se qualquer parcela ja foi paga (status "pago") ou ja tem Pix gerado
//    (qr_code_url preenchido), a restauracao e bloqueada, porque mexer
//    nessas parcelas nao e permitido. Nesse caso o cliente deve ajustar
//    manualmente as parcelas ainda pendentes.

type LinhaOriginal = {
  numero?: number;
  descricao: string;
  valor: number;
  vencimento: string;
  is_entrada?: boolean;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);

  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessao nao autenticada" }, { status: 401 });
  }

  let corpo: { contratoId?: string };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido" }, { status: 400 });
  }

  const contratoId = corpo.contratoId;
  if (!contratoId) {
    return NextResponse.json({ ok: false, erro: "contratoId obrigatorio" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1) Contrato existe e pertence ao titular.
  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .select("id, titular_id, plano_original")
    .eq("id", contratoId)
    .single();

  if (erroContrato || !contrato) {
    return NextResponse.json({ ok: false, erro: "Contrato nao encontrado" }, { status: 404 });
  }
  if ((contrato as any).titular_id !== sessao.titularId) {
    return NextResponse.json({ ok: false, erro: "Contrato nao pertence ao titular autenticado" }, { status: 403 });
  }

  const plano = (contrato as any).plano_original as LinhaOriginal[] | null;
  if (!plano || !Array.isArray(plano) || plano.length === 0) {
    return NextResponse.json({ ok: false, erro: "Este contrato nao tem plano original guardado." }, { status: 400 });
  }

  // 2) Se houver parcela paga ou com Pix gerado, nao da para restaurar.
  const { data: atuais, error: erroAtuais } = await supabase
    .from("parcelas")
    .select("id, status, qr_code_url")
    .eq("contrato_id", contratoId);

  if (erroAtuais) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel ler as parcelas atuais." }, { status: 500 });
  }

  const temBloqueio = (atuais || []).some((p) => p.status === "pago" || !!p.qr_code_url);
  if (temBloqueio) {
    return NextResponse.json(
      { ok: false, erro: "Nao e possivel restaurar: ja existe parcela paga ou com Pix gerado. Ajuste manualmente as parcelas pendentes." },
      { status: 400 }
    );
  }

  // 3) Apaga todas as parcelas atuais (nenhuma esta bloqueada) e recria o plano original.
  const { error: erroDel } = await supabase.from("parcelas").delete().eq("contrato_id", contratoId);
  if (erroDel) {
    return NextResponse.json({ ok: false, erro: "Falha ao limpar as parcelas atuais." }, { status: 500 });
  }

  const linhas = plano.map((l, i) => ({
    contrato_id: contratoId,
    numero: typeof l.numero === "number" ? l.numero : i + 1,
    descricao: l.descricao,
    valor_original: l.valor,
    valor_atual: l.valor,
    vencimento: l.vencimento,
    status: "pendente",
    is_entrada: !!l.is_entrada,
  }));

  const { error: erroIns } = await supabase.from("parcelas").insert(linhas);
  if (erroIns) {
    return NextResponse.json({ ok: false, erro: "Falha ao recriar o plano original." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
