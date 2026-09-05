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
    .select("id, status, qr_code_url, external_payment_id, valor_atual")
    .eq("contrato_id", contratoId);
  if (erroAtuais) {
    throw new ParcelaEditErro("falha_leitura", "Não foi possível ler as parcelas atuais.", 500);
  }
  const atuais = (atuaisRaw ?? []).map((p: any) => ({
    id: p.id as string,
    status: p.status as string,
    qr_code_url: (p.qr_code_url as string) ?? null,
    external_payment_id: (p.external_payment_id as string) ?? null,
    valor_atual: Number(p.valor_atual),
  }));

  const v = validarEdicaoParcelas({
    parcelas,
    atuais,
    valorTotal: (contrato as any).valor_total != null ? Number((contrato as any).valor_total) : null,
    dataInicio: ((contrato as any).data_inicio as string) ?? null,
  });
  if (!v.ok) throw new ParcelaEditErro(v.codigo, v.mensagem, 400);

  // Apply ATOMICO via função Postgres (delete+update+insert numa transação, sob
  // advisory lock). A função re-enforça, SOB O LOCK, que parcela travada nunca é
  // alterada nem removida — fecha a janela de corrida com o webhook de pagamento.
  // Falha fechada: se a função não foi aplicada, RECUSAMOS (nunca degradamos para
  // o caminho não-transacional).
  const { data, error } = await supabase.rpc("substituir_parcelas", {
    p_contrato_id: contratoId,
    p_parcelas: parcelas.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      numero: p.numero,
      descricao: p.descricao,
      valor: p.valor,
      vencimento: p.vencimento,
    })),
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "PGRST202") {
      console.error("[parcelas] função substituir_parcelas ausente (aplicar migração)");
      throw new ParcelaEditErro(
        "migracao_ausente",
        "Função de banco 'substituir_parcelas' ainda não aplicada. Rode a migração antes de editar parcelas.",
        503,
      );
    }
    if (code === "P0001") {
      // Corrida: uma parcela virou travada entre a validação e o apply.
      throw new ParcelaEditErro("remover_travada", "Não é possível excluir uma parcela já paga ou com Pix já gerado.", 409);
    }
    if (code === "23505") {
      throw new ParcelaEditErro("numero_duplicado", "Há números de parcela duplicados no plano.", 400);
    }
    console.error("[parcelas] rpc substituir_parcelas:", error.message);
    throw new ParcelaEditErro("falha_persistir", "Falha ao salvar as parcelas.", 500);
  }

  const total = typeof data === "number" ? data : parcelas.length;
  return { ok: true, total, removidas: v.remover.length, travadas: v.travadas.size };
}
