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
  validarFaixasRetencao,
  renderizarTermoAcerto,
  transicaoAcertoPermitida,
  planejarRefund,
  refundConfirmadoNoMP,
  todosEstornosConfirmados,
  DEFAULT_JANELA_REFUND_DIAS,
  RETENCAO_PLACEHOLDER,
  TIPOS_SEM_RETENCAO_PADRAO,
  type Acerto,
  type FaixaRetencao,
  type PlanoRefund,
} from "@/lib/acerto";
import { calcularHashTermo } from "@/lib/termos";
import { refundPayment, consultarRefund } from "@/lib/mercadopago";
import { enviarReciboDevolucaoEmail } from "@/lib/email";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Config de retencao por instancia (Fatia A). Le a linha vigente; se ausente ou
// invalida, cai no PLACEHOLDER e mantem provisorio=true. `provisorio` reflete se
// as regras ja foram validadas juridicamente.
export type ConfigRetencao = {
  faixas: FaixaRetencao[];
  tiposSemRetencao: string[];
  provisorio: boolean;
};

export async function carregarConfigRetencao(supabase: SupabaseClient): Promise<ConfigRetencao> {
  const { data } = await supabase
    .from("config_retencao")
    .select("faixas, tipos_sem_retencao, validado_juridicamente")
    .eq("vigente", true)
    .maybeSingle();
  const faixas = (data as { faixas?: unknown } | null)?.faixas;
  // Config ausente OU malformada (ex.: gravada direto no SQL Editor) cai no
  // placeholder + provisorio=true. Validar aqui evita retencao 0% silenciosa
  // (over-refund) sem o aviso de provisorio.
  if (!data || !validarFaixasRetencao(faixas).ok) {
    return {
      faixas: RETENCAO_PLACEHOLDER,
      tiposSemRetencao: [...TIPOS_SEM_RETENCAO_PADRAO],
      provisorio: true,
    };
  }
  const tipos = (data as { tipos_sem_retencao?: unknown }).tipos_sem_retencao;
  return {
    faixas: faixas as FaixaRetencao[],
    tiposSemRetencao: Array.isArray(tipos) ? (tipos as string[]) : [],
    provisorio: !(data as { validado_juridicamente?: boolean }).validado_juridicamente,
  };
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

  // Faixas de retencao da CONFIG por instancia (Fatia A) — nao mais hardcoded.
  const config = await carregarConfigRetencao(supabase);
  const tipo = excecao.tipo as string;
  const retencaoPercentual = determinarRetencaoPercentual(
    tipo,
    dias ?? 0,
    config.faixas,
    config.tiposSemRetencao
  );
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
    provisorio: config.provisorio, // false quando a retencao ja foi validada juridicamente
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
      provisorio: config.provisorio,
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

// ---------------------------------------------------------------------------
// FATIA B: proposta ao cliente + aceite eletronico (sem dinheiro)
// ---------------------------------------------------------------------------

// Grava (idempotente) um evento no ledger `events`. Best-effort: tolera a
// colisao de idempotency_key (23505) e nunca derruba a transicao.
async function gravarEventoAcerto(
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
      console.error("[acerto] falha ao gravar evento");
    }
  } catch {
    console.error("[acerto] falha ao gravar evento");
  }
}

// ADMIN (financeiro.gerir): propoe o acerto ao cliente. rascunho -> proposto.
// Renderiza o Termo de Acerto (texto + hash), grava/atualiza a versao em `termos`
// (tipo 'acerto') e vincula ao acerto. NAO move dinheiro.
export async function proporAcerto(args: {
  acertoId: string;
  titularIdEsperado: string;
  autor: string;
  ip?: string | null;
}): Promise<AcertoRegistro> {
  const supabase = getSupabase();

  const { data: acerto } = await supabase
    .from("acertos")
    .select("id, contrato_id, status, moeda, saldo_devolver_cliente, memoria, provisorio")
    .eq("id", args.acertoId)
    .maybeSingle();
  if (!acerto) {
    throw new AcertoBloqueado("acerto_nao_encontrado", "Acerto nao encontrado");
  }

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", acerto.contrato_id)
    .maybeSingle();
  if (!contrato) {
    throw new AcertoBloqueado("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (contrato.titular_id !== args.titularIdEsperado) {
    throw new AcertoBloqueado("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  if (!transicaoAcertoPermitida(String(acerto.status), "proposto")) {
    throw new AcertoBloqueado(
      "transicao_invalida",
      "So um acerto em rascunho pode ser proposto ao cliente"
    );
  }

  // Renderiza o termo + hash (prova do que sera aceito).
  const conteudo = renderizarTermoAcerto({
    moeda: (acerto.moeda as string) || "BRL",
    memoria: (acerto.memoria as Acerto["memoria"]) || [],
    saldoDevolverCliente: Number(acerto.saldo_devolver_cliente) || 0,
    provisorio: !!acerto.provisorio,
  });
  const hash = calcularHashTermo(conteudo);
  const versao = `acerto:${args.acertoId}`;

  // Upsert do termo (tipo 'acerto', unico por (tipo, versao)).
  let termoId: string | null = null;
  {
    const { data: ins, error } = await supabase
      .from("termos")
      .insert({ tipo: "acerto", versao, conteudo, hash, ativo: true })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        const { data: upd } = await supabase
          .from("termos")
          .update({ conteudo, hash })
          .eq("tipo", "acerto")
          .eq("versao", versao)
          .select("id")
          .single();
        termoId = upd?.id ?? null;
      } else {
        throw new Error("Falha ao gravar o termo de acerto");
      }
    } else {
      termoId = ins?.id ?? null;
    }
  }
  if (!termoId) throw new Error("Falha ao vincular o termo de acerto");

  const { data: registro, error: updErr } = await supabase
    .from("acertos")
    .update({
      status: "proposto",
      proposto_em: new Date().toISOString(),
      termo_id: termoId,
      atualizada_em: new Date().toISOString(),
    })
    .eq("id", args.acertoId)
    .eq("status", "rascunho") // guarda de corrida: so avança de rascunho
    .select("*")
    .single();
  if (updErr || !registro) {
    throw new AcertoBloqueado("transicao_invalida", "O acerto nao esta mais em rascunho");
  }

  await gravarEventoAcerto(supabase, `acerto:propor:${args.acertoId}`, "acerto_proposto", {
    acerto_id: args.acertoId,
    termo_id: termoId,
    hash,
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "acerto.propor",
    alvo: contrato.id,
    detalhe: { acerto_id: args.acertoId, termo_id: termoId },
    ip: args.ip ?? null,
  });

  return registro as AcertoRegistro;
}

// CLIENTE (sessao do titular): aceita o acerto proposto. proposto -> aceito.
// Grava a prova imutavel em `aceites` (hash/ip/ua) e avança o acerto. NAO move
// dinheiro (a execucao do refund e um marco proprio).
export type AceiteAcerto = { ok: true; jaAceito: boolean; aceiteEm: string | null };

export async function aceitarAcerto(args: {
  acertoId: string;
  titularId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<AceiteAcerto> {
  const supabase = getSupabase();

  const { data: acerto } = await supabase
    .from("acertos")
    .select("id, contrato_id, status, termo_id")
    .eq("id", args.acertoId)
    .maybeSingle();
  if (!acerto) {
    throw new AcertoBloqueado("acerto_nao_encontrado", "Acerto nao encontrado");
  }

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", acerto.contrato_id)
    .maybeSingle();
  if (!contrato || contrato.titular_id !== args.titularId) {
    throw new AcertoBloqueado("nao_autorizado", "Acerto nao pertence a este titular");
  }

  const termoId = acerto.termo_id as string | null;
  if (!termoId) {
    throw new AcertoBloqueado("sem_termo", "Proposta sem termo para aceitar");
  }

  // Converge o status para 'aceito' (idempotente): so avança de 'proposto', nunca
  // reescreve um estado terminal. Usado tanto no fluxo normal quanto quando a
  // prova ja existe mas o status ficou preso em 'proposto'.
  async function afirmarAceito(): Promise<void> {
    await supabase
      .from("acertos")
      .update({ status: "aceito", aceito_em: new Date().toISOString(), atualizada_em: new Date().toISOString() })
      .eq("id", args.acertoId)
      .eq("status", "proposto");
  }

  // Idempotente: se ja aceitou este termo, nao duplica a prova — so reafirma o
  // status (caso tenha ficado preso em proposto) e retorna.
  const { data: existente } = await supabase
    .from("aceites")
    .select("id, data_hora")
    .eq("titular_id", args.titularId)
    .eq("termo_id", termoId)
    .maybeSingle();
  if (existente) {
    await afirmarAceito();
    return { ok: true, jaAceito: true, aceiteEm: (existente as { data_hora?: string }).data_hora ?? null };
  }

  if (!transicaoAcertoPermitida(String(acerto.status), "aceito")) {
    throw new AcertoBloqueado("transicao_invalida", "Esta proposta nao esta mais disponivel para aceite");
  }

  // Recalcula o hash sobre o conteudo do termo (prova auto-consistente).
  const { data: termo } = await supabase
    .from("termos")
    .select("id, versao, hash, conteudo")
    .eq("id", termoId)
    .maybeSingle();
  if (!termo) {
    throw new AcertoBloqueado("sem_termo", "Termo do acerto nao encontrado");
  }
  const conteudo = (termo as { conteudo?: string | null }).conteudo || "";
  const hashConteudo = conteudo ? calcularHashTermo(conteudo) : (termo as { hash?: string }).hash ?? "";

  const { data: novo, error: insErr } = await supabase
    .from("aceites")
    .insert({
      titular_id: args.titularId,
      termo_id: termoId,
      proposta_id: args.acertoId,
      versao: (termo as { versao?: string }).versao ?? "acerto",
      hash_conteudo: hashConteudo,
      contexto: "area_cliente",
      ip: args.ip ?? null,
      user_agent: args.userAgent ?? null,
    })
    .select("id, data_hora")
    .single();
  if (insErr) {
    // Corrida (duplo-clique/retry): a prova ja foi gravada por outra requisicao.
    if ((insErr as { code?: string }).code === "23505") {
      await afirmarAceito();
      const { data: existe2 } = await supabase
        .from("aceites")
        .select("data_hora")
        .eq("titular_id", args.titularId)
        .eq("termo_id", termoId)
        .maybeSingle();
      return { ok: true, jaAceito: true, aceiteEm: (existe2 as { data_hora?: string } | null)?.data_hora ?? null };
    }
    throw new Error("Falha ao registrar o aceite");
  }
  if (!novo) throw new Error("Falha ao registrar o aceite");

  await afirmarAceito();

  await gravarEventoAcerto(supabase, `acerto:aceitar:${args.acertoId}`, "acerto_aceito", {
    acerto_id: args.acertoId,
    termo_id: termoId,
  });

  return { ok: true, jaAceito: false, aceiteEm: (novo as { data_hora?: string }).data_hora ?? null };
}

// ---------------------------------------------------------------------------
// FATIA C: previa do refund (READ-ONLY, nao move dinheiro nem grava estorno)
// ---------------------------------------------------------------------------
// Mostra ao Financeiro o plano de estorno de um acerto ACEITO: fracao em BRL,
// meio (mp/manual + motivo) e o particionamento entre os pagamentos originais.
// A execucao (disparar o refund + confirmar por webhook) e a Fatia D.
function janelaRefundDias(): number {
  const n = Number(process.env.MP_REFUND_JANELA_DIAS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_JANELA_REFUND_DIAS;
}

export async function planejarRefundAcerto(args: {
  acertoId: string;
  titularIdEsperado: string;
}): Promise<PlanoRefund> {
  const supabase = getSupabase();

  const { data: acerto } = await supabase
    .from("acertos")
    .select("id, contrato_id, status, saldo_devolver_cliente, total_pago")
    .eq("id", args.acertoId)
    .maybeSingle();
  if (!acerto) {
    throw new AcertoBloqueado("acerto_nao_encontrado", "Acerto nao encontrado");
  }

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", acerto.contrato_id)
    .maybeSingle();
  if (!contrato || contrato.titular_id !== args.titularIdEsperado) {
    throw new AcertoBloqueado("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  if (acerto.status !== "aceito") {
    throw new AcertoBloqueado(
      "nao_aceito",
      "A previa de estorno so vale para um acerto aceito pelo cliente"
    );
  }

  // Pagamentos do contrato (ledger) + flag de disputa (vem da parcela).
  const { data: pagamentos } = await supabase
    .from("pagamentos")
    .select("id, external_payment_id, valor_brl, valor_programa, pago_em, parcela_id")
    .eq("contrato_id", acerto.contrato_id);
  // Base do calculo: total pago na moeda vem do MESMO conjunto de pagamentos que
  // fornece o BRL (auto-consistente), e nao de acerto.total_pago (que pode ter
  // sido computado sobre outro instantaneo do ledger).
  const totalPagoLedger = (pagamentos || []).reduce(
    (s, p) => s + (Number((p as { valor_programa?: number }).valor_programa) || 0),
    0
  );
  const parcelaIds = Array.from(
    new Set((pagamentos || []).map((p) => (p as { parcela_id?: string }).parcela_id).filter(Boolean))
  ) as string[];
  const emDisputaPorParcela = new Set<string>();
  if (parcelaIds.length > 0) {
    const { data: parcelas } = await supabase
      .from("parcelas")
      .select("id, em_disputa")
      .in("id", parcelaIds);
    for (const p of parcelas || []) {
      if ((p as { em_disputa?: boolean }).em_disputa) emDisputaPorParcela.add((p as { id: string }).id);
    }
  }

  const plano = planejarRefund({
    saldoDevolver: Number(acerto.saldo_devolver_cliente) || 0,
    totalPago: totalPagoLedger,
    pagamentos: (pagamentos || []).map((p) => {
      const row = p as {
        id: string;
        external_payment_id?: string | null;
        valor_brl?: number;
        pago_em?: string;
        parcela_id?: string;
      };
      return {
        id: row.id,
        externalPaymentId: row.external_payment_id ?? null,
        valorBRL: Number(row.valor_brl) || 0,
        emDisputa: row.parcela_id ? emDisputaPorParcela.has(row.parcela_id) : false,
        pagoEmISO: (row.pago_em || "").slice(0, 10),
      };
    }),
    hojeISO: hojeBrasilISO(),
    janelaDias: janelaRefundDias(),
  });

  return plano;
}

// ---------------------------------------------------------------------------
// FATIA D: execucao do estorno (money out) — confirmada por reconsulta ao MP
// ---------------------------------------------------------------------------
// Guardas de dinheiro: so acerto ACEITO, NAO provisorio (retencao validada),
// posse por titular, sessao financeiro.gerir (na rota, sem Bearer). Dispara o(s)
// estorno(s) via MP (idempotente por X-Idempotency-Key + unique do ledger) e so
// marca `executado` quando TODOS os estornos estao confirmados. Devolucao MANUAL
// nao dispara MP: registra a intencao e aguarda confirmacao com comprovante.

// Notifica o cliente (best-effort) e, quando todos os estornos confirmam, marca
// o acerto como executado.
async function finalizarAcertoSeConfirmado(
  supabase: SupabaseClient,
  acertoId: string,
  contratoId: string
): Promise<boolean> {
  const { data: estornos } = await supabase
    .from("estornos")
    .select("status, valor_brl, meio")
    .eq("acerto_id", acertoId);
  const lista = (estornos || []) as { status: string; valor_brl: number | null; meio: string }[];
  if (!todosEstornosConfirmados(lista)) return false;

  const { data: upd } = await supabase
    .from("acertos")
    .update({ status: "executado", executado_em: new Date().toISOString(), atualizada_em: new Date().toISOString() })
    .eq("id", acertoId)
    .eq("status", "aceito") // guarda de corrida: so aceito -> executado
    .select("id")
    .maybeSingle();
  if (!upd) return false; // outra execucao ja finalizou

  await gravarEventoAcerto(supabase, `acerto:executar:${acertoId}`, "acerto_executado", {
    acerto_id: acertoId,
  });

  // Recibo de devolucao (best-effort).
  try {
    const { data: contrato } = await supabase
      .from("contratos")
      .select("titular_id")
      .eq("id", contratoId)
      .maybeSingle();
    const titularId = (contrato as { titular_id?: string } | null)?.titular_id;
    if (titularId) {
      const { data: titular } = await supabase
        .from("titulares")
        .select("nome_completo, email")
        .eq("id", titularId)
        .maybeSingle();
      const email = (titular as { email?: string | null } | null)?.email;
      if (email) {
        const totalBRL = lista.reduce((s, e) => s + (Number(e.valor_brl) || 0), 0);
        const meio = lista.every((e) => e.meio === "manual") ? "manual" : "mp";
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
        await enviarReciboDevolucaoEmail(email, (titular as { nome_completo?: string }).nome_completo || "", {
          valorBRL: totalBRL,
          meio,
          portalUrl: appUrl || null,
        });
      }
    }
  } catch {
    console.error("[acerto] falha ao enviar recibo de devolucao");
  }
  return true;
}

export type ExecucaoAcerto = { ok: true; meio: "mp" | "manual"; refundBRL: number; executado: boolean };

export async function executarAcerto(args: {
  acertoId: string;
  titularIdEsperado: string;
  autor: string;
  ip?: string | null;
}): Promise<ExecucaoAcerto> {
  const supabase = getSupabase();

  const { data: acerto } = await supabase
    .from("acertos")
    .select("id, contrato_id, status, provisorio, saldo_devolver_cliente")
    .eq("id", args.acertoId)
    .maybeSingle();
  if (!acerto) throw new AcertoBloqueado("acerto_nao_encontrado", "Acerto nao encontrado");

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", acerto.contrato_id)
    .maybeSingle();
  if (!contrato || contrato.titular_id !== args.titularIdEsperado) {
    throw new AcertoBloqueado("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }
  const contratoId: string = contrato.id;

  // GUARDA DE DINHEIRO: nao executa sobre regra de retencao ainda provisoria.
  if (acerto.provisorio) {
    throw new AcertoBloqueado(
      "acerto_provisorio",
      "A retencao ainda nao foi validada juridicamente; nao e possivel executar o refund"
    );
  }
  if (acerto.status === "executado") {
    throw new AcertoBloqueado("ja_executado", "Este acerto ja foi executado");
  }
  if (!transicaoAcertoPermitida(String(acerto.status), "executado")) {
    throw new AcertoBloqueado("transicao_invalida", "So um acerto aceito pode ser executado");
  }

  // Plano fresco (read-only): fracao BRL + particionamento + elegibilidade.
  const plano = await planejarRefundAcerto({ acertoId: args.acertoId, titularIdEsperado: args.titularIdEsperado });

  await supabase
    .from("acertos")
    .update({ refund_meio: plano.meio, atualizada_em: new Date().toISOString() })
    .eq("id", args.acertoId);

  // GUARDA anti-dupla-devolucao: um acerto nao pode ter estornos dos DOIS meios.
  // Cenario: meio muda (mp -> manual) entre execucoes depois de um refund MP ja
  // disparado; registrar tambem a devolucao manual pagaria o mesmo dinheiro 2x.
  const { data: estornosExistentes } = await supabase
    .from("estornos")
    .select("meio")
    .eq("acerto_id", args.acertoId);
  const temMp = (estornosExistentes || []).some((e) => (e as { meio?: string }).meio === "mp");
  const temManual = (estornosExistentes || []).some((e) => (e as { meio?: string }).meio === "manual");
  if (plano.meio === "manual" && temMp) {
    throw new AcertoBloqueado(
      "estorno_mp_existente",
      "Ja ha estorno via Mercado Pago disparado para este acerto; nao registre devolucao manual"
    );
  }
  if (plano.meio === "mp" && temManual) {
    throw new AcertoBloqueado(
      "estorno_manual_existente",
      "Ja ha devolucao manual registrada para este acerto; conclua-a em vez de estornar via MP"
    );
  }

  // Nada a devolver: encerra direto.
  if (plano.refundBRL <= 0 && plano.itens.length === 0 && plano.meio === "mp") {
    await supabase
      .from("acertos")
      .update({ status: "executado", executado_em: new Date().toISOString(), atualizada_em: new Date().toISOString() })
      .eq("id", args.acertoId)
      .eq("status", "aceito");
    await registrarAuditoriaAdmin(supabase, {
      usuario: args.autor,
      acao: "acerto.executar",
      alvo: contratoId,
      detalhe: { acerto_id: args.acertoId, meio: "mp", refund_brl: 0, nada_a_devolver: true },
      ip: args.ip ?? null,
    });
    return { ok: true, meio: "mp", refundBRL: 0, executado: true };
  }

  // DEVOLUCAO MANUAL: registra a intencao (dedupe) e aguarda confirmacao com
  // comprovante (confirmarDevolucaoManual). NAO dispara MP nem marca executado.
  if (plano.meio === "manual") {
    // Insere a intencao de devolucao manual; a unicidade e garantida no banco
    // (uidx_estornos_manual). 23505 => ja registrada (idempotente, sem TOCTOU).
    const { error: insManualErr } = await supabase.from("estornos").insert({
      acerto_id: args.acertoId,
      valor_brl: plano.refundBRL,
      meio: "manual",
      status: "pendente",
      criado_por: args.autor,
    });
    if (insManualErr && (insManualErr as { code?: string }).code !== "23505") {
      throw new Error("Falha ao registrar a devolucao manual");
    }
    await registrarAuditoriaAdmin(supabase, {
      usuario: args.autor,
      acao: "acerto.executar",
      alvo: contratoId,
      detalhe: { acerto_id: args.acertoId, meio: "manual", refund_brl: plano.refundBRL, motivo: plano.motivoManual },
      ip: args.ip ?? null,
    });
    return { ok: true, meio: "manual", refundBRL: plano.refundBRL, executado: false };
  }

  // ESTORNO VIA MP: um estorno por pagamento (idempotente). Dispara o refund e
  // marca cada estorno conforme a resposta do MP; confirma o acerto se todos ok.
  for (const item of plano.itens) {
    // Garante a linha do ledger (idempotencia por (acerto_id, pagamento_id)).
    let estornoId: string | null = null;
    let jaDisparado = false; // ja confirmado OU ja tem refund id (nao redisparar)
    const { data: ins, error: insErr } = await supabase
      .from("estornos")
      .insert({
        acerto_id: args.acertoId,
        pagamento_id: item.pagamentoId,
        valor_brl: item.valorBRL,
        meio: "mp",
        status: "pendente",
        criado_por: args.autor,
      })
      .select("id")
      .single();
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        const { data: ex } = await supabase
          .from("estornos")
          .select("id, status, external_refund_id")
          .eq("acerto_id", args.acertoId)
          .eq("pagamento_id", item.pagamentoId)
          .maybeSingle();
        estornoId = (ex as { id?: string } | null)?.id ?? null;
        // Defesa em profundidade: se ja ha refund id (refund ja enviado ao MP),
        // NAO redispara — deixa o cron confirmar. So re-dispara 'erro'/'pendente'
        // que nunca chegaram a ter refund id.
        const st = (ex as { status?: string } | null)?.status;
        const rid = (ex as { external_refund_id?: string | null } | null)?.external_refund_id;
        jaDisparado = st === "confirmado" || !!rid;
      } else {
        continue; // erro transitorio ao gravar o ledger; proximo cron/retry cobre
      }
    } else {
      estornoId = (ins as { id?: string } | null)?.id ?? null;
    }
    if (!estornoId || jaDisparado || !item.externalPaymentId) continue;

    // Dispara o estorno (idempotente por X-Idempotency-Key: retry nao duplica).
    try {
      const resp = await refundPayment(
        item.externalPaymentId,
        item.valorBRL,
        `acerto:${args.acertoId}:pgto:${item.pagamentoId}`
      );
      const refundId = String((resp as { id?: string | number })?.id ?? "");
      const status = refundConfirmadoNoMP((resp as { status?: string })?.status) ? "confirmado" : "pendente";
      await supabase
        .from("estornos")
        .update({ external_refund_id: refundId || null, status, atualizada_em: new Date().toISOString() })
        .eq("id", estornoId);
    } catch (err) {
      await supabase
        .from("estornos")
        .update({ status: "erro", erro: String((err as Error)?.message || "erro").slice(0, 500), atualizada_em: new Date().toISOString() })
        .eq("id", estornoId);
    }
  }

  const executado = await finalizarAcertoSeConfirmado(supabase, args.acertoId, contratoId);

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "acerto.executar",
    alvo: contratoId,
    detalhe: { acerto_id: args.acertoId, meio: "mp", refund_brl: plano.refundBRL, executado },
    ip: args.ip ?? null,
  });

  return { ok: true, meio: "mp", refundBRL: plano.refundBRL, executado };
}

// Reconciliacao (cron): confirma estornos MP pendentes reconsultando o MP e
// finaliza os acertos cujos estornos ficaram todos confirmados. Idempotente.
export async function conciliarEstornosPendentes(
  supabase: SupabaseClient,
  limite = 200
): Promise<{ verificados: number; confirmados: number; finalizados: number; erros: number }> {
  const resumo = { verificados: 0, confirmados: 0, finalizados: 0, erros: 0 };

  const { data: pendentes } = await supabase
    .from("estornos")
    .select("id, acerto_id, pagamento_id, external_refund_id")
    .eq("meio", "mp")
    .eq("status", "pendente")
    .not("external_refund_id", "is", null)
    .limit(limite);

  const acertosTocados = new Set<string>();
  for (const e of (pendentes || []) as {
    id: string;
    acerto_id: string;
    pagamento_id: string | null;
    external_refund_id: string | null;
  }[]) {
    if (!e.pagamento_id || !e.external_refund_id) continue;
    resumo.verificados++;
    try {
      const { data: pg } = await supabase
        .from("pagamentos")
        .select("external_payment_id")
        .eq("id", e.pagamento_id)
        .maybeSingle();
      const paymentId = (pg as { external_payment_id?: string } | null)?.external_payment_id;
      if (!paymentId) continue;
      const refund = await consultarRefund(paymentId, e.external_refund_id);
      if (refund && refundConfirmadoNoMP((refund as { status?: string }).status)) {
        await supabase
          .from("estornos")
          .update({ status: "confirmado", atualizada_em: new Date().toISOString() })
          .eq("id", e.id);
        resumo.confirmados++;
        acertosTocados.add(e.acerto_id);
      }
    } catch {
      resumo.erros++;
    }
  }

  for (const acertoId of acertosTocados) {
    const { data: ac } = await supabase
      .from("acertos")
      .select("contrato_id")
      .eq("id", acertoId)
      .maybeSingle();
    const contratoId = (ac as { contrato_id?: string } | null)?.contrato_id;
    if (!contratoId) continue;
    const fin = await finalizarAcertoSeConfirmado(supabase, acertoId, contratoId);
    if (fin) resumo.finalizados++;
  }

  return resumo;
}

// Confirma uma DEVOLUCAO MANUAL (admin anexa comprovante) e finaliza o acerto.
export async function confirmarDevolucaoManual(args: {
  acertoId: string;
  titularIdEsperado: string;
  comprovanteUrl?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<{ ok: true; executado: boolean }> {
  const supabase = getSupabase();

  const { data: acerto } = await supabase
    .from("acertos")
    .select("id, contrato_id, status, provisorio")
    .eq("id", args.acertoId)
    .maybeSingle();
  if (!acerto) throw new AcertoBloqueado("acerto_nao_encontrado", "Acerto nao encontrado");

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", acerto.contrato_id)
    .maybeSingle();
  if (!contrato || contrato.titular_id !== args.titularIdEsperado) {
    throw new AcertoBloqueado("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }
  if (acerto.provisorio) {
    throw new AcertoBloqueado("acerto_provisorio", "Retencao ainda nao validada juridicamente");
  }
  if (acerto.status === "executado") {
    throw new AcertoBloqueado("ja_executado", "Este acerto ja foi executado");
  }
  if (acerto.status !== "aceito") {
    throw new AcertoBloqueado("transicao_invalida", "So um acerto aceito pode ser executado");
  }

  const { data: estorno } = await supabase
    .from("estornos")
    .select("id, status")
    .eq("acerto_id", args.acertoId)
    .eq("meio", "manual")
    .maybeSingle();
  if (!estorno) {
    throw new AcertoBloqueado("sem_estorno_manual", "Nao ha devolucao manual registrada; execute o acerto primeiro");
  }

  await supabase
    .from("estornos")
    .update({
      status: "confirmado",
      comprovante_url: args.comprovanteUrl ?? null,
      atualizada_em: new Date().toISOString(),
    })
    .eq("id", (estorno as { id: string }).id);

  const executado = await finalizarAcertoSeConfirmado(supabase, args.acertoId, contrato.id);

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "acerto.devolucao_manual.confirmar",
    alvo: contrato.id,
    detalhe: { acerto_id: args.acertoId, comprovante: args.comprovanteUrl ?? null, executado },
    ip: args.ip ?? null,
  });

  return { ok: true, executado };
}
