// NB: modulo server-only (service role). So deve ser importado por rotas e
// server components — NUNCA por codigo client.
//
// Servico do motor de ACERTO (doc 01 §4 E4/E5/E6/E7; doc 07 §3.5). NESTE passo:
// calcula o acerto de um contrato em processo de cancelamento e grava um
// RASCUNHO (com a memoria de calculo) para o Financeiro revisar. NAO propoe ao
// cliente, NAO coleta aceite e NAO executa refund (marcos proprios; dinheiro so
// muda por webhook confirmado). As regras de retencao sao PLACEHOLDER
// (provisorio=true) ate a config real (validacao juridica).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import { diasAteInicio } from "@/lib/caso";
import { labelTipoExcecao } from "@/lib/excecao";
import {
  calcularAcerto,
  calcularAcertoCreditoEscopo,
  determinarRetencaoPercentual,
  type Acerto,
} from "@/lib/acerto";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export class AcertoBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "AcertoBloqueado";
    this.codigo = codigo;
  }
}

// Tipos de excecao que originam um acerto (cancelamento/interrupcao).
const TIPOS_ACERTO = new Set<string>([
  "cancelamento_cliente",
  "cancelamento_inadimplencia",
  "cancelamento_escola",
  "interrupcao_programa",
]);

export type AcertoRegistro = {
  id: string;
  tipo_cancelamento: string | null;
  moeda: string | null;
  valor_total: number | null;
  total_pago: number | null;
  retencao_percentual: number | null;
  retencao_valor: number | null;
  refund_escola_esperado: number | null;
  saldo_devolver_cliente: number | null;
  memoria: Acerto["memoria"] | null;
  provisorio: boolean;
  status: string;
};

// Calcula e grava (rascunho) o acerto de um contrato. Requer uma excecao de
// cancelamento ATIVA no contrato (o acerto acompanha um processo em curso). O
// contrato precisa ser do titular da URL (posse). Recalcular atualiza o rascunho.
export async function calcularERegistrarAcerto(args: {
  contratoId: string;
  titularIdEsperado?: string;
  refundEscolaEsperado?: number | null;
  autor: string;
  ip?: string | null;
}): Promise<AcertoRegistro> {
  const supabase = getSupabase();

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, valor_total, moeda, data_inicio")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!contrato) {
    throw new AcertoBloqueado("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (args.titularIdEsperado && contrato.titular_id !== args.titularIdEsperado) {
    throw new AcertoBloqueado("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  // Excecao de cancelamento ATIVA que origina o acerto (a mais recente).
  const { data: excecoes } = await supabase
    .from("case_exceptions")
    .select("id, tipo, aberta_em")
    .eq("contrato_id", args.contratoId)
    .in("status", ["aberta", "em_andamento"])
    .order("aberta_em", { ascending: false });
  const excecao = (excecoes || []).find((e) => TIPOS_ACERTO.has(e.tipo as string));
  if (!excecao) {
    throw new AcertoBloqueado(
      "sem_cancelamento_ativo",
      "Nao ha processo de cancelamento ativo neste contrato (abra E4/E5/E6/E7 antes)"
    );
  }
  const excecaoIdAlvo: string = excecao.id; // local (evita perda de narrowing na closure)

  // Total pago = soma do ledger de pagamentos (moeda do programa) — fonte
  // imutavel da "fotografia" de cada pagamento.
  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("valor_programa")
    .eq("contrato_id", args.contratoId);
  const totalPago = (pagamentos || []).reduce(
    (s, p) => s + (Number((p as { valor_programa?: number }).valor_programa) || 0),
    0
  );

  // Dias ate o inicio (para a faixa de retencao). A data canonica e a do
  // CONTRATO (titular so como fallback) — mesmo criterio do resto do codigo
  // (inicio/regua). O acerto e por contrato, entao usar a do titular daria a
  // faixa errada em titular multi-contrato.
  const { data: titular } = await supabase
    .from("titulares")
    .select("data_inicio")
    .eq("id", contrato.titular_id)
    .maybeSingle();
  const dataInicio =
    (contrato as { data_inicio?: string | null }).data_inicio ??
    (titular as { data_inicio?: string | null })?.data_inicio ??
    null;
  const dias = diasAteInicio(dataInicio, hojeBrasilISO());

  const tipo = excecao.tipo as string;
  const retencaoPercentual = determinarRetencaoPercentual(tipo, dias ?? 0);
  const acerto = calcularAcerto({
    valorTotal: Number(contrato.valor_total) || 0,
    totalPago,
    retencaoPercentual,
    refundEscolaEsperado: Math.max(0, Number(args.refundEscolaEsperado) || 0),
  });

  // Campos recalculados (comuns a insert e update). criado_por NAO entra no
  // update — quem recalcula nao vira "criador" do rascunho (a trilha real fica
  // no audit_log).
  const patch = {
    excecao_id: excecao.id,
    tipo_cancelamento: tipo,
    status: "rascunho",
    moeda: contrato.moeda || null,
    valor_total: Number(contrato.valor_total) || 0,
    total_pago: totalPago,
    retencao_percentual: acerto.retencaoPercentual,
    retencao_valor: acerto.retencaoValor,
    refund_escola_esperado: acerto.refundEscolaEsperado,
    saldo_devolver_cliente: acerto.saldoDevolverCliente,
    memoria: acerto.memoria,
    provisorio: true, // regras placeholder ate a config real
    atualizada_em: new Date().toISOString(),
  };

  async function atualizarPorContrato(): Promise<AcertoRegistro | null> {
    const { data: existente, error: selErr } = await supabase
      .from("acertos")
      .select("id")
      .eq("contrato_id", args.contratoId)
      .eq("excecao_id", excecaoIdAlvo)
      .eq("status", "rascunho")
      .maybeSingle();
    if (selErr || !existente?.id) return null;
    const { data, error } = await supabase
      .from("acertos")
      .update(patch)
      .eq("id", existente.id)
      .select("*")
      .single();
    if (error || !data) throw new Error("Falha ao atualizar o acerto");
    return data as AcertoRegistro;
  }

  // Recalcular atualiza o rascunho existente; senao insere. O indice unico
  // parcial (contrato_id where status='rascunho') impede duplicata; uma corrida
  // no insert (23505) cai no update do rascunho recem-criado.
  let registro = await atualizarPorContrato();
  if (!registro) {
    const { data, error } = await supabase
      .from("acertos")
      .insert({ ...patch, contrato_id: contrato.id, titular_id: contrato.titular_id, criado_por: args.autor })
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        registro = await atualizarPorContrato();
        if (!registro) throw new Error("Falha ao registrar o acerto");
      } else {
        throw new Error("Falha ao registrar o acerto");
      }
    } else {
      registro = data as AcertoRegistro;
    }
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "acerto.calcular",
    alvo: contrato.id,
    detalhe: {
      excecao_id: excecao.id,
      tipo: labelTipoExcecao(tipo),
      retencao_percentual: acerto.retencaoPercentual,
      saldo_devolver: acerto.saldoDevolverCliente,
      provisorio: true,
    },
    ip: args.ip ?? null,
  });

  return registro;
}

// Gera (rascunho) o acerto de CREDITO de uma alteracao de escopo (E3 downgrade):
// o cliente pagou a mais do que o novo valor do programa e o excedente vira um
// refund a apurar. Reusa a tabela `acertos` (sem retencao) para o Financeiro
// revisar na mesma superficie dos cancelamentos. NAO executa refund (dinheiro so
// muda por webhook; a execucao e o marco proprio do motor de acerto, fatias 2+).
// Requer um E3 (alteracao_escopo) ATIVO e o rascunho de escopo. Posse por titular.
export async function gerarAcertoCreditoEscopo(args: {
  alteracaoId: string;
  titularIdEsperado: string;
  autor: string;
  ip?: string | null;
}): Promise<AcertoRegistro> {
  const supabase = getSupabase();

  const { data: alt } = await supabase
    .from("alteracoes")
    .select("id, contrato_id, tipo, status, moeda, valor_programa_novo, excecao_id")
    .eq("id", args.alteracaoId)
    .maybeSingle();
  if (!alt || alt.tipo !== "escopo") {
    throw new AcertoBloqueado(
      "alteracao_nao_encontrada",
      "Rascunho de alteracao de escopo nao encontrado"
    );
  }
  if (alt.status !== "rascunho") {
    throw new AcertoBloqueado(
      "alteracao_nao_rascunho",
      "A alteracao de escopo ja foi aplicada ou cancelada"
    );
  }

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, moeda")
    .eq("id", alt.contrato_id)
    .maybeSingle();
  if (!contrato) {
    throw new AcertoBloqueado("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (contrato.titular_id !== args.titularIdEsperado) {
    throw new AcertoBloqueado("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }
  // Locais primitivos (evita perda de narrowing dentro da closure de upsert).
  const contratoIdAlvo: string = contrato.id;

  // Exige um E3 (alteracao de escopo) ativo — o acerto acompanha o processo.
  const { data: excecoes } = await supabase
    .from("case_exceptions")
    .select("id, tipo")
    .eq("contrato_id", contratoIdAlvo)
    .in("status", ["aberta", "em_andamento"]);
  const excecao = (excecoes || []).find((e) => e.tipo === "alteracao_escopo");
  if (!excecao) {
    throw new AcertoBloqueado(
      "sem_escopo_ativo",
      "Nao ha alteracao de escopo (E3) ativa neste contrato"
    );
  }
  const excecaoIdAlvo: string = excecao.id; // local (evita perda de narrowing na closure)

  // Ja pago = ledger de pagamentos (moeda do programa) — mesma fonte do acerto.
  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("valor_programa")
    .eq("contrato_id", contratoIdAlvo);
  const jaPago = (pagamentos || []).reduce(
    (s, p) => s + (Number((p as { valor_programa?: number }).valor_programa) || 0),
    0
  );

  const novoValor = Number(alt.valor_programa_novo) || 0;
  const credito = calcularAcertoCreditoEscopo({ valorProgramaNovo: novoValor, jaPago });
  if (credito.creditoDevolver <= 0) {
    throw new AcertoBloqueado(
      "sem_credito",
      "Nao ha credito a devolver (o pago nao supera o novo valor do programa)"
    );
  }

  const patch = {
    excecao_id: excecao.id,
    tipo_cancelamento: "alteracao_escopo",
    status: "rascunho",
    moeda: (alt.moeda as string) || contrato.moeda || null,
    valor_total: credito.valorProgramaNovo,
    total_pago: credito.totalPago,
    retencao_percentual: 0,
    retencao_valor: 0,
    refund_escola_esperado: 0,
    saldo_devolver_cliente: credito.creditoDevolver,
    memoria: credito.memoria,
    provisorio: true,
    atualizada_em: new Date().toISOString(),
  };

  async function atualizarPorContrato(): Promise<AcertoRegistro | null> {
    const { data: existente, error: selErr } = await supabase
      .from("acertos")
      .select("id")
      .eq("contrato_id", contratoIdAlvo)
      .eq("excecao_id", excecaoIdAlvo)
      .eq("status", "rascunho")
      .maybeSingle();
    if (selErr || !existente?.id) return null;
    const { data, error } = await supabase
      .from("acertos")
      .update(patch)
      .eq("id", existente.id)
      .select("*")
      .single();
    if (error || !data) throw new Error("Falha ao atualizar o acerto");
    return data as AcertoRegistro;
  }

  let registro = await atualizarPorContrato();
  if (!registro) {
    const { data, error } = await supabase
      .from("acertos")
      .insert({ ...patch, contrato_id: contrato.id, titular_id: contrato.titular_id, criado_por: args.autor })
      .select("*")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        registro = await atualizarPorContrato();
        if (!registro) throw new Error("Falha ao registrar o acerto");
      } else {
        throw new Error("Falha ao registrar o acerto");
      }
    } else {
      registro = data as AcertoRegistro;
    }
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "acerto.credito_escopo.calcular",
    alvo: contrato.id,
    detalhe: {
      excecao_id: excecao.id,
      alteracao_id: alt.id,
      credito_devolver: credito.creditoDevolver,
      provisorio: true,
    },
    ip: args.ip ?? null,
  });

  return registro;
}
