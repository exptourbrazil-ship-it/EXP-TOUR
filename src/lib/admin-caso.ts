// NB: modulo server-only (usa a service role do Supabase). So deve ser
// importado por server components e rotas de API — NUNCA por codigo client.
//
// Loader do Caso 360 (docs/07-arquitetura-area-administrativa.md, Secao 3.2):
// reune, para UM titular, tudo que o time precisa para responder "qual a
// situacao deste cliente" — contratos, parcelas, ledger de pagamentos (memoria
// cambial), documentos, comunicacao (e-mail/WhatsApp), eventos de auditoria e a
// jornada derivada. FATIA 1: somente leitura, sem nenhuma mutacao.
import { createClient } from "@supabase/supabase-js";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import { calcularJornada, indiceEtapaAtual, type EtapaJornada } from "@/lib/jornada";
import {
  montarFiltroEventosCaso,
  diasAteInicio,
  saldoPorMoedaAberto,
  estimarSaldoBRL,
} from "@/lib/caso";
import { excecaoAtiva, type StatusExcecao } from "@/lib/excecao";
import { carregarEstadoConsentimentos } from "@/lib/consentimento-service";
import type { EstadoConsentimento } from "@/lib/consentimento";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export type CasoTitular = {
  id: string;
  nome_completo: string | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  data_inicio: string | null;
  created_at: string | null;
  anonimizado_em: string | null;
};

export type CasoContrato = {
  id: string;
  nome: string | null;
  valor_total: number | null;
  moeda: string | null;
  estudante_nome: string | null;
  estudante_sexo: string | null;
  estudante_data_nascimento: string | null;
  estudante_email: string | null;
  pais_destino: string | null;
  visto_status: string | null;
  cancelado_em: string | null;
  cancelado_tipo: string | null;
  cancelado_motivo: string | null;
  cancelado_por: string | null;
  created_at: string | null;
  supplier_id: string | null;
};

export type CasoConfirmacao = {
  id: string;
  contrato_id: string | null;
  kind: string;
  message: string | null;
  status: string;
  response_note: string | null;
  responded_by: string | null;
  responded_at: string | null;
  created_at: string | null;
};

export type CasoParcela = {
  id: string;
  contrato_id: string;
  numero: number | null;
  descricao: string | null;
  valor_original: number | null;
  valor_atual: number | null;
  cotacao_aplicada: number | null;
  valor_cobrado_brl: number | null;
  vencimento: string | null;
  is_entrada: boolean | null;
  status: string;
  qr_code_url: string | null; // Pix gerado -> parcela travada para edição
  external_payment_id: string | null; // ordem MP em voo -> também travada
  em_disputa: boolean | null;
  disputa_status: string | null;
  paid_at: string | null;
};

export type CasoPagamento = {
  parcela_id: string;
  contrato_id: string | null;
  moeda: string | null;
  valor_programa: number | null;
  cotacao_aplicada: number | null;
  valor_brl: number | null;
  pago_em: string | null;
};

export type CasoDocumento = {
  id: string;
  tipo_documento: string;
  nome_arquivo: string | null;
  origem: string | null;
  status: string | null;
  motivo_rejeicao: string | null;
  created_at: string | null;
  compartilhado_fornecedor: boolean | null;
};

export type CasoExcecao = {
  id: string;
  contrato_id: string;
  tipo: string;
  status: string;
  suspende: string[] | null;
  etapa: string | null;
  motivo: string | null;
  desfecho: string | null;
  resolucao: string | null;
  aberta_por: string | null;
  resolvida_por: string | null;
  aberta_em: string | null;
  resolvida_em: string | null;
};

export type CasoAcerto = {
  id: string;
  contrato_id: string;
  tipo_cancelamento: string | null;
  status: string;
  moeda: string | null;
  valor_total: number | null;
  total_pago: number | null;
  retencao_percentual: number | null;
  retencao_valor: number | null;
  refund_escola_esperado: number | null;
  saldo_devolver_cliente: number | null;
  memoria: { rotulo: string; valor: number; tipo: string }[] | null;
  provisorio: boolean | null;
  criado_em: string | null;
};

export type CasoRepactuacao = {
  id: string;
  contrato_id: string;
  status: string;
  moeda: string | null;
  total_moeda: number | null;
  cronograma_anterior: { numero: number; vencimento: string; valor: number }[] | null;
  cronograma_novo: { numero: number; vencimento: string; valor: number }[] | null;
  exige_aprovacao: boolean | null;
  solicitado_por: string | null;
  aceito_em: string | null;
  trimestre: string | null;
  created_at: string | null;
};

export type CasoAlteracao = {
  id: string;
  contrato_id: string;
  excecao_id: string | null;
  tipo: string; // 'deferral' (E2) | 'escopo' (E3)
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
  provisorio: boolean | null;
  aplicada_em: string | null;
  aplicada_por: string | null;
  aditivo_proposto_em: string | null;
  aditivo_aceito_em: string | null;
  criado_em: string | null;
};

export type CasoComunicacao = {
  canal: "email" | "whatsapp";
  tipo_mensagem: string | null;
  sucesso: boolean | null;
  erro: string | null;
  created_at: string | null;
};

export type CasoEvento = {
  usuario: string | null;
  acao: string | null;
  alvo: string | null;
  detalhe: Record<string, unknown> | null;
  ip: string | null;
  criado_em: string | null;
};

export type Caso = {
  titular: CasoTitular;
  contratos: CasoContrato[];
  parcelas: CasoParcela[];
  pagamentos: CasoPagamento[];
  documentos: CasoDocumento[];
  confirmacoes: CasoConfirmacao[];
  comunicacao: CasoComunicacao[];
  eventos: CasoEvento[];
  excecoes: CasoExcecao[];
  acertos: CasoAcerto[];
  alteracoes: CasoAlteracao[];
  repactuacoes: CasoRepactuacao[];
  consentimentos: EstadoConsentimento[]; // LGPD 15/16: estado vigente por finalidade
  // Derivados
  excecoesAtivas: CasoExcecao[]; // processos ativos (nao terminais) — "processo ativo" do caso
  jornada: EtapaJornada[];
  etapaAtual: number; // indice da primeira etapa nao concluida
  saldoPorMoeda: Record<string, number>; // em aberto, por moeda do programa
  cotacoesPorMoeda: Record<string, number>; // VET mais recente por moeda
  estimativaBRL: number | null; // saldo em aberto convertido (null se faltar cotacao)
  moedaPorContrato: Record<string, string>; // id do contrato -> moeda
};

// Carrega o Caso 360 de UM titular. Retorna null se o titular nao existir.
// Todas as leituras usam a service role (ignora RLS); a autorizacao e feita na
// pagina (exigirCapacidade("casos.ver")).
export async function carregarCaso(titularId: string): Promise<Caso | null> {
  const supabase = getSupabase();

  const { data: titular } = await supabase
    .from("titulares")
    .select("id, nome_completo, cpf, telefone, email, data_inicio, created_at, anonimizado_em")
    .eq("id", titularId)
    .maybeSingle();

  if (!titular) return null;

  // Contratos do titular.
  const { data: contratos } = await supabase
    .from("contratos")
    .select(
      "id, nome, valor_total, moeda, estudante_nome, estudante_sexo, estudante_data_nascimento, estudante_email, pais_destino, visto_status, cancelado_em, cancelado_tipo, cancelado_motivo, cancelado_por, created_at, supplier_id"
    )
    .eq("titular_id", titularId)
    .order("created_at", { ascending: false });

  const listaContratos = (contratos || []) as CasoContrato[];
  const contratoIds = listaContratos.map((c) => c.id);
  const moedaPorContrato = new Map<string, string>(
    listaContratos.map((c) => [c.id, (c.moeda || "?").toUpperCase()])
  );

  // Parcelas de todos os contratos, ordenadas por contrato e numero.
  let parcelas: CasoParcela[] = [];
  let pagamentos: CasoPagamento[] = [];
  if (contratoIds.length > 0) {
    const { data: parcelasData } = await supabase
      .from("parcelas")
      .select(
        "id, contrato_id, numero, descricao, valor_original, valor_atual, cotacao_aplicada, valor_cobrado_brl, vencimento, is_entrada, status, qr_code_url, external_payment_id, em_disputa, disputa_status, paid_at"
      )
      .in("contrato_id", contratoIds)
      .order("contrato_id", { ascending: true })
      .order("numero", { ascending: true });
    parcelas = (parcelasData || []) as CasoParcela[];

    const { data: pagamentosData } = await supabase
      .from("pagamentos")
      .select("parcela_id, contrato_id, moeda, valor_programa, cotacao_aplicada, valor_brl, pago_em")
      .in("contrato_id", contratoIds)
      .order("pago_em", { ascending: false });
    pagamentos = (pagamentosData || []) as CasoPagamento[];
  }

  // Documentos do titular.
  const { data: documentosData } = await supabase
    .from("documentos")
    .select("id, tipo_documento, nome_arquivo, origem, status, motivo_rejeicao, created_at, compartilhado_fornecedor")
    .eq("titular_id", titularId)
    .order("created_at", { ascending: false });
  const documentos = (documentosData || []) as CasoDocumento[];

  // Pedidos de confirmacao de disponibilidade (alerta 5) dos contratos do caso.
  let confirmacoes: CasoConfirmacao[] = [];
  if (contratoIds.length > 0) {
    const { data: confData } = await supabase
      .from("availability_confirmation")
      .select("id, contrato_id, kind, message, status, response_note, responded_by, responded_at, created_at")
      .in("contrato_id", contratoIds)
      .order("created_at", { ascending: false });
    confirmacoes = (confData || []) as CasoConfirmacao[];
  }

  // Processos de excecao do titular (doc 01, Secao 4). Ordenados por abertura
  // desc; a UI separa os ativos (nao terminais) para o cabecalho do caso.
  const { data: excecoesData } = await supabase
    .from("case_exceptions")
    .select(
      "id, contrato_id, tipo, status, suspende, etapa, motivo, desfecho, resolucao, aberta_por, resolvida_por, aberta_em, resolvida_em"
    )
    .eq("titular_id", titularId)
    .order("aberta_em", { ascending: false });
  const excecoes = (excecoesData || []) as CasoExcecao[];
  const excecoesAtivas = excecoes.filter((e) => excecaoAtiva(e.status as StatusExcecao));

  // Acertos (rascunhos calculados) do titular — memoria de calculo para o
  // Financeiro revisar.
  const { data: acertosData } = await supabase
    .from("acertos")
    .select(
      "id, contrato_id, tipo_cancelamento, status, moeda, valor_total, total_pago, retencao_percentual, retencao_valor, refund_escola_esperado, saldo_devolver_cliente, memoria, provisorio, criado_em"
    )
    .eq("titular_id", titularId)
    .order("criado_em", { ascending: false });
  const acertos = (acertosData || []) as CasoAcerto[];

  // Alteracoes (rascunhos do plano recalculado) do titular — previa do
  // adiamento (E2) para o Financeiro/Operacao revisar.
  const { data: alteracoesData } = await supabase
    .from("alteracoes")
    .select(
      "id, contrato_id, excecao_id, tipo, status, moeda, data_inicio_atual, nova_data_inicio, nova_data_quitacao, saldo_devedor, num_parcelas, plano_proposto, valor_programa_atual, valor_programa_novo, delta, ja_pago, credito_cliente, sentido, provisorio, aplicada_em, aplicada_por, aditivo_proposto_em, aditivo_aceito_em, criado_em"
    )
    .eq("titular_id", titularId)
    .order("criado_em", { ascending: false });
  const alteracoes = (alteracoesData || []) as CasoAlteracao[];

  // Repactuacoes AGUARDANDO APROVACAO do titular (Clausula 7.11): a 3a+ do
  // trimestre que precisa de decisao humana. So as pendentes entram na fila.
  const { data: repactData } = await supabase
    .from("repactuacoes")
    .select(
      "id, contrato_id, status, moeda, total_moeda, cronograma_anterior, cronograma_novo, exige_aprovacao, solicitado_por, aceito_em, trimestre, created_at"
    )
    .eq("titular_id", titularId)
    .eq("status", "aguardando_aprovacao")
    .order("created_at", { ascending: false });
  const repactuacoes = (repactData || []) as CasoRepactuacao[];

  // Consentimentos (LGPD 15/16): estado VIGENTE por finalidade (read-only no admin).
  // Deploy-safe: uma falha de leitura (ex.: tabela ausente) nao derruba o Caso 360.
  let consentimentos: EstadoConsentimento[] = [];
  try {
    consentimentos = await carregarEstadoConsentimentos(supabase, titularId);
  } catch {
    consentimentos = [];
  }

  // Comunicacao: e-mail (por destinatario = e-mail do titular) + WhatsApp (por
  // destinatario = telefone do titular). So consulta se houver o contato.
  const comunicacao: CasoComunicacao[] = [];
  if (titular.email) {
    const { data: emails } = await supabase
      .from("email_logs")
      .select("tipo_mensagem, sucesso, erro, created_at")
      .eq("destinatario", titular.email)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const e of emails || []) {
      comunicacao.push({ canal: "email", ...(e as Omit<CasoComunicacao, "canal">) });
    }
  }
  if (titular.telefone) {
    const { data: zaps } = await supabase
      .from("whatsapp_logs")
      .select("tipo_mensagem, sucesso, erro, created_at")
      .eq("destinatario", titular.telefone)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const w of zaps || []) {
      comunicacao.push({ canal: "whatsapp", ...(w as Omit<CasoComunicacao, "canal">) });
    }
  }
  comunicacao.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Eventos do caso (admin_audit). O filtro so interpola valores JA validados
  // (UUID e CPF), montado por helper puro para nao permitir injecao no .or().
  const filtroEventos = montarFiltroEventosCaso(titular.id, titular.cpf);
  const { data: eventosData } = await supabase
    .from("admin_audit")
    .select("usuario, acao, alvo, detalhe, ip, criado_em")
    .or(filtroEventos)
    .order("criado_em", { ascending: false })
    .limit(100);
  const eventos = (eventosData || []) as CasoEvento[];

  // Cambio: cotacao_vet mais recente por moeda (mesmo padrao de /parcelas).
  const hojeISO = hojeBrasilISO();
  const moedasUnicas = Array.from(
    new Set(listaContratos.map((c) => (c.moeda || "").toUpperCase()).filter((m) => m && m !== "BRL"))
  );
  const cotacoesPorMoeda: Record<string, number> = {};
  for (const moeda of moedasUnicas) {
    const { data: cotacao } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet")
      .eq("moeda", moeda)
      .lte("data", hojeISO)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cotacao) cotacoesPorMoeda[moeda] = Number(cotacao.cotacao_vet);
  }

  // Derivados: saldo em aberto por moeda e estimativa em BRL.
  const saldoPorMoeda = saldoPorMoedaAberto(parcelas, moedaPorContrato);
  const estimativaBRL = estimarSaldoBRL(saldoPorMoeda, cotacoesPorMoeda);

  // Jornada: sinais reais (contrato ativo, documentos, parcelas, dias ate inicio).
  const temContratoAtivo = listaContratos.some((c) => !c.cancelado_em);
  const parcelasTotal = parcelas.length;
  const parcelasPagas = parcelas.filter((p) => p.status === "pago").length;
  const jornada = calcularJornada({
    temContrato: temContratoAtivo,
    documentosEnviados: documentos.length,
    parcelasPagas,
    parcelasTotal,
    diasAteInicio: diasAteInicio(titular.data_inicio, hojeISO),
  });
  const etapaAtual = indiceEtapaAtual(jornada);

  return {
    titular: titular as CasoTitular,
    contratos: listaContratos,
    parcelas,
    pagamentos,
    documentos,
    confirmacoes,
    comunicacao,
    eventos,
    excecoes,
    acertos,
    alteracoes,
    repactuacoes,
    consentimentos,
    excecoesAtivas,
    jornada,
    etapaAtual,
    saldoPorMoeda,
    cotacoesPorMoeda,
    estimativaBRL,
    moedaPorContrato: Object.fromEntries(moedaPorContrato),
  };
}
