// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Servico do motor de ALTERACAO (E2 adiamento; doc 01 §4). NESTE passo: calcula
// a PREVIA do plano recalculado para uma nova data de inicio e grava um RASCUNHO
// (nova data-limite de quitacao + reagendamento do saldo em aberto) para o
// Financeiro/Operacao revisar. NAO reescreve parcelas nem gera aditivo
// (aplicacao = marco proprio; parcelas pagas nao sao tocadas).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import { calcularPlanoDeferral, saldoDevedorMoeda } from "@/lib/parcelas";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export class AlteracaoBloqueada extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "AlteracaoBloqueada";
    this.codigo = codigo;
  }
}

function dataISOValida(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [ano, mes, dia] = s.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export type AlteracaoRegistro = {
  id: string;
  status: string;
  moeda: string | null;
  data_inicio_atual: string | null;
  nova_data_inicio: string | null;
  nova_data_quitacao: string | null;
  saldo_devedor: number | null;
  num_parcelas: number | null;
  plano_proposto: { numero: number; vencimento: string; valor: number }[] | null;
  provisorio: boolean;
};

// Calcula e grava (rascunho) a previa do plano para uma nova data de inicio.
// Requer um E2 (deferral_inicio) ATIVO no contrato. Recalcular atualiza o rascunho.
export async function calcularERegistrarAlteracao(args: {
  contratoId: string;
  // Obrigatorio: unica barreira de posse (RLS sem policy + service role). Deixar
  // opcional permitiria a um chamador futuro desligar a checagem em silencio.
  titularIdEsperado: string;
  novaDataInicio: string;
  autor: string;
  ip?: string | null;
}): Promise<AlteracaoRegistro> {
  if (!dataISOValida(args.novaDataInicio)) {
    throw new AlteracaoBloqueada("data_invalida", "Nova data de inicio invalida");
  }
  // Adiamento (E2) so faz sentido para uma data futura — recusa passado/hoje.
  if (args.novaDataInicio <= hojeBrasilISO()) {
    throw new AlteracaoBloqueada(
      "data_no_passado",
      "A nova data de inicio deve ser futura"
    );
  }
  const supabase = getSupabase();

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, moeda, data_inicio")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!contrato) {
    throw new AlteracaoBloqueada("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (contrato.titular_id !== args.titularIdEsperado) {
    throw new AlteracaoBloqueada("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  // Exige um E2 (adiamento) ativo — a previa acompanha um processo em curso.
  const { data: excecoes } = await supabase
    .from("case_exceptions")
    .select("id, tipo, aberta_em")
    .eq("contrato_id", args.contratoId)
    .in("status", ["aberta", "em_andamento"])
    .order("aberta_em", { ascending: false });
  const excecao = (excecoes || []).find((e) => e.tipo === "deferral_inicio");
  if (!excecao) {
    throw new AlteracaoBloqueada(
      "sem_deferral_ativo",
      "Nao ha pedido de adiamento (E2) ativo neste contrato"
    );
  }

  // Saldo em aberto (moeda do programa) — parcelas nao pagas.
  const { data: parcelas } = await supabase
    .from("parcelas")
    .select("valor_atual, status")
    .eq("contrato_id", args.contratoId);
  const saldoDevedor = saldoDevedorMoeda((parcelas || []) as { valor_atual: number | string; status: string }[]);

  const plano = calcularPlanoDeferral({
    saldoDevedor,
    dataReferencia: hojeBrasilISO(),
    novaDataInicio: args.novaDataInicio,
  });
  // Defensivo: se houver saldo mas o plano nao couber, nao gravar um rascunho
  // que pareceria "nada a reagendar" (num_parcelas 0). Hoje inalcancavel (a data
  // ja foi validada), mas protege contra mudancas futuras na validacao.
  if (saldoDevedor > 0 && !plano.cabe) {
    throw new AlteracaoBloqueada(
      "plano_nao_cabe",
      "Nao ha janela para reagendar o saldo ate a nova data-limite de quitacao"
    );
  }

  const patch = {
    excecao_id: excecao.id,
    status: "rascunho",
    data_inicio_atual: (contrato as { data_inicio?: string | null }).data_inicio ?? null,
    nova_data_inicio: args.novaDataInicio,
    nova_data_quitacao: plano.novaDataQuitacao,
    saldo_devedor: saldoDevedor,
    moeda: contrato.moeda || null,
    num_parcelas: plano.planoProposto.length,
    plano_proposto: plano.planoProposto,
    provisorio: true,
    atualizada_em: new Date().toISOString(),
  };

  async function atualizarPorContrato(): Promise<AlteracaoRegistro | null> {
    const { data: existente } = await supabase
      .from("alteracoes")
      .select("id")
      .eq("contrato_id", args.contratoId)
      .eq("status", "rascunho")
      .maybeSingle();
    if (!existente?.id) return null;
    const { data, error } = await supabase
      .from("alteracoes")
      .update(patch)
      .eq("id", existente.id)
      .select("*")
      .single();
    if (error || !data) throw new Error("Falha ao atualizar a alteracao");
    return data as AlteracaoRegistro;
  }

  let registro = await atualizarPorContrato();
  if (!registro) {
    const { data, error } = await supabase
      .from("alteracoes")
      .insert({ ...patch, contrato_id: contrato.id, titular_id: contrato.titular_id, criado_por: args.autor })
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        registro = await atualizarPorContrato();
        if (!registro) throw new Error("Falha ao registrar a alteracao");
      } else {
        throw new Error("Falha ao registrar a alteracao");
      }
    } else {
      registro = data as AlteracaoRegistro;
    }
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "alteracao.calcular",
    alvo: contrato.id,
    detalhe: {
      excecao_id: excecao.id,
      nova_data_inicio: args.novaDataInicio,
      nova_data_quitacao: plano.novaDataQuitacao,
      num_parcelas: plano.planoProposto.length,
      provisorio: true,
    },
    ip: args.ip ?? null,
  });

  return registro;
}
