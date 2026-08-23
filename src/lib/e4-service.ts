// NB: modulo server-only (service role). So deve ser importado por rotas/webhook
// e server components — NUNCA por codigo client.
//
// Automacao do processo E4 — CANCELAMENTO PELO CLIENTE (doc 01 §4). NESTE passo:
// abre o processo E4 (que pausa a regua de cobranca/lembretes via suspende
// padrao do tipo) e cai na Fila do Dia roteado ao Consultor (a "conversa de
// retencao antes do acerto"). NAO dispara refund nem cancela o contrato
// automaticamente — isso e a execucao humana / o motor de acerto (marco proprio;
// dinheiro so muda por webhook confirmado, nunca por tela).
//
// Idempotente: E9/E4 sao abertas no maximo uma vez por contrato (indice unico
// parcial + excecao_ja_aberta tratado como sucesso).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export class CancelamentoBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "CancelamentoBloqueado";
    this.codigo = codigo;
  }
}

// Abre o E4 num contrato. `origem` documenta o gatilho (portal_arrependimento,
// admin, etc.). `ja_aberta` e tratado como sucesso (nao reabre/duplica).
// Retorna true se ABRIU agora, false se ja havia um E4 ativo.
export async function abrirCancelamentoContrato(args: {
  contratoId: string;
  titularIdEsperado?: string;
  origem: string;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<boolean> {
  try {
    await abrirExcecao({
      contratoId: args.contratoId,
      tipo: "cancelamento_cliente",
      motivo: args.motivo || `Pedido de cancelamento do cliente (${args.origem})`,
      titularIdEsperado: args.titularIdEsperado,
      autor: args.autor,
      ip: args.ip ?? null,
    });
    return true;
  } catch (err) {
    if (err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta") return false;
    // contrato de outro titular / contrato inexistente -> erro de negocio
    if (err instanceof ExcecaoBloqueada) {
      throw new CancelamentoBloqueado(err.codigo, err.message);
    }
    throw err;
  }
}

export type ResultadoCancelamentoTitular = {
  contratosAfetados: number; // contratos ativos do titular
  excecoesAbertas: number; // E4 abertas agora (exclui as ja ativas)
};

// Abre o E4 para TODOS os contratos ativos (nao cancelados) de um titular. Usado
// pelo gatilho de arrependimento no portal (o cliente age sobre o Termo, nao
// sobre um contrato especifico). Best-effort por contrato: uma falha isolada nao
// impede os demais.
export async function abrirCancelamentoTitular(args: {
  titularId: string;
  origem: string;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<ResultadoCancelamentoTitular> {
  const supabase = getSupabase();
  const { data: contratos, error } = await supabase
    .from("contratos")
    .select("id")
    .eq("titular_id", args.titularId)
    .is("cancelado_em", null);
  // LANCA em erro de leitura: sem isto, um erro do banco viraria lista vazia e a
  // funcao retornaria 0/0 em SILENCIO — o cliente ficaria arrependido mas a
  // regua nunca seria pausada, sem nenhum sinal. O chamador precisa saber.
  if (error) {
    throw new CancelamentoBloqueado("falha_leitura_contratos", "Falha ao ler contratos do titular");
  }

  const lista = contratos || [];
  let abertas = 0;
  for (const c of lista) {
    try {
      const abriu = await abrirCancelamentoContrato({
        contratoId: c.id as string,
        titularIdEsperado: args.titularId,
        origem: args.origem,
        motivo: args.motivo,
        autor: args.autor,
        ip: args.ip ?? null,
      });
      if (abriu) abertas++;
    } catch (err) {
      console.error("[e4] falha ao abrir E4 para um contrato do titular");
      void err;
    }
  }
  return { contratosAfetados: lista.length, excecoesAbertas: abertas };
}
