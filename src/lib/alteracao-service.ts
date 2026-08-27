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
import { enviarAvisoCronogramaAtualizadoEmail } from "@/lib/email";
import { slugDoTenant } from "@/lib/tenant-slug";
import {
  calcularPlanoDeferral,
  calcularAlteracaoEscopo,
  saldoDevedorMoeda,
  validarPlanoAplicavel,
  renderizarTermoAditivo,
} from "@/lib/parcelas";
import { calcularHashTermo } from "@/lib/termos";

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
  tipo: string;
  status: string;
  moeda: string | null;
  data_inicio_atual: string | null;
  nova_data_inicio: string | null;
  nova_data_quitacao: string | null;
  saldo_devedor: number | null;
  num_parcelas: number | null;
  plano_proposto: { numero: number; vencimento: string; valor: number }[] | null;
  // E3 (escopo); nulos para 'deferral'.
  valor_programa_atual: number | null;
  valor_programa_novo: number | null;
  delta: number | null;
  ja_pago: number | null;
  credito_cliente: number | null;
  sentido: string | null;
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
    tipo: "deferral",
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
      .eq("tipo", "deferral")
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

// Calcula e grava (rascunho) a previa do delta e do plano na ALTERACAO DE
// ESCOPO (E3). O novo valor do programa e informado pela Operacao/Financeiro
// (nao ha motor de preco integrado). Requer um E3 (alteracao_escopo) ATIVO.
// Delta nos dois sentidos: aditivo (delta>0, cobranca complementar via checkout
// — deferido), credito (delta<0; se ja pago superar o novo total, refund a
// apurar no motor de acerto — deferido) ou neutro. NAO reescreve parcelas, NAO
// cobra e NAO devolve — e rascunho revisado. Recalcular atualiza o rascunho.
export async function calcularERegistrarAlteracaoEscopo(args: {
  contratoId: string;
  titularIdEsperado: string;
  valorProgramaNovo: number;
  autor: string;
  ip?: string | null;
}): Promise<AlteracaoRegistro> {
  const novo = Number(args.valorProgramaNovo);
  if (!Number.isFinite(novo) || novo < 0) {
    throw new AlteracaoBloqueada("valor_invalido", "Novo valor do programa invalido");
  }
  const supabase = getSupabase();

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, moeda, data_inicio, valor_total")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!contrato) {
    throw new AlteracaoBloqueada("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (contrato.titular_id !== args.titularIdEsperado) {
    throw new AlteracaoBloqueada("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  const dataInicio = (contrato as { data_inicio?: string | null }).data_inicio ?? null;
  if (!dataISOValida(dataInicio)) {
    throw new AlteracaoBloqueada(
      "sem_data_inicio",
      "O contrato nao tem data de inicio para recalcular o plano"
    );
  }
  // Programa ja iniciado: a data-limite de quitacao (D-30) cairia no passado e o
  // plano recalculado seria enganoso. Recusa em vez de gravar rascunho invalido.
  if (dataInicio <= hojeBrasilISO()) {
    throw new AlteracaoBloqueada(
      "programa_ja_iniciado",
      "O programa ja comecou; nao ha janela para recalcular o plano"
    );
  }

  // Exige um E3 (alteracao de escopo) ativo.
  const { data: excecoes } = await supabase
    .from("case_exceptions")
    .select("id, tipo, aberta_em")
    .eq("contrato_id", args.contratoId)
    .in("status", ["aberta", "em_andamento"])
    .order("aberta_em", { ascending: false });
  const excecao = (excecoes || []).find((e) => e.tipo === "alteracao_escopo");
  if (!excecao) {
    throw new AlteracaoBloqueada(
      "sem_escopo_ativo",
      "Nao ha processo de alteracao de escopo (E3) ativo neste contrato"
    );
  }

  // Ja pago = soma do ledger de pagamentos (moeda do programa) — mesma fonte
  // imutavel do motor de acerto.
  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("valor_programa")
    .eq("contrato_id", args.contratoId);
  const jaPago = (pagamentos || []).reduce(
    (s, p) => s + (Number((p as { valor_programa?: number }).valor_programa) || 0),
    0
  );

  const escopo = calcularAlteracaoEscopo({
    valorProgramaAtual: Number(contrato.valor_total) || 0,
    valorProgramaNovo: novo,
    jaPago,
    dataReferencia: hojeBrasilISO(),
    dataInicio: dataInicio as string,
  });

  const patch = {
    excecao_id: excecao.id,
    tipo: "escopo",
    status: "rascunho",
    data_inicio_atual: dataInicio,
    nova_data_inicio: dataInicio, // E3 nao muda datas nesta fatia
    nova_data_quitacao: escopo.novaDataQuitacao,
    saldo_devedor: escopo.novoSaldo,
    moeda: contrato.moeda || null,
    num_parcelas: escopo.planoProposto.length,
    plano_proposto: escopo.planoProposto,
    valor_programa_atual: escopo.valorProgramaAtual,
    valor_programa_novo: escopo.valorProgramaNovo,
    delta: escopo.delta,
    ja_pago: escopo.jaPago,
    credito_cliente: escopo.creditoCliente,
    sentido: escopo.sentido,
    provisorio: true,
    atualizada_em: new Date().toISOString(),
  };

  async function atualizarPorContrato(): Promise<AlteracaoRegistro | null> {
    const { data: existente } = await supabase
      .from("alteracoes")
      .select("id")
      .eq("contrato_id", args.contratoId)
      .eq("tipo", "escopo")
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
    acao: "alteracao.escopo.calcular",
    alvo: contrato.id,
    detalhe: {
      excecao_id: excecao.id,
      sentido: escopo.sentido,
      delta: escopo.delta,
      credito_cliente: escopo.creditoCliente,
      num_parcelas: escopo.planoProposto.length,
      provisorio: true,
    },
    ip: args.ip ?? null,
  });

  return registro;
}

// ---------------------------------------------------------------------------
// EXECUCAO EM CASCATA (E2/E3): aplica o RASCUNHO revisado
// ---------------------------------------------------------------------------
// Reescreve as parcelas EM ABERTO conforme o plano do rascunho, atualiza o
// contrato (E2: nova data de inicio; E3: novo valor_total) e marca a alteracao
// como aplicada — a escrita e ATOMICA (funcao SQL `aplicar_alteracao`). NAO
// executa refund nem cobra: apenas cria cobrancas a vencer (pagas via webhook).
// Recusa se: nao houver rascunho ativo, a excecao ja tiver sido resolvida, o
// plano estiver desatualizado (soma/vencimento), houver Pix em aberto/disputa,
// ou (E3) houver credito a devolver -> nesse caso encaminha ao motor de acerto.

const MAPA_ERRO_SQL: Record<string, string> = {
  nao_rascunho: "Este rascunho ja foi aplicado ou cancelado",
  alteracao_nao_encontrada: "Rascunho de alteracao nao encontrado",
  contrato_nao_encontrado: "Contrato nao encontrado",
  contrato_cancelado: "O contrato esta cancelado; nao ha cronograma para reescrever",
  pix_em_aberto: "Ha parcela com Pix em aberto; cancele a cobranca antes de aplicar",
  em_disputa: "Ha parcela em disputa; resolva a disputa (E9) antes de aplicar",
  desatualizado: "O plano do rascunho esta desatualizado; recalcule antes de aplicar",
  plano_invalido: "A soma do plano nao confere com o saldo; recalcule",
};

export type AlteracaoAplicada = {
  ok: true;
  antes: unknown;
  depois: unknown;
};

export async function aplicarAlteracao(args: {
  alteracaoId: string;
  titularIdEsperado: string;
  autor: string;
  ip?: string | null;
}): Promise<AlteracaoAplicada> {
  const supabase = getSupabase();

  // Carrega o rascunho.
  const { data: alt } = await supabase
    .from("alteracoes")
    .select(
      "id, contrato_id, tipo, status, moeda, nova_data_inicio, nova_data_quitacao, valor_programa_atual, valor_programa_novo, saldo_devedor, plano_proposto, sentido, credito_cliente, excecao_id, aditivo_aceito_em"
    )
    .eq("id", args.alteracaoId)
    .maybeSingle();
  if (!alt) {
    throw new AlteracaoBloqueada("nao_encontrada", "Rascunho de alteracao nao encontrado");
  }
  if (alt.status !== "rascunho") {
    throw new AlteracaoBloqueada("ja_aplicada", "Este rascunho ja foi aplicado ou cancelado");
  }

  // Posse: o contrato do rascunho precisa ser do titular da URL.
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, valor_total")
    .eq("id", alt.contrato_id)
    .maybeSingle();
  if (!contrato) {
    throw new AlteracaoBloqueada("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (contrato.titular_id !== args.titularIdEsperado) {
    throw new AlteracaoBloqueada("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  // A excecao (E2/E3) precisa continuar ativa — aplicar so faz sentido com o
  // processo aberto.
  const tipoExcecaoEsperado = alt.tipo === "escopo" ? "alteracao_escopo" : "deferral_inicio";
  const { data: excecoes } = await supabase
    .from("case_exceptions")
    .select("id, tipo")
    .eq("contrato_id", alt.contrato_id)
    .in("status", ["aberta", "em_andamento"]);
  if (!(excecoes || []).some((e) => e.tipo === tipoExcecaoEsperado)) {
    throw new AlteracaoBloqueada(
      "excecao_inativa",
      "O processo de alteracao ja foi resolvido; nao ha o que aplicar"
    );
  }

  // E3 com credito a devolver: a cascata nao devolve dinheiro — encaminha ao acerto.
  if (alt.tipo === "escopo" && Number(alt.credito_cliente || 0) > 0) {
    throw new AlteracaoBloqueada(
      "credito_encaminhar_acerto",
      "Ha credito a devolver ao cliente; conduza pelo motor de acerto (refund), nao pela cascata"
    );
  }

  // E3 ADITIVO (delta>0): exige o aceite eletronico do cliente (Fatia E) antes de
  // cobrar o acrescimo. "aceite -> cascata" (doc 01 §4 E3).
  if (alt.tipo === "escopo" && alt.sentido === "aditivo" && !alt.aditivo_aceito_em) {
    throw new AlteracaoBloqueada(
      "sem_aceite_aditivo",
      "O cliente ainda nao aceitou o aditivo de compra; proponha e aguarde o aceite"
    );
  }

  // Novo total e nova data de inicio conforme o tipo.
  const novoTotal =
    alt.tipo === "escopo" ? Number(alt.valor_programa_novo) || 0 : Number(contrato.valor_total) || 0;
  const novaDataInicio = alt.tipo === "escopo" ? null : (alt.nova_data_inicio as string | null);

  // Valida o plano revisado (soma bate, sem vencimento no passado).
  const plano = (alt.plano_proposto || []) as { numero: number; vencimento: string; valor: number }[];
  const saldoEsperado = Number(alt.saldo_devedor) || 0;
  const validacao = validarPlanoAplicavel({
    plano,
    saldoEsperado,
    hojeISO: hojeBrasilISO(),
  });
  if (!validacao.ok) {
    const msg =
      validacao.motivo === "vencimento_no_passado"
        ? "O plano tem vencimento no passado; recalcule antes de aplicar"
        : "O plano do rascunho esta desatualizado; recalcule antes de aplicar";
    throw new AlteracaoBloqueada("plano_desatualizado", msg);
  }

  const expectedValorAtual =
    alt.tipo === "escopo" ? Number(alt.valor_programa_atual) || 0 : 0;

  // Escrita ATOMICA no banco (reescreve parcelas + contrato + marca aplicada +
  // evento + audit, tudo em uma transacao na funcao SQL).
  const { data: resultado, error } = await supabase.rpc("aplicar_alteracao", {
    p_alteracao_id: args.alteracaoId,
    p_tipo: alt.tipo,
    p_expected_saldo: saldoEsperado,
    p_expected_valor_atual: expectedValorAtual,
    p_new_total: novoTotal,
    p_new_data_inicio: novaDataInicio,
    p_parcelas: plano,
    p_autor: args.autor,
    p_ip: args.ip ?? null,
  });
  if (error) {
    // A funcao SQL sinaliza recusas de negocio via message (ex.: 'pix_em_aberto').
    // Casa por substring para tolerar prefixo do PostgREST.
    const msg = String((error as { message?: string }).message || "");
    const codigo = Object.keys(MAPA_ERRO_SQL).find((c) => msg.includes(c));
    if (codigo) {
      throw new AlteracaoBloqueada(codigo, MAPA_ERRO_SQL[codigo]);
    }
    console.error("[alteracao] falha ao aplicar a cascata");
    throw new Error("Falha ao aplicar a alteracao");
  }

  // Notificacao ao cliente (doc 04): resumo do novo cronograma. Best-effort — a
  // alteracao ja foi aplicada e commitada; falha de e-mail NAO derruba a acao.
  try {
    const { data: titular } = await supabase
      .from("titulares")
      .select("nome_completo, email, tenant_id")
      .eq("id", contrato.titular_id)
      .maybeSingle();
    const email = (titular as { email?: string | null } | null)?.email;
    if (email) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
      const slug = await slugDoTenant(supabase, (titular as { tenant_id?: string | null }).tenant_id);
      await enviarAvisoCronogramaAtualizadoEmail(email, (titular as { nome_completo?: string }).nome_completo || "", {
        tipo: alt.tipo === "escopo" ? "escopo" : "deferral",
        moeda: (alt.moeda as string) || "BRL",
        novaDataInicio: alt.tipo === "escopo" ? null : (novaDataInicio as string | null),
        novoValorTotal: alt.tipo === "escopo" ? novoTotal : null,
        novaDataQuitacao: (alt.nova_data_quitacao as string | null) ?? null,
        parcelas: plano,
        portalUrl: appUrl || null,
      }, slug);
    }
  } catch {
    console.error("[alteracao] falha ao notificar o cliente sobre o novo cronograma");
  }

  const res = (resultado || {}) as { antes?: unknown; depois?: unknown };
  return { ok: true, antes: res.antes ?? null, depois: res.depois ?? null };
}

// ---------------------------------------------------------------------------
// FATIA E: aditivo de compra (E3 delta>0) — camada de ACEITE (sem cobranca nova)
// ---------------------------------------------------------------------------
// O dinheiro do delta continua sendo cobrado pela cascata (folding nas parcelas
// a vencer). Esta camada registra o CONSENTIMENTO eletronico do cliente para o
// upgrade/extensao (aditivo de compra), reusando termos/aceites, e serve de
// GATE: a cascata do E3 aditivo recusa aplicar sem o aceite.

async function gravarEventoAlteracao(
  supabase: SupabaseClient,
  idempotencyKey: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from("events").insert({
      source: "portal",
      event_type: eventType,
      idempotency_key: idempotencyKey,
      payload,
      status: "processado",
      processed_at: new Date().toISOString(),
    });
    if (error && (error as { code?: string }).code !== "23505") {
      console.error("[aditivo] falha ao gravar evento");
    }
  } catch {
    console.error("[aditivo] falha ao gravar evento");
  }
}

// ADMIN (casos.gerir): propoe o aditivo de compra ao cliente. Renderiza o Termo
// de Aditivo (texto + hash) e o expoe na Area do Cliente para aceite. Exige um
// rascunho E3 com sentido 'aditivo' (delta>0).
export async function proporAditivo(args: {
  alteracaoId: string;
  titularIdEsperado: string;
  autor: string;
  ip?: string | null;
}): Promise<{ ok: true }> {
  const supabase = getSupabase();

  const { data: alt } = await supabase
    .from("alteracoes")
    .select(
      "id, contrato_id, tipo, status, sentido, moeda, valor_programa_atual, valor_programa_novo, delta, plano_proposto, aditivo_aceito_em"
    )
    .eq("id", args.alteracaoId)
    .maybeSingle();
  if (!alt || alt.tipo !== "escopo") {
    throw new AlteracaoBloqueada("nao_encontrada", "Rascunho de alteracao de escopo nao encontrado");
  }
  if (alt.status !== "rascunho") {
    throw new AlteracaoBloqueada("ja_aplicada", "Este rascunho ja foi aplicado ou cancelado");
  }
  if (alt.aditivo_aceito_em) {
    throw new AlteracaoBloqueada("ja_aceito", "O cliente ja aceitou este aditivo");
  }
  if (alt.sentido !== "aditivo" || Number(alt.delta || 0) <= 0) {
    throw new AlteracaoBloqueada("sem_aditivo", "So ha aditivo a aceitar quando o delta e positivo");
  }

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", alt.contrato_id)
    .maybeSingle();
  if (!contrato) throw new AlteracaoBloqueada("contrato_nao_encontrado", "Contrato nao encontrado");
  if (contrato.titular_id !== args.titularIdEsperado) {
    throw new AlteracaoBloqueada("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  const conteudo = renderizarTermoAditivo({
    moeda: (alt.moeda as string) || "BRL",
    valorProgramaAtual: Number(alt.valor_programa_atual) || 0,
    valorProgramaNovo: Number(alt.valor_programa_novo) || 0,
    delta: Number(alt.delta) || 0,
    planoProposto: (alt.plano_proposto as { numero: number; vencimento: string; valor: number }[]) || [],
  });
  const hash = calcularHashTermo(conteudo);
  const versao = `aditivo:${args.alteracaoId}`;

  let termoId: string | null = null;
  const { data: ins, error } = await supabase
    .from("termos")
    .insert({ tipo: "aditivo", versao, conteudo, hash, ativo: true })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const { data: upd } = await supabase
        .from("termos")
        .update({ conteudo, hash })
        .eq("tipo", "aditivo")
        .eq("versao", versao)
        .select("id")
        .single();
      termoId = (upd as { id?: string } | null)?.id ?? null;
    } else {
      throw new Error("Falha ao gravar o termo de aditivo");
    }
  } else {
    termoId = (ins as { id?: string } | null)?.id ?? null;
  }
  if (!termoId) throw new Error("Falha ao vincular o termo de aditivo");

  const { data: reg, error: updErr } = await supabase
    .from("alteracoes")
    .update({
      aditivo_termo_id: termoId,
      aditivo_proposto_em: new Date().toISOString(),
      atualizada_em: new Date().toISOString(),
    })
    .eq("id", args.alteracaoId)
    .eq("status", "rascunho")
    .select("id")
    .maybeSingle();
  if (!reg && !updErr) {
    throw new AlteracaoBloqueada("ja_aplicada", "O rascunho nao esta mais disponivel");
  }

  await gravarEventoAlteracao(supabase, `aditivo:propor:${args.alteracaoId}`, "aditivo_proposto", {
    alteracao_id: args.alteracaoId,
    termo_id: termoId,
    hash,
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "aditivo.propor",
    alvo: contrato.id,
    detalhe: { alteracao_id: args.alteracaoId, termo_id: termoId, delta: Number(alt.delta) || 0 },
    ip: args.ip ?? null,
  });

  return { ok: true };
}

// CLIENTE (sessao do titular): aceita o aditivo de compra. Grava a prova em
// `aceites` e marca `aditivo_aceito_em`. NAO cobra (o delta e cobrado pela
// cascata). So o titular dono do contrato.
export async function aceitarAditivo(args: {
  alteracaoId: string;
  titularId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true; jaAceito: boolean }> {
  const supabase = getSupabase();

  const { data: alt } = await supabase
    .from("alteracoes")
    .select("id, contrato_id, tipo, status, aditivo_termo_id")
    .eq("id", args.alteracaoId)
    .maybeSingle();
  if (!alt || alt.tipo !== "escopo") {
    throw new AlteracaoBloqueada("nao_encontrada", "Aditivo nao encontrado");
  }
  // Nao registra consentimento sobre um rascunho ja aplicado/cancelado (prova
  // ficaria ligada a uma alteracao que nao existe mais).
  if (alt.status !== "rascunho") {
    throw new AlteracaoBloqueada("nao_rascunho", "Esta alteracao nao esta mais disponivel para aceite");
  }

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", alt.contrato_id)
    .maybeSingle();
  if (!contrato || contrato.titular_id !== args.titularId) {
    throw new AlteracaoBloqueada("nao_autorizado", "Aditivo nao pertence a este titular");
  }

  const termoId = alt.aditivo_termo_id as string | null;
  if (!termoId) {
    throw new AlteracaoBloqueada("sem_termo", "Aditivo sem termo para aceitar");
  }

  async function afirmarAceito(): Promise<void> {
    await supabase
      .from("alteracoes")
      .update({ aditivo_aceito_em: new Date().toISOString(), atualizada_em: new Date().toISOString() })
      .eq("id", args.alteracaoId)
      .is("aditivo_aceito_em", null);
  }

  const { data: existente } = await supabase
    .from("aceites")
    .select("id")
    .eq("titular_id", args.titularId)
    .eq("termo_id", termoId)
    .maybeSingle();
  if (existente) {
    await afirmarAceito();
    return { ok: true, jaAceito: true };
  }

  const { data: termo } = await supabase
    .from("termos")
    .select("id, versao, hash, conteudo")
    .eq("id", termoId)
    .maybeSingle();
  if (!termo) throw new AlteracaoBloqueada("sem_termo", "Termo do aditivo nao encontrado");
  const conteudo = (termo as { conteudo?: string | null }).conteudo || "";
  const hashConteudo = conteudo ? calcularHashTermo(conteudo) : (termo as { hash?: string }).hash ?? "";

  const { error: insErr } = await supabase.from("aceites").insert({
    titular_id: args.titularId,
    termo_id: termoId,
    proposta_id: args.alteracaoId,
    versao: (termo as { versao?: string }).versao ?? "aditivo",
    hash_conteudo: hashConteudo,
    contexto: "area_cliente",
    ip: args.ip ?? null,
    user_agent: args.userAgent ?? null,
  });
  if (insErr && (insErr as { code?: string }).code !== "23505") {
    throw new Error("Falha ao registrar o aceite");
  }

  await afirmarAceito();
  await gravarEventoAlteracao(supabase, `aditivo:aceitar:${args.alteracaoId}`, "aditivo_aceito", {
    alteracao_id: args.alteracaoId,
    termo_id: termoId,
  });

  return { ok: true, jaAceito: false };
}
