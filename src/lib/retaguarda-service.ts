// Camada de dados da RETAGUARDA (server-only, service role). Monta o snapshot
// ESCOPADO POR TENANT, roda o motor detectivo puro (retaguarda.ts), reconcilia
// com o que já está persistido e aplica o plano em `retaguarda_achado`.
//
// Escopo por tenant (docs/deploy-multi-tenant.md): parcelas/pagamentos não têm
// tenant_id — escopam pelos contratos do tenant (membershipDoTenant). FALHA
// FECHADA: se o tenant não resolver, o serviço lança e o cron não processa.
//
// O detective NUNCA muta dado de negócio (LGPD art. 20, spec 7-F.2): só grava
// ACHADOS para verificação humana. A única escrita é em `retaguarda_achado`.
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverEscopoTenant, membershipDoTenant, emLotes } from "@/lib/cron-tenant";
import {
  detectarRetaguarda,
  reconciliarAchados,
  type Achado,
  type AchadoPersistido,
  type ParcelaSnapshot,
  type PagamentoSnapshot,
  type DocCompartilhadoSnapshot,
  type AlteracaoSnapshot,
  type RepactuacaoSnapshot,
  type DocValidadeSnapshot,
  type CartaRecusaSnapshot,
  type SeguroContratoSnapshot,
  type SeguroVigenciaSnapshot,
  type SeguroCoberturaSnapshot,
  type PassagemSnapshot,
  type PassagemCompraSnapshot,
  type PassagemVoltaSnapshot,
  type RequisitoConsuladoSnapshot,
  type DocumentacaoIdentidadeSnapshot,
  type SeveridadeAchado,
  adicionarMesesISO,
  adicionarDiasISO,
  TIPO_CARTA_RECUSA_VISTO,
  PRAZO_REPASSE_CARTA_RECUSA_DIAS_UTEIS,
} from "@/lib/retaguarda";
import { prazoArrependimentoRemessaISO } from "@/lib/trava-remessa";
import { somarDiasUteis, type Feriados } from "@/lib/dias-uteis";
import { TIPOS_VISTO, ehTipoDocumentoValido } from "@/lib/documentos";
import { carregarFeriados } from "@/lib/dias-uteis-service";
import { hojeBrasilISO } from "@/lib/admin-financeiro";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export type ResumoVarredura = {
  tenantId: string;
  contratos: number;
  achadosAtuais: number;
  novos: number;
  reabertos: number;
  mantidos: number;
  resolvidos: number;
  abertosTotal: number;
  // Achados NOVOS (abertos/reabertos nesta rodada) de severidade ALTA — o cron
  // usa para o alerta interno. Não vai para o JSON de resposta.
  novosAlto: Achado[];
};

const LOTE_IN = 500;

// Buffer padrão do agente de Vistos: meses que o documento (passaporte) deve
// permanecer válido além do início do programa. Parâmetro de negócio por tenant
// (tenant_config.visto_validade_min_meses) — env/default só de fallback.
const VISTO_VALIDADE_MIN_MESES_PADRAO = 6;

// Janela padrão do agente de Seguro: dias de antecedência do embarque a partir
// dos quais a ausência de apólice vira alerta. Env override (SEGURO_ALERTA_DIAS_
// ANTES); ausência de apólice segue sendo cobrada também após o embarque.
// Data-calendário do Brasil (YYYY-MM-DD) de um timestamptz ISO — alinha um
// created_at (UTC) ao mesmo calendário das colunas DATE preenchidas pelo admin.
function dataBrasilDeISO(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA formata como YYYY-MM-DD; o timeZone fixa o dia no fuso do Brasil.
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

const SEGURO_ALERTA_DIAS_ANTES_EMBARQUE_PADRAO = 30;
function janelaAlertaSeguroDias(): number {
  const env = Number(process.env.SEGURO_ALERTA_DIAS_ANTES);
  return Number.isFinite(env) && env >= 0 ? Math.round(env) : SEGURO_ALERTA_DIAS_ANTES_EMBARQUE_PADRAO;
}

// Janela de compatibilidade da IDA do bilhete com o início do programa (agente de
// Passagens): a ida pode ser até N dias ANTES do início (chegar cedo) e no máximo
// M dias DEPOIS (tolerância de fuso/chegada no mesmo dia). Fora disso, incompatível.
const PASSAGEM_JANELA_ANTES_DIAS_PADRAO = 30;
const PASSAGEM_JANELA_DEPOIS_DIAS_PADRAO = 3;
function janelaPassagemAntesDias(): number {
  const env = Number(process.env.PASSAGEM_JANELA_ANTES_DIAS);
  return Number.isFinite(env) && env >= 0 ? Math.round(env) : PASSAGEM_JANELA_ANTES_DIAS_PADRAO;
}
function janelaPassagemDepoisDias(): number {
  const env = Number(process.env.PASSAGEM_JANELA_DEPOIS_DIAS);
  return Number.isFinite(env) && env >= 0 ? Math.round(env) : PASSAGEM_JANELA_DEPOIS_DIAS_PADRAO;
}
// Volta vs. fim do programa: a volta pode ser até N dias ANTES do fim (aluno que
// encerra as aulas na sexta e viaja no fim de semana). Antes disso, provável data
// trocada — o aluno iria embora antes de terminar o programa.
const PASSAGEM_VOLTA_ANTES_DIAS_PADRAO = 2;
function janelaPassagemVoltaAntesDias(): number {
  const env = Number(process.env.PASSAGEM_VOLTA_ANTES_DIAS);
  return Number.isFinite(env) && env >= 0 ? Math.round(env) : PASSAGEM_VOLTA_ANTES_DIAS_PADRAO;
}

// Mínimos de cobertura de seguro por país (destino), do config do tenant. Forma
// esperada: { "<pais>": { valor: number, moeda: "XXX" } }. Deploy-safe: coluna
// ausente/erro -> mapa vazio (o agente de cobertura simplesmente não roda).
export type MinimoCobertura = { valor: number; moeda: string };
async function carregarMinimosCoberturaSeguro(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Map<string, MinimoCobertura>> {
  const mapa = new Map<string, MinimoCobertura>();
  const { data, error } = await supabase
    .from("tenant_config")
    .select("seguro_cobertura_minima")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const raw = !error && data ? (data as { seguro_cobertura_minima?: unknown }).seguro_cobertura_minima : null;
  if (raw && typeof raw === "object") {
    for (const [paisRaw, v] of Object.entries(raw as Record<string, unknown>)) {
      const obj = v as { valor?: unknown; moeda?: unknown } | null;
      const valor = Number(obj?.valor);
      // Normaliza os DOIS lados da comparação para a mesma forma canônica que a
      // ingestão grava: país = slug minúsculo (igual a contratos.pais_destino);
      // moeda = maiúscula (igual à rota, que faz toUpperCase). Sem isso, um
      // config com "eur"/"Portugal" nunca casaria e o agente ficaria mudo.
      const pais = paisRaw.trim().toLowerCase();
      const moedaBruta = typeof obj?.moeda === "string" ? obj.moeda.trim().toUpperCase() : "";
      const moeda = /^[A-Z]{2,5}$/.test(moedaBruta) ? moedaBruta : "";
      if (pais && Number.isFinite(valor) && valor > 0 && moeda) {
        mapa.set(pais, { valor, moeda });
      }
    }
  }
  return mapa;
}

// Requisitos publicados do consulado por país (destino), do config do tenant.
// Forma esperada: { "<pais>": ["<tipo_documento>", ...] }. Normaliza o país para
// slug minúsculo (igual a contratos.pais_destino) e valida cada tipo contra a
// taxonomia (ehTipoDocumentoValido) — tipo desconhecido é descartado, para um
// config errado não gerar achado com slug inexistente. Deploy-safe: coluna
// ausente/erro -> mapa vazio (o agente simplesmente não roda).
async function carregarRequisitosConsulado(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  const { data, error } = await supabase
    .from("tenant_config")
    .select("visto_requisitos_consulado")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const raw = !error && data ? (data as { visto_requisitos_consulado?: unknown }).visto_requisitos_consulado : null;
  if (raw && typeof raw === "object") {
    for (const [paisRaw, v] of Object.entries(raw as Record<string, unknown>)) {
      const pais = paisRaw.trim().toLowerCase();
      if (!pais || !Array.isArray(v)) continue;
      const exigidos = Array.from(
        new Set(
          v
            .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
            .filter((t) => t && ehTipoDocumentoValido(t)),
        ),
      );
      if (exigidos.length > 0) mapa.set(pais, exigidos);
    }
  }
  return mapa;
}

// Carrega o buffer de validade do tenant (linha -> env -> default). Deploy-safe:
// banco sem a coluna -> select erra -> cai no env/default.
async function carregarBufferValidadeMeses(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("tenant_config")
    .select("visto_validade_min_meses")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const linha = !error && data ? Number((data as { visto_validade_min_meses?: unknown }).visto_validade_min_meses) : NaN;
  if (Number.isFinite(linha) && linha >= 0) return Math.round(linha);
  const env = Number(process.env.VISTO_VALIDADE_MIN_MESES);
  if (Number.isFinite(env) && env >= 0) return Math.round(env);
  return VISTO_VALIDADE_MIN_MESES_PADRAO;
}

// Monta os arrays do snapshot lendo só os contratos do tenant. Loteia o .in().
async function carregarSnapshot(
  supabase: SupabaseClient,
  contratoIds: string[],
  bufferValidadeMeses: number,
  feriados: Feriados,
  janelaSeguroDias: number,
  minimosCobertura: Map<string, MinimoCobertura>,
  requisitosConsuladoPorPais: Map<string, string[]>,
): Promise<{
  parcelas: ParcelaSnapshot[];
  pagamentos: PagamentoSnapshot[];
  docsCompartilhados: DocCompartilhadoSnapshot[];
  alteracoes: AlteracaoSnapshot[];
  repactuacoes: RepactuacaoSnapshot[];
  docsValidade: DocValidadeSnapshot[];
  cartasRecusa: CartaRecusaSnapshot[];
  segurosContrato: SeguroContratoSnapshot[];
  segurosVigencia: SeguroVigenciaSnapshot[];
  segurosCobertura: SeguroCoberturaSnapshot[];
  passagens: PassagemSnapshot[];
  passagensCompra: PassagemCompraSnapshot[];
  passagensVolta: PassagemVoltaSnapshot[];
  requisitosConsulado: RequisitoConsuladoSnapshot[];
  documentacaoIdentidade: DocumentacaoIdentidadeSnapshot[];
}> {
  const parcelas: ParcelaSnapshot[] = [];
  const pagamentos: PagamentoSnapshot[] = [];
  const docsCompartilhados: DocCompartilhadoSnapshot[] = [];
  const alteracoes: AlteracaoSnapshot[] = [];
  const repactuacoes: RepactuacaoSnapshot[] = [];
  const docsValidade: DocValidadeSnapshot[] = [];
  const cartasRecusa: CartaRecusaSnapshot[] = [];
  const segurosContrato: SeguroContratoSnapshot[] = [];
  const segurosVigencia: SeguroVigenciaSnapshot[] = [];
  const segurosCobertura: SeguroCoberturaSnapshot[] = [];
  const passagens: PassagemSnapshot[] = [];
  const passagensCompra: PassagemCompraSnapshot[] = [];
  const passagensVolta: PassagemVoltaSnapshot[] = [];
  const requisitosConsulado: RequisitoConsuladoSnapshot[] = [];
  const documentacaoIdentidade: DocumentacaoIdentidadeSnapshot[] = [];
  const janelaPassAntes = janelaPassagemAntesDias();
  const janelaPassDepois = janelaPassagemDepoisDias();
  const janelaVoltaAntes = janelaPassagemVoltaAntesDias();
  // Dia de referência do repasse (dias úteis Brasil — a operação repassa daqui).
  const hojeBR = hojeBrasilISO();
  // Dia de hoje (granularidade de dia; UTC basta para o filtro "programa futuro").
  const hojeISO = new Date().toISOString().slice(0, 10);

  for (const lote of emLotes(contratoIds, LOTE_IN)) {
    const { data: ps, error: e1 } = await supabase
      .from("parcelas")
      .select("id, contrato_id, status, paid_at")
      .in("contrato_id", lote);
    if (e1) throw new Error("Falha ao ler parcelas da retaguarda: " + e1.message);
    for (const p of ps ?? []) {
      parcelas.push({
        id: p.id as string,
        contratoId: p.contrato_id as string,
        status: (p.status as string) ?? "",
        paidAt: (p.paid_at as string) ?? null,
      });
    }

    const { data: pg, error: e2 } = await supabase
      .from("pagamentos")
      .select("parcela_id, contrato_id, external_payment_id")
      .in("contrato_id", lote);
    if (e2) throw new Error("Falha ao ler pagamentos da retaguarda: " + e2.message);
    for (const g of pg ?? []) {
      pagamentos.push({
        parcelaId: g.parcela_id as string,
        contratoId: g.contrato_id as string,
        externalPaymentId: (g.external_payment_id as string) ?? "",
      });
    }

    // Documentos VISÍVEIS ao fornecedor (compartilhado_fornecedor = true — o
    // governador real da visibilidade da escola, ver rota de download do
    // fornecedor), com a janela de arrependimento do contrato para a checagem
    // D+7. A janela é o carimbo gravado (data_fim_arrependimento) ou, na falta,
    // o aceite (created_at) + 7 dias — mesma regra da trava preventiva. O
    // carimbo do compartilhamento (compartilhado_em) pode faltar mesmo com a
    // visibilidade ligada (deriva fora do sistema): o motor emite um achado
    // próprio nesse caso.
    const { data: docs, error: e3 } = await supabase
      .from("documentos")
      .select(
        "id, contrato_id, compartilhado_em, contrato:contratos(data_fim_arrependimento, created_at, processamento_imediato, processamento_imediato_marcado_em)",
      )
      .in("contrato_id", lote)
      .eq("compartilhado_fornecedor", true);
    if (e3) throw new Error("Falha ao ler documentos compartilhados da retaguarda: " + e3.message);
    for (const d of docs ?? []) {
      const rel: any = (d as any).contrato;
      const c = Array.isArray(rel) ? rel[0] : rel;
      const carimbo = (c?.data_fim_arrependimento as string) ?? null;
      const aceite = (c?.created_at as string) ?? null;
      const janelaFimISO =
        carimbo ?? (aceite ? prazoArrependimentoRemessaISO(aceite) : null);
      docsCompartilhados.push({
        docId: (d as any).id as string,
        contratoId: (d as any).contrato_id as string,
        compartilhadoEmISO: ((d as any).compartilhado_em as string) ?? null,
        janelaFimISO,
        processamentoImediato: Boolean(c?.processamento_imediato),
        processamentoImediatoMarcadoEmISO: (c?.processamento_imediato_marcado_em as string) ?? null,
      });
    }

    // Alterações de ESCOPO/aditivo APLICADAS dos contratos do tenant, para a
    // checagem "alteração de preço sem aceite". Filtro grosso no SQL; o veredito
    // (aditivo_aceito_em nulo) fica no motor puro.
    const { data: alts, error: e4 } = await supabase
      .from("alteracoes")
      .select("id, contrato_id, tipo, status, delta, aditivo_aceito_em")
      .in("contrato_id", lote)
      .eq("status", "aplicado")
      .eq("tipo", "escopo")
      .gt("delta", 0);
    if (e4) throw new Error("Falha ao ler alteracoes da retaguarda: " + e4.message);
    for (const a of alts ?? []) {
      alteracoes.push({
        id: (a as any).id as string,
        contratoId: (a as any).contrato_id as string,
        tipo: (a as any).tipo as string,
        status: (a as any).status as string,
        delta: (a as any).delta == null ? null : Number((a as any).delta),
        aditivoAceitoEmISO: ((a as any).aditivo_aceito_em as string) ?? null,
      });
    }

    // Repactuações APLICADAS dos contratos do tenant, para a checagem
    // "repactuação sem aceite". Filtro grosso no SQL (só as aplicadas); o
    // veredito (aceito_em nulo) fica no motor puro.
    const { data: reps, error: e5 } = await supabase
      .from("repactuacoes")
      .select("id, contrato_id, status, aceito_em")
      .in("contrato_id", lote)
      .eq("status", "aplicada");
    if (e5) throw new Error("Falha ao ler repactuacoes da retaguarda: " + e5.message);
    for (const r of reps ?? []) {
      repactuacoes.push({
        id: (r as any).id as string,
        contratoId: (r as any).contrato_id as string,
        status: (r as any).status as string,
        aceitoEmISO: ((r as any).aceito_em as string) ?? null,
      });
    }

    // Documentos com VALIDADE gravada, para o agente de Vistos (validade vs.
    // exigência do destino). Traz a data_inicio do contrato para calcular a
    // data-limite (início + buffer). Escopo preventivo: só programas que ainda
    // não começaram (data_inicio >= hoje) — depois do embarque o alerta perde a
    // ação. Filtro grosso no SQL (validade not null); o veredito fica no motor.
    // Exclui seguro_saude: a validade da apólice tem regra própria (cobrir o
    // período do programa, não o buffer de passaporte +6m) — é do agente de
    // Seguro, abaixo. Aplicar o buffer de passaporte à apólice super-flagraria
    // programas curtos.
    const { data: docsV, error: e6 } = await supabase
      .from("documentos")
      .select("id, contrato_id, validade, contrato:contratos(data_inicio)")
      .in("contrato_id", lote)
      .not("validade", "is", null)
      .neq("tipo_documento", "seguro_saude");
    if (e6) throw new Error("Falha ao ler validade de documentos da retaguarda: " + e6.message);
    for (const d of docsV ?? []) {
      const rel: any = (d as any).contrato;
      const c = Array.isArray(rel) ? rel[0] : rel;
      const dataInicio = (c?.data_inicio as string) ?? null;
      const validade = ((d as any).validade as string) ?? null;
      if (!dataInicio || !validade) continue;
      const inicioDia = dataInicio.slice(0, 10);
      // Preventivo: ignora programas já iniciados (janela de ação encerrada).
      if (inicioDia < hojeISO) continue;
      const referenciaISO = adicionarMesesISO(inicioDia, bufferValidadeMeses);
      if (!referenciaISO) continue;
      docsValidade.push({
        docId: (d as any).id as string,
        contratoId: (d as any).contrato_id as string,
        validadeISO: validade.slice(0, 10),
        referenciaISO,
      });
    }

    // Cartas de recusa de visto, para o agente de Vistos (prazo de repasse ao
    // fornecedor, Cláusula 10.3.1: 1 dia útil do recebimento). O recebimento é o
    // created_at do documento; o repasse é o compartilhamento com o fornecedor.
    // Filtro grosso no SQL (tipo); o veredito (atrasada e não repassada) fica no
    // motor puro, que só compara o prazo (calculado aqui em dias úteis) com hoje.
    const { data: cartas, error: e7 } = await supabase
      .from("documentos")
      .select("id, contrato_id, created_at, compartilhado_fornecedor, compartilhado_em")
      .in("contrato_id", lote)
      .eq("tipo_documento", TIPO_CARTA_RECUSA_VISTO);
    if (e7) throw new Error("Falha ao ler cartas de recusa da retaguarda: " + e7.message);
    for (const c of cartas ?? []) {
      const recebidoISO = ((c as any).created_at as string) ?? null;
      if (!recebidoISO) continue;
      const prazoRepasseISO = somarDiasUteis(recebidoISO.slice(0, 10), PRAZO_REPASSE_CARTA_RECUSA_DIAS_UTEIS, feriados);
      const compartilhado =
        (c as any).compartilhado_fornecedor === true && !!(c as any).compartilhado_em;
      cartasRecusa.push({
        docId: (c as any).id as string,
        contratoId: (c as any).contrato_id as string,
        compartilhado,
        prazoRepasseISO,
        hojeISO: hojeBR,
      });
    }

    // Seguro: contratos ATIVOS (não cancelados) com data de início, para checar a
    // ausência de apólice antes do embarque. Traz titular_id p/ verificar a
    // apólice no acervo do titular (as apólices vêm em nível de titular, sem
    // contrato_id). Cancelados (cancelado_em não nulo) ficam de fora — não faz
    // sentido cobrar seguro de uma viagem que não vai acontecer.
    const { data: contratos, error: e8 } = await supabase
      .from("contratos")
      .select("id, titular_id, data_inicio, data_fim, cancelado_em, pais_destino, estudante_data_nascimento")
      .in("id", lote)
      .is("cancelado_em", null)
      .not("data_inicio", "is", null);
    if (e8) throw new Error("Falha ao ler contratos p/ seguro da retaguarda: " + e8.message);
    const linhasContrato = (contratos ?? []) as Array<{ id: string; titular_id: string | null; data_inicio: string | null; data_fim: string | null; pais_destino: string | null; estudante_data_nascimento: string | null }>;
    const titularIds = Array.from(
      new Set(linhasContrato.map((c) => c.titular_id).filter((t): t is string => !!t)),
    );
    // Nº de contratos (programas) por titular no escopo. A checagem de VOLTA vs.
    // fim do programa só é confiável quando o titular tem UM único programa: os
    // bilhetes são nível-titular (sem vínculo a contrato), então com vários
    // programas a volta de um mascara ou é atribuída erroneamente a outro (achado
    // da revisão). Nesse caso a checagem é omitida (advisory, não trava).
    const contratosPorTitular = new Map<string, number>();
    for (const c of linhasContrato) {
      if (c.titular_id) contratosPorTitular.set(c.titular_id, (contratosPorTitular.get(c.titular_id) ?? 0) + 1);
    }
    // Titulares que TÊM ao menos uma apólice de seguro no acervo, e a MELHOR
    // (maior) validade entre as apólices de cada titular — insumo da vigência.
    const titularesComSeguro = new Set<string>();
    const melhorValidadePorTitular = new Map<string, string>();
    // Maior cobertura por titular E por moeda (comparação só na mesma moeda).
    const coberturaPorTitularMoeda = new Map<string, Map<string, number>>();
    for (const loteTit of emLotes(titularIds, LOTE_IN)) {
      const { data: segs, error: e9 } = await supabase
        .from("documentos")
        .select("titular_id, validade, cobertura_valor, cobertura_moeda")
        .in("titular_id", loteTit)
        .eq("tipo_documento", "seguro_saude");
      if (e9) throw new Error("Falha ao ler apólices de seguro da retaguarda: " + e9.message);
      for (const s of segs ?? []) {
        const t = (s as { titular_id?: string }).titular_id;
        if (!t) continue;
        titularesComSeguro.add(t);
        const val = ((s as { validade?: string | null }).validade ?? "").slice(0, 10);
        if (val) {
          const atual = melhorValidadePorTitular.get(t);
          // "Melhor" cobertura = a de maior validade (comparação lexicográfica de YYYY-MM-DD).
          if (!atual || val > atual) melhorValidadePorTitular.set(t, val);
        }
        const cobValor = Number((s as { cobertura_valor?: unknown }).cobertura_valor);
        const cobMoeda = (((s as { cobertura_moeda?: unknown }).cobertura_moeda as string) || "").trim().toUpperCase();
        // > 0: cobertura 0 é tratada como "não informada" (placeholder), não como
        // cobertura zero real — evita falso-positivo por um 0 de preenchimento.
        if (Number.isFinite(cobValor) && cobValor > 0 && cobMoeda) {
          let porMoeda = coberturaPorTitularMoeda.get(t);
          if (!porMoeda) { porMoeda = new Map<string, number>(); coberturaPorTitularMoeda.set(t, porMoeda); }
          const atual = porMoeda.get(cobMoeda);
          if (atual === undefined || cobValor > atual) porMoeda.set(cobMoeda, cobValor);
        }
      }
    }

    // Bilhetes aéreos do titular (agente de Passagens): datas de ida (para a
    // compatibilidade com o início), a compra MAIS ANTIGA (para "compra posterior
    // ao visto") e a volta MAIS TARDIA (para "volta vs. fim do programa"). Lista
    // de idas por titular; menor compra; maior volta.
    const idasPorTitular = new Map<string, string[]>();
    const minCompraPorTitular = new Map<string, string>();
    const maxVoltaPorTitular = new Map<string, string>();
    for (const loteTit of emLotes(titularIds, LOTE_IN)) {
      const { data: pass, error: e10 } = await supabase
        .from("documentos")
        .select("titular_id, passagem_data_ida, passagem_data_compra, passagem_data_volta")
        .in("titular_id", loteTit)
        .eq("tipo_documento", "passagem_aerea");
      if (e10) throw new Error("Falha ao ler passagens da retaguarda: " + e10.message);
      for (const p of pass ?? []) {
        const t = (p as { titular_id?: string }).titular_id;
        if (!t) continue;
        const ida = ((p as { passagem_data_ida?: string | null }).passagem_data_ida ?? "").slice(0, 10);
        if (ida) {
          const arr = idasPorTitular.get(t);
          if (arr) arr.push(ida); else idasPorTitular.set(t, [ida]);
        }
        const compra = ((p as { passagem_data_compra?: string | null }).passagem_data_compra ?? "").slice(0, 10);
        if (compra) {
          const atual = minCompraPorTitular.get(t);
          if (!atual || compra < atual) minCompraPorTitular.set(t, compra);
        }
        const voltaData = ((p as { passagem_data_volta?: string | null }).passagem_data_volta ?? "").slice(0, 10);
        if (voltaData) {
          const atual = maxVoltaPorTitular.get(t);
          if (!atual || voltaData > atual) maxVoltaPorTitular.set(t, voltaData);
        }
      }
    }

    // Documento de visto do titular: a data (created_at) do visto MAIS ANTIGO —
    // marco a partir do qual comprar o bilhete é seguro. Qualquer tipo de visto.
    const minVistoPorTitular = new Map<string, string>();
    for (const loteTit of emLotes(titularIds, LOTE_IN)) {
      const { data: vistos, error: e11 } = await supabase
        .from("documentos")
        .select("titular_id, created_at")
        .in("titular_id", loteTit)
        .in("tipo_documento", Array.from(TIPOS_VISTO));
      if (e11) throw new Error("Falha ao ler vistos da retaguarda: " + e11.message);
      for (const v of vistos ?? []) {
        const t = (v as { titular_id?: string }).titular_id;
        // created_at é timestamptz; a data de compra é DATE no calendário do
        // admin (Brasil). Truncar o created_at em UTC (slice) desalinharia os dois
        // (upload noturno BRT vira o dia seguinte em UTC), gerando falso-positivo
        // no mesmo dia (achado da revisão). Converte para a data-calendário Brasil.
        const dt = dataBrasilDeISO((v as { created_at?: string | null }).created_at ?? null);
        if (!t || !dt) continue;
        const atual = minVistoPorTitular.get(t);
        if (!atual || dt < atual) minVistoPorTitular.set(t, dt);
      }
    }

    // Tipos de documento presentes no acervo por titular (agente de Vistos,
    // "requisitos publicados do consulado"). Só lê quando HÁ requisito configurado
    // — sem config, o agente não roda e a query é dispensável. É nível-titular
    // (qualquer contrato_id) porque o checklist é do titular, não da parcela.
    const tiposPorTitular = new Map<string, Set<string>>();
    if (requisitosConsuladoPorPais.size > 0) {
      for (const loteTit of emLotes(titularIds, LOTE_IN)) {
        const { data: docsT, error: e12 } = await supabase
          .from("documentos")
          .select("titular_id, tipo_documento")
          .in("titular_id", loteTit);
        if (e12) throw new Error("Falha ao ler tipos de documento da retaguarda: " + e12.message);
        for (const d of docsT ?? []) {
          const t = (d as { titular_id?: string }).titular_id;
          // Normaliza a caixa (igual ao loader dos exigidos): os dois lados da
          // comparação ficam na forma canônica lowercase, blindando contra dado
          // legado com caixa divergente (evita contar um exigido presente como
          // faltante).
          const tipo = ((d as { tipo_documento?: string | null }).tipo_documento ?? "").trim().toLowerCase();
          if (!t || !tipo) continue;
          const set = tiposPorTitular.get(t);
          if (set) set.add(tipo); else tiposPorTitular.set(t, new Set([tipo]));
        }
      }
    }

    // Identidade por documento (agente de Documentação): nome, nascimento e
    // passaporte de CADA documento do titular. É nível-titular (todos os docs do
    // titular devem concordar). Guarda as listas brutas por titular; o motor
    // normaliza e conta divergências. PII: nunca logamos os valores.
    const identidadePorTitular = new Map<string, { nomes: string[]; nascimentos: string[]; passaportes: string[] }>();
    for (const loteTit of emLotes(titularIds, LOTE_IN)) {
      const { data: docsId, error: e13 } = await supabase
        .from("documentos")
        .select("titular_id, doc_nome, doc_data_nascimento, doc_passaporte")
        .in("titular_id", loteTit);
      if (e13) throw new Error("Falha ao ler identidade de documentos da retaguarda: " + e13.message);
      for (const d of docsId ?? []) {
        const t = (d as { titular_id?: string }).titular_id;
        if (!t) continue;
        const nome = (d as { doc_nome?: string | null }).doc_nome ?? "";
        const nasc = ((d as { doc_data_nascimento?: string | null }).doc_data_nascimento ?? "").slice(0, 10);
        const pass = (d as { doc_passaporte?: string | null }).doc_passaporte ?? "";
        if (!nome && !nasc && !pass) continue;
        const e = identidadePorTitular.get(t) ?? { nomes: [], nascimentos: [], passaportes: [] };
        if (nome) e.nomes.push(nome);
        if (nasc) e.nascimentos.push(nasc);
        if (pass) e.passaportes.push(pass);
        identidadePorTitular.set(t, e);
      }
    }

    // Nome canônico do titular (âncora da comparação de identidade): um único doc
    // divergente do cadastro já é pego, sem depender de haver 2 documentos.
    const nomePorTitular = new Map<string, string>();
    for (const loteTit of emLotes(titularIds, LOTE_IN)) {
      const { data: tits, error: e14 } = await supabase
        .from("titulares")
        .select("id, nome_completo")
        .in("id", loteTit);
      if (e14) throw new Error("Falha ao ler titulares da retaguarda: " + e14.message);
      for (const t of tits ?? []) {
        const id = (t as { id?: string }).id;
        const nome = (t as { nome_completo?: string | null }).nome_completo ?? "";
        if (id && nome) nomePorTitular.set(id, nome);
      }
    }

    for (const c of linhasContrato) {
      const inicio = (c.data_inicio ?? "").slice(0, 10);
      if (!inicio) continue;
      const limiteAlertaISO = adicionarDiasISO(inicio, -janelaSeguroDias);
      if (!limiteAlertaISO) continue;
      segurosContrato.push({
        contratoId: c.id,
        temSeguro: !!c.titular_id && titularesComSeguro.has(c.titular_id),
        limiteAlertaISO,
        hojeISO,
      });
      // Vigência: só quando HÁ apólice com validade registrada (senão não há o
      // que julgar — a ausência de apólice é a outra checagem). Referência = FIM
      // do programa quando gravado (cobertura de todo o período); na falta, cai
      // para o início (um seguro que expira antes do embarque já não cobre).
      // Fail-safe: só aceitamos o fim se for POSTERIOR ao início — um data_fim
      // anterior ao início (typo) NUNCA pode rebaixar a referência e engolir um
      // alerta legítimo. A referência jamais desce abaixo do embarque.
      const coberturaAteISO = c.titular_id ? (melhorValidadePorTitular.get(c.titular_id) ?? null) : null;
      if (coberturaAteISO) {
        const fim = (c.data_fim ?? "").slice(0, 10);
        const referenciaISO = fim && fim > inicio ? fim : inicio;
        segurosVigencia.push({ contratoId: c.id, referenciaISO, coberturaAteISO });
      }

      // Cobertura vs. mínimo do destino: só quando o país do contrato tem mínimo
      // configurado E o titular tem cobertura registrada NA MESMA moeda do mínimo
      // (comparação sem conversão cambial). Do contrário, não há o que comparar.
      const pais = (c.pais_destino ?? "").trim().toLowerCase();
      const minimo = pais ? minimosCobertura.get(pais) : undefined;
      if (minimo && c.titular_id) {
        const coberturaValor = coberturaPorTitularMoeda.get(c.titular_id)?.get(minimo.moeda);
        if (coberturaValor !== undefined) {
          segurosCobertura.push({
            contratoId: c.id,
            coberturaValor,
            minimoValor: minimo.valor,
            moeda: minimo.moeda,
          });
        }
      }

      // Requisitos publicados do consulado (agente de Vistos): só quando o destino
      // tem checklist configurado E o programa ainda não começou (janela
      // preventiva — depois do embarque o alerta de doc faltante perde a ação,
      // igual à validade de documento acima). Os `presentes` são os tipos do
      // titular (Set vazio se nenhum); o motor calcula os faltantes.
      const exigidos = pais ? requisitosConsuladoPorPais.get(pais) : undefined;
      if (exigidos && inicio >= hojeISO) {
        const presentes = c.titular_id ? Array.from(tiposPorTitular.get(c.titular_id) ?? []) : [];
        requisitosConsulado.push({ contratoId: c.id, pais, exigidos, presentes });
      }

      // Documentação: consistência de identidade entre os documentos do titular.
      // Só quando o titular TEM documentos com identidade preenchida (senão não há
      // o que comparar). Junta os valores dos documentos com as âncoras canônicas
      // (nome do titular; nascimento do contrato) — assim um único doc divergente
      // do cadastro já é pego. O motor normaliza e conta divergências (sem expor
      // valor). É nível-titular como o consulado (o acervo é do titular).
      const identidade = c.titular_id ? identidadePorTitular.get(c.titular_id) : undefined;
      if (identidade) {
        const nomeCanonico = c.titular_id ? nomePorTitular.get(c.titular_id) : undefined;
        const nascCanonico = (c.estudante_data_nascimento ?? "").slice(0, 10);
        documentacaoIdentidade.push({
          contratoId: c.id,
          nomes: nomeCanonico ? [...identidade.nomes, nomeCanonico] : identidade.nomes,
          nascimentos: nascCanonico ? [...identidade.nascimentos, nascCanonico] : identidade.nascimentos,
          passaportes: identidade.passaportes,
        });
      }

      // Passagens: janela = início − antes .. início + depois (ASSIMÉTRICA).
      // PREFERE qualquer bilhete DENTRO da janela — se algum for compatível, é o
      // que vale (não flaga). Só quando NENHUM está na janela é que escolhe o mais
      // próximo (para a mensagem) e o motor sinaliza. Antes, "mais próximo por
      // distância" podia escolher um bilhete fora e ignorar outro compatível
      // (falso-positivo com janela assimétrica — achado da revisão).
      const idas = c.titular_id ? idasPorTitular.get(c.titular_id) : undefined;
      const limiteAntesISO = adicionarDiasISO(inicio, -janelaPassAntes);
      const limiteDepoisISO = adicionarDiasISO(inicio, janelaPassDepois);
      if (idas && idas.length > 0 && limiteAntesISO && limiteDepoisISO) {
        const dentro = idas.find((x) => x >= limiteAntesISO && x <= limiteDepoisISO);
        let vooIdaISO = dentro;
        if (!vooIdaISO) {
          // Nenhum compatível: escolhe o mais próximo só para a mensagem do achado.
          const inicioMs = Date.parse(inicio + "T00:00:00Z");
          let melhorDist = Number.POSITIVE_INFINITY;
          vooIdaISO = idas[0];
          for (const ida of idas) {
            const dist = Math.abs(Date.parse(ida + "T00:00:00Z") - inicioMs);
            if (Number.isFinite(dist) && dist < melhorDist) { melhorDist = dist; vooIdaISO = ida; }
          }
        }
        passagens.push({ contratoId: c.id, vooIdaISO, limiteAntesISO, limiteDepoisISO });
      }

      // Compra vs. visto: só quando o titular TEM visto (data) E bilhete com data
      // de compra. O motor sinaliza se a compra é anterior ao visto.
      if (c.titular_id) {
        const compraISO = minCompraPorTitular.get(c.titular_id);
        const vistoISO = minVistoPorTitular.get(c.titular_id);
        if (compraISO && vistoISO) {
          passagensCompra.push({ contratoId: c.id, compraISO, vistoISO });
        }
      }

      // Volta vs. fim do programa: só quando o contrato TEM fim (data_fim) E há
      // bilhete com data de volta E o titular tem UM único programa no escopo
      // (senão a volta agregada por titular mascara/atribui erro entre programas —
      // achado da revisão). Escolhe a volta MAIS TARDIA (candidata mais favorável)
      // e o limite mínimo aceitável = fim − tolerância. O motor sinaliza se nem a
      // volta mais tardia alcança o limite (aluno iria embora antes de terminar).
      // Fail-safe (igual à vigência acima): só usa o fim quando POSTERIOR ao início
      // — um data_fim < data_inicio (typo não barrado) não pode rebaixar o limite e
      // engolir/inventar um alerta.
      const fimPrograma = (c.data_fim ?? "").slice(0, 10);
      const titularUnicoPrograma = !!c.titular_id && contratosPorTitular.get(c.titular_id) === 1;
      if (fimPrograma && fimPrograma > inicio && titularUnicoPrograma && c.titular_id) {
        const vooVoltaISO = maxVoltaPorTitular.get(c.titular_id);
        const limiteVoltaISO = adicionarDiasISO(fimPrograma, -janelaVoltaAntes);
        if (vooVoltaISO && limiteVoltaISO) {
          passagensVolta.push({ contratoId: c.id, vooVoltaISO, limiteVoltaISO, fimProgramaISO: fimPrograma });
        }
      }
    }
  }

  return { parcelas, pagamentos, docsCompartilhados, alteracoes, repactuacoes, docsValidade, cartasRecusa, segurosContrato, segurosVigencia, segurosCobertura, passagens, passagensCompra, passagensVolta, requisitosConsulado, documentacaoIdentidade };
}

// Aplica o plano de reconciliação em `retaguarda_achado`. Escreve SEMPRE com
// tenant_id (guardrail tenant-isolation). Best-effort por linha: um erro isolado
// não derruba a varredura inteira (o próximo ciclo reconcilia de novo).
async function persistirPlano(
  supabase: SupabaseClient,
  tenantId: string,
  plano: ReturnType<typeof reconciliarAchados>,
  severidadePorChave: Map<string, SeveridadeAchado>,
): Promise<void> {
  const agora = new Date().toISOString();

  const inserir = (a: Achado) => ({
    tenant_id: tenantId,
    chave: a.chave,
    categoria: a.categoria,
    severidade: a.severidade,
    entidade_tipo: a.entidade.tipo,
    entidade_id: a.entidade.id,
    contrato_id: a.contratoId,
    resumo: a.resumo,
    status: "aberto",
    primeira_vez: agora,
    ultima_vez: agora,
    resolvido_em: null,
    updated_at: agora,
  });

  // Novos: insere. `ignoreDuplicates` protege a `primeira_vez`: se duas execuções
  // do cron se sobrepuserem e ambas classificarem o mesmo achado como "novo", o
  // segundo upsert NÃO sobrescreve a linha existente (que já carrega a primeira_vez
  // original) — o próximo ciclo o trata como "manter". Sem isso, o merge de
  // conflito resetaria primeira_vez para agora, apagando o histórico.
  if (plano.abrir.length > 0) {
    const { error } = await supabase
      .from("retaguarda_achado")
      .upsert(plano.abrir.map(inserir), { onConflict: "tenant_id,chave", ignoreDuplicates: true });
    if (error) console.error("[retaguarda] falha ao inserir achados novos:", error.message);
  }

  // Reabrir: voltou a aparecer depois de resolvido. Nunca silencioso. Reseta a
  // confirmação (um achado reaberto está ativo de novo; se depois for resolvido
  // como ALTO, volta a aguardar ack).
  for (const a of plano.reabrir) {
    const { error } = await supabase
      .from("retaguarda_achado")
      .update({
        status: "aberto",
        resolvido_em: null,
        confirmado: true,
        confirmado_por: null,
        confirmado_em: null,
        ultima_vez: agora,
        updated_at: agora,
        resumo: a.resumo,
      })
      .eq("tenant_id", tenantId)
      .eq("chave", a.chave);
    if (error) console.error("[retaguarda] falha ao reabrir achado:", error.message);
  }

  // Manter: só atualiza "visto por último" (e o resumo, caso o texto evolua).
  for (const a of plano.manter) {
    const { error } = await supabase
      .from("retaguarda_achado")
      .update({ ultima_vez: agora, updated_at: agora, resumo: a.resumo })
      .eq("tenant_id", tenantId)
      .eq("chave", a.chave);
    if (error) console.error("[retaguarda] falha ao manter achado:", error.message);
  }

  // Resolver: a inconsistência sumiu. Divide por severidade, FALHANDO SEGURO:
  //  - MÉDIO/BAIXO: resolve confirmado=TRUE (self-healing, sem atrito).
  //  - QUALQUER OUTRO (ALTO, ou severidade desconhecida/ausente): resolve com
  //    confirmado=FALSE (aguarda ack humano). Assim uma edição dos campos
  //    observados que "apague" a evidência não fecha o caso em silêncio — fica
  //    visível na fila de confirmação (achado da revisão F7). Tratar o
  //    desconhecido como aguarda-ack evita que uma chave sem severidade no mapa
  //    se auto-resolva por engano.
  const éSelfHealing = (c: string) => {
    const s = severidadePorChave.get(c);
    return s === "medio" || s === "baixo";
  };
  const resolverConfirmado = plano.resolver.filter(éSelfHealing);
  const resolverAlto = plano.resolver.filter((c) => !éSelfHealing(c));

  for (const lote of emLotes(resolverConfirmado, LOTE_IN)) {
    const { error } = await supabase
      .from("retaguarda_achado")
      .update({ status: "resolvido", resolvido_em: agora, confirmado: true, updated_at: agora })
      .eq("tenant_id", tenantId)
      .in("chave", lote);
    if (error) console.error("[retaguarda] falha ao resolver achados:", error.message);
  }
  for (const lote of emLotes(resolverAlto, LOTE_IN)) {
    const { error } = await supabase
      .from("retaguarda_achado")
      .update({ status: "resolvido", resolvido_em: agora, confirmado: false, updated_at: agora })
      .eq("tenant_id", tenantId)
      .in("chave", lote);
    if (error) console.error("[retaguarda] falha ao resolver achados aguardando ack:", error.message);
  }

  // Trilha da reconciliação: registra a rodada quando houve QUALQUER transição
  // aberto↔resolvido (a resolução automatica deixa de ser invisivel — pedido da
  // revisão F7). Best-effort (registrarAuditoriaAdmin nunca lança).
  const houveTransicao =
    plano.abrir.length + plano.reabrir.length + plano.resolver.length > 0;
  if (houveTransicao) {
    await registrarAuditoriaAdmin(supabase, {
      usuario: "sistema:retaguarda",
      acao: "retaguarda.reconciliacao",
      alvo: tenantId,
      detalhe: {
        novos: plano.abrir.map((a) => a.chave),
        reabertos: plano.reabrir.map((a) => a.chave),
        resolvidos_confirmados: resolverConfirmado,
        resolvidos_aguardando_ack: resolverAlto,
      },
    });
  }
}

/**
 * Varre a retaguarda do tenant do deploy: monta o snapshot, detecta, reconcilia
 * e persiste. Devolve os contadores da rodada. FALHA FECHADA no tenant.
 */
export async function varrerRetaguarda(supabase: SupabaseClient): Promise<ResumoVarredura> {
  const escopo = await resolverEscopoTenant(supabase);
  const membership = await membershipDoTenant(supabase, escopo);

  // Buffer de validade do agente de Vistos (por tenant do deploy).
  const bufferValidadeMeses = await carregarBufferValidadeMeses(supabase, escopo.tenantId);
  // Feriados Brasil (nacionais + do tenant) para o prazo de repasse da carta de
  // recusa em dias úteis (Cláusula 10.3.1). Falha -> Set vazio (só fim de semana).
  const feriados = await carregarFeriados(supabase, { pais: "brasil", tenantId: escopo.tenantId });
  const janelaSeguroDias = janelaAlertaSeguroDias();
  const minimosCobertura = await carregarMinimosCoberturaSeguro(supabase, escopo.tenantId);
  // Requisitos publicados do consulado por país (agente de Vistos, por tenant).
  const requisitosConsulado = await carregarRequisitosConsulado(supabase, escopo.tenantId);

  // Tenant sem contratos: nada a varrer, mas ainda resolve achados que porventura
  // tenham sobrado (contratos removidos) — a reconciliação cuida disso.
  const snap = await carregarSnapshot(supabase, membership.contratoIds, bufferValidadeMeses, feriados, janelaSeguroDias, minimosCobertura, requisitosConsulado);
  const atuais = detectarRetaguarda(snap);

  // Carrega TODOS os status (aberto E resolvido): a reconciliação precisa
  // distinguir "novo" (sem linha) de "reabrir" (linha resolvida que voltou) —
  // reabrir preserva a primeira_vez e conta certo. Carregar só os abertos faria
  // um recorrente parecer novo e apagaria o histórico.
  const { data: persistData, error } = await supabase
    .from("retaguarda_achado")
    .select("chave, status, severidade")
    .eq("tenant_id", escopo.tenantId);
  if (error) throw new Error("Falha ao ler achados persistidos: " + error.message);
  const persistidos: AchadoPersistido[] = (persistData ?? []).map((r) => ({
    chave: r.chave as string,
    status: r.status as "aberto" | "resolvido",
    severidade: r.severidade as SeveridadeAchado,
  }));

  // Severidade por chave (persistida + atual) para dividir a resolução: um ALTO
  // que some resolve aguardando ack; MÉDIO/BAIXO resolve confirmado.
  const severidadePorChave = new Map<string, SeveridadeAchado>();
  for (const p of persistidos) if (p.severidade) severidadePorChave.set(p.chave, p.severidade);
  for (const a of atuais) severidadePorChave.set(a.chave, a.severidade);

  const plano = reconciliarAchados(atuais, persistidos);
  await persistirPlano(supabase, escopo.tenantId, plano, severidadePorChave);

  // Novos ALTO = abertos + reabertos com severidade alta. Base do alerta interno.
  const novosAlto = [...plano.abrir, ...plano.reabrir].filter((a) => a.severidade === "alto");

  return {
    tenantId: escopo.tenantId,
    contratos: membership.contratoIds.length,
    achadosAtuais: atuais.length,
    novos: plano.abrir.length,
    reabertos: plano.reabrir.length,
    mantidos: plano.manter.length,
    resolvidos: plano.resolver.length,
    abertosTotal: atuais.length,
    novosAlto,
  };
}
