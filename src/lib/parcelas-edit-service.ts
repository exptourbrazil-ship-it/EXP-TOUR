// Serviço compartilhado de EDICAO de parcelas (cliente e admin). SERVER-ONLY.
// Carrega o contrato e as parcelas atuais, valida pelas invariantes puras
// (parcelas-edit.ts) e aplica: remove as não-travadas ausentes, atualiza as
// não-travadas presentes e insere as novas. Parcelas TRAVADAS (pagas/Pix) são
// pass-through — NUNCA atualizadas nem removidas, mesmo que o corpo tente.
//
// Posse é do CHAMADOR (a rota do cliente confere titular; a rota admin confere
// capacidade). Aqui só operamos sobre o contrato já autorizado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { validarEdicaoParcelas, type ParcelaEditInput } from "@/lib/parcelas-edit";

export class ParcelaEditErro extends Error {
  constructor(public codigo: string, public mensagem: string, public status = 400) {
    super(mensagem);
    this.name = "ParcelaEditErro";
  }
}

export type AplicarResultado = { ok: true; total: number; removidas: number; travadas: number };

export async function aplicarEdicaoParcelas(
  supabase: SupabaseClient,
  args: { contratoId: string; parcelas: ParcelaEditInput[] },
): Promise<AplicarResultado> {
  const { contratoId, parcelas } = args;

  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .select("id, data_inicio, valor_total")
    .eq("id", contratoId)
    .single();
  if (erroContrato || !contrato) {
    throw new ParcelaEditErro("nao_encontrado", "Contrato não encontrado.", 404);
  }

  const { data: atuaisRaw, error: erroAtuais } = await supabase
    .from("parcelas")
    .select("id, status, qr_code_url, valor_atual")
    .eq("contrato_id", contratoId);
  if (erroAtuais) {
    throw new ParcelaEditErro("falha_leitura", "Não foi possível ler as parcelas atuais.", 500);
  }
  const atuais = (atuaisRaw ?? []).map((p: any) => ({
    id: p.id as string,
    status: p.status as string,
    qr_code_url: (p.qr_code_url as string) ?? null,
    valor_atual: Number(p.valor_atual),
  }));

  const v = validarEdicaoParcelas({
    parcelas,
    atuais,
    valorTotal: (contrato as any).valor_total != null ? Number((contrato as any).valor_total) : null,
    dataInicio: ((contrato as any).data_inicio as string) ?? null,
  });
  if (!v.ok) throw new ParcelaEditErro(v.codigo, v.mensagem, 400);

  // NOTA (follow-up): o apply abaixo é delete→update→insert SEM transação (o
  // mesmo padrão que o self-service do cliente já roda em produção). Uma falha
  // transitória no meio pode deixar o plano inconsistente. A correção alinhada
  // ao projeto é uma função Postgres atômica (como substituir_elegibilidade),
  // planejada como a próxima fatia deste recurso.

  // 1) Remove as não-travadas ausentes (o validador já garantiu que nenhuma
  //    travada está em `remover`). Filtra por contrato_id também (defense-in-depth).
  if (v.remover.length > 0) {
    const { error } = await supabase
      .from("parcelas")
      .delete()
      .eq("contrato_id", contratoId)
      .in("id", v.remover);
    if (error) throw new ParcelaEditErro("falha_remover", "Falha ao remover parcelas.", 500);
  }

  // 2) Atualiza/insere. Parcelas travadas são ignoradas no update (pass-through):
  //    o dinheiro só muda de estado por webhook; nunca por esta tela.
  for (const p of parcelas) {
    if (p.id) {
      if (v.travadas.has(p.id)) continue; // travada: nunca alterada
      const { error } = await supabase
        .from("parcelas")
        .update({
          numero: p.numero,
          descricao: p.descricao,
          valor_atual: p.valor, // valor_original NÃO é tocado
          vencimento: p.vencimento,
        })
        .eq("id", p.id)
        .eq("contrato_id", contratoId);
      if (error) throw new ParcelaEditErro("falha_update", "Falha ao atualizar uma parcela.", 500);
    } else {
      const { error } = await supabase.from("parcelas").insert({
        contrato_id: contratoId,
        numero: p.numero,
        descricao: p.descricao,
        valor_original: p.valor,
        valor_atual: p.valor,
        vencimento: p.vencimento,
        status: "pendente",
        is_entrada: false,
      });
      if (error) throw new ParcelaEditErro("falha_insert", "Falha ao inserir uma nova parcela.", 500);
    }
  }

  return { ok: true, total: parcelas.length, removidas: v.remover.length, travadas: v.travadas.size };
}
