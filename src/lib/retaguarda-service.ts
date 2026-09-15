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
  type SeveridadeAchado,
  adicionarMesesISO,
  adicionarDiasISO,
  TIPO_CARTA_RECUSA_VISTO,
  PRAZO_REPASSE_CARTA_RECUSA_DIAS_UTEIS,
} from "@/lib/retaguarda";
import { prazoArrependimentoRemessaISO } from "@/lib/trava-remessa";
import { somarDiasUteis, type Feriados } from "@/lib/dias-uteis";
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
const SEGURO_ALERTA_DIAS_ANTES_EMBARQUE_PADRAO = 30;
function janelaAlertaSeguroDias(): number {
  const env = Number(process.env.SEGURO_ALERTA_DIAS_ANTES);
  return Number.isFinite(env) && env >= 0 ? Math.round(env) : SEGURO_ALERTA_DIAS_ANTES_EMBARQUE_PADRAO;
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
): Promise<{
  parcelas: ParcelaSnapshot[];
  pagamentos: PagamentoSnapshot[];
  docsCompartilhados: DocCompartilhadoSnapshot[];
  alteracoes: AlteracaoSnapshot[];
  repactuacoes: RepactuacaoSnapshot[];
  docsValidade: DocValidadeSnapshot[];
  cartasRecusa: CartaRecusaSnapshot[];
  segurosContrato: SeguroContratoSnapshot[];
}> {
  const parcelas: ParcelaSnapshot[] = [];
  const pagamentos: PagamentoSnapshot[] = [];
  const docsCompartilhados: DocCompartilhadoSnapshot[] = [];
  const alteracoes: AlteracaoSnapshot[] = [];
  const repactuacoes: RepactuacaoSnapshot[] = [];
  const docsValidade: DocValidadeSnapshot[] = [];
  const cartasRecusa: CartaRecusaSnapshot[] = [];
  const segurosContrato: SeguroContratoSnapshot[] = [];
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
    const { data: docsV, error: e6 } = await supabase
      .from("documentos")
      .select("id, contrato_id, validade, contrato:contratos(data_inicio)")
      .in("contrato_id", lote)
      .not("validade", "is", null);
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
      .select("id, titular_id, data_inicio, cancelado_em")
      .in("id", lote)
      .is("cancelado_em", null)
      .not("data_inicio", "is", null);
    if (e8) throw new Error("Falha ao ler contratos p/ seguro da retaguarda: " + e8.message);
    const linhasContrato = (contratos ?? []) as Array<{ id: string; titular_id: string | null; data_inicio: string | null }>;
    const titularIds = Array.from(
      new Set(linhasContrato.map((c) => c.titular_id).filter((t): t is string => !!t)),
    );
    // Titulares que TÊM ao menos uma apólice de seguro no acervo.
    const titularesComSeguro = new Set<string>();
    for (const loteTit of emLotes(titularIds, LOTE_IN)) {
      const { data: segs, error: e9 } = await supabase
        .from("documentos")
        .select("titular_id")
        .in("titular_id", loteTit)
        .eq("tipo_documento", "seguro_saude");
      if (e9) throw new Error("Falha ao ler apólices de seguro da retaguarda: " + e9.message);
      for (const s of segs ?? []) {
        const t = (s as { titular_id?: string }).titular_id;
        if (t) titularesComSeguro.add(t);
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
    }
  }

  return { parcelas, pagamentos, docsCompartilhados, alteracoes, repactuacoes, docsValidade, cartasRecusa, segurosContrato };
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

  // Tenant sem contratos: nada a varrer, mas ainda resolve achados que porventura
  // tenham sobrado (contratos removidos) — a reconciliação cuida disso.
  const snap = await carregarSnapshot(supabase, membership.contratoIds, bufferValidadeMeses, feriados, janelaSeguroDias);
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
