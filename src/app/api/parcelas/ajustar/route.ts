import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { aplicarEdicaoParcelas, ParcelaEditErro } from "@/lib/parcelas-edit-service";

// Ajuste de parcelas pelo proprio cliente (aba Financeiro).
// Permite editar valores e datas, adicionar e excluir parcelas (sem valor minimo).
// As invariantes vivem no servico compartilhado parcelas-edit-service (o mesmo
// que o Admin usa), garantindo um so lugar de verdade.
//
// Regras (aplicadas SEMPRE no servidor, nao apenas na UI):
//  - a sessao precisa estar autenticada e o contrato pertencer ao titular;
//  - parcela PAGA/Pix e imutavel: mantida como esta (pass-through), nunca
//    editada nem removida — mas NAO trava o ajuste das demais (o cliente pode
//    ajustar as parcelas em aberto mesmo depois de uma ou mais pagas);
//  - regra dos 30 dias sobre as parcelas em aberto (quando ha data_inicio);
//  - a soma do plano confere com valor_total; valor_original nunca e sobrescrito.

type ParcelaInput = {
  id?: string;
  numero?: number;
  descricao: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);

  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão não autenticada" }, { status: 401 });
  }

  let corpo: { contratoId?: string; parcelas?: ParcelaInput[] };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo inválido" }, { status: 400 });
  }

  const contratoId = corpo.contratoId;
  const novas = Array.isArray(corpo.parcelas) ? corpo.parcelas : [];

  if (!contratoId) {
    return NextResponse.json({ ok: false, erro: "contratoId obrigatório" }, { status: 400 });
  }
  if (novas.length === 0) {
    return NextResponse.json({ ok: false, erro: "É preciso manter ao menos uma parcela." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1) Confere que o contrato existe e pertence ao titular da sessao.
  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .select("id, titular_id, data_inicio, valor_total")
    .eq("id", contratoId)
    .single();

  if (erroContrato || !contrato) {
    return NextResponse.json({ ok: false, erro: "Contrato não encontrado" }, { status: 404 });
  }
  if ((contrato as any).titular_id !== sessao.titularId) {
    return NextResponse.json({ ok: false, erro: "Contrato não pertence ao titular autenticado" }, { status: 403 });
  }

  // 2) Valida e aplica via serviço compartilhado (mesmas invariantes do Admin).
  try {
    await aplicarEdicaoParcelas(supabase, { contratoId, parcelas: novas });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ParcelaEditErro) {
      return NextResponse.json({ ok: false, erro: err.mensagem }, { status: err.status });
    }
    return NextResponse.json({ ok: false, erro: "Falha ao salvar as parcelas." }, { status: 500 });
  }
}
