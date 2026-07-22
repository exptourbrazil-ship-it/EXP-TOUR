import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";

// Ajuste de parcelas pelo proprio cliente (aba Financeiro).
// Permite editar valores e datas, adicionar e excluir parcelas (sem valor minimo).
//
// Regras de seguranca (aplicadas SEMPRE no servidor, nao apenas na UI):
//  - a sessao precisa estar autenticada;
//  - o contrato precisa pertencer ao titular da sessao;
//  - parcelas ja pagas (status "pago") ou que ja tenham cobranca Pix gerada
//    (qr_code_url preenchido) nao podem ser alteradas nem removidas;
//  - se o contrato tiver data_inicio (vinda do Zoho), o ultimo pagamento
//    precisa ser >= 30 dias corridos antes da data de inicio. Enquanto a
//    data_inicio nao existir, a regra dos 30 dias fica inativa.
//  - valor_original NUNCA e sobrescrito ao editar (preserva o plano original
//    para permitir "Restaurar plano original").

type ParcelaInput = {
  id?: string;
  descricao: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
};

export async function POST(request: Request) {
  const cookieStore = cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);

  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessao nao autenticada" }, { status: 401 });
  }

  let corpo: { contratoId?: string; parcelas?: ParcelaInput[] };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo invalido" }, { status: 400 });
  }

  const contratoId = corpo.contratoId;
  const novas = Array.isArray(corpo.parcelas) ? corpo.parcelas : [];

  if (!contratoId) {
    return NextResponse.json({ ok: false, erro: "contratoId obrigatorio" }, { status: 400 });
  }
  if (novas.length === 0) {
    return NextResponse.json({ ok: false, erro: "E preciso manter ao menos uma parcela." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1) Confere que o contrato existe e pertence ao titular da sessao.
  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .select("id, titular_id, data_inicio")
    .eq("id", contratoId)
    .single();

  if (erroContrato || !contrato) {
    return NextResponse.json({ ok: false, erro: "Contrato nao encontrado" }, { status: 404 });
  }
  if ((contrato as any).titular_id !== sessao.titularId) {
    return NextResponse.json({ ok: false, erro: "Contrato nao pertence ao titular autenticado" }, { status: 403 });
  }

  // 2) Carrega as parcelas atuais do contrato.
  const { data: atuais, error: erroAtuais } = await supabase
    .from("parcelas")
    .select("id, status, qr_code_url")
    .eq("contrato_id", contratoId);

  if (erroAtuais) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel ler as parcelas atuais." }, { status: 500 });
  }

  const atuaisPorId = new Map((atuais || []).map((p) => [p.id, p]));
  const bloqueada = (p: any) => p && (p.status === "pago" || !!p.qr_code_url);

  // 3) Valida cada parcela recebida.
  for (const p of novas) {
    if (!p.descricao || typeof p.valor !== "number" || p.valor <= 0 || !p.vencimento) {
      return NextResponse.json({ ok: false, erro: "Cada parcela precisa de descricao, valor maior que zero e data de vencimento." }, { status: 400 });
    }
    if (p.id) {
      const atual = atuaisPorId.get(p.id);
      if (!atual) {
        return NextResponse.json({ ok: false, erro: "Parcela informada nao pertence a este contrato." }, { status: 400 });
      }
      if (bloqueada(atual)) {
        return NextResponse.json({ ok: false, erro: "Uma das parcelas ja foi paga ou ja tem Pix gerado e nao pode ser alterada." }, { status: 400 });
      }
    }
  }

  // 4) Impede excluir parcelas ja pagas ou com Pix gerado.
  const idsRecebidos = new Set(novas.filter((p) => p.id).map((p) => p.id as string));
  const removidas = (atuais || []).filter((p) => !idsRecebidos.has(p.id));
  for (const r of removidas) {
    if (bloqueada(r)) {
      return NextResponse.json({ ok: false, erro: "Nao e possivel excluir uma parcela ja paga ou com Pix ja gerado." }, { status: 400 });
    }
  }

  // 5) Regra dos 30 dias: o ultimo vencimento precisa ser >= 30 dias
  // corridos antes da data_inicio (quando ela existir).
  const dataInicio = (contrato as any).data_inicio as string | null;
  if (dataInicio) {
    const inicio = new Date(dataInicio + "T00:00:00");
    const limite = new Date(inicio);
    limite.setDate(limite.getDate() - 30);
    const ultimoVenc = novas
      .map((p) => new Date(p.vencimento + "T00:00:00"))
      .reduce((max, d) => (d > max ? d : max), new Date(0));
    if (ultimoVenc > limite) {
      const limiteISO = limite.toISOString().slice(0, 10);
      return NextResponse.json(
        { ok: false, erro: `O ultimo pagamento precisa ser ate ${limiteISO} (30 dias antes do inicio do programa).` },
        { status: 400 }
      );
    }
  }

  // 6) Aplica as mudancas: remove, atualiza e insere.
  const idsRemover = removidas.map((p) => p.id);
  if (idsRemover.length > 0) {
    const { error: erroDel } = await supabase.from("parcelas").delete().in("id", idsRemover);
    if (erroDel) {
      return NextResponse.json({ ok: false, erro: "Falha ao remover parcelas." }, { status: 500 });
    }
  }

  for (const p of novas) {
    if (p.id) {
      // valor_original NAO e alterado: preserva o plano original.
      const { error: erroUpd } = await supabase
        .from("parcelas")
        .update({
          numero: p.numero,
          descricao: p.descricao,
          valor_atual: p.valor,
          vencimento: p.vencimento,
        })
        .eq("id", p.id)
        .eq("contrato_id", contratoId);
      if (erroUpd) {
        return NextResponse.json({ ok: false, erro: "Falha ao atualizar uma parcela." }, { status: 500 });
      }
    } else {
      const { error: erroIns } = await supabase.from("parcelas").insert({
        contrato_id: contratoId,
        numero: p.numero,
        descricao: p.descricao,
        valor_original: p.valor,
        valor_atual: p.valor,
        vencimento: p.vencimento,
        status: "pendente",
        is_entrada: false,
      });
      if (erroIns) {
        return NextResponse.json({ ok: false, erro: "Falha ao inserir uma nova parcela." }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
