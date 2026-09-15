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
  type SeveridadeAchado,
} from "@/lib/retaguarda";
import { prazoArrependimentoRemessaISO } from "@/lib/trava-remessa";
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

// Monta os arrays do snapshot lendo só os contratos do tenant. Loteia o .in().
async function carregarSnapshot(
  supabase: SupabaseClient,
  contratoIds: string[],
): Promise<{
  parcelas: ParcelaSnapshot[];
  pagamentos: PagamentoSnapshot[];
  docsCompartilhados: DocCompartilhadoSnapshot[];
  alteracoes: AlteracaoSnapshot[];
}> {
  const parcelas: ParcelaSnapshot[] = [];
  const pagamentos: PagamentoSnapshot[] = [];
  const docsCompartilhados: DocCompartilhadoSnapshot[] = [];
  const alteracoes: AlteracaoSnapshot[] = [];

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
  }

  return { parcelas, pagamentos, docsCompartilhados, alteracoes };
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

  // Resolver: a inconsistência sumiu. Divide por severidade:
  //  - ALTO: resolve com confirmado=FALSE (aguarda ack humano). Assim uma edição
  //    dos campos observados que "apague" a evidência não fecha o caso em
  //    silêncio — fica visível na fila de confirmação (achado da revisão F7).
  //  - MÉDIO/BAIXO: resolve confirmado=TRUE (self-healing, sem atrito).
  const resolverAlto = plano.resolver.filter((c) => severidadePorChave.get(c) === "alto");
  const resolverConfirmado = plano.resolver.filter((c) => severidadePorChave.get(c) !== "alto");

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
    if (error) console.error("[retaguarda] falha ao resolver achados ALTO:", error.message);
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

  // Tenant sem contratos: nada a varrer, mas ainda resolve achados que porventura
  // tenham sobrado (contratos removidos) — a reconciliação cuida disso.
  const snap = await carregarSnapshot(supabase, membership.contratoIds);
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
