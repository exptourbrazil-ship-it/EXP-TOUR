// Carregador e materializador da Fila do Dia (server-only: usa a service role).
// Compoe a fila a partir de fontes reais + tarefas abertas e prioriza com os
// helpers puros de fila-do-dia.ts. So deve ser importado por server components /
// rotas de API. Ver docs/07 (3.1) e src/lib/fila-do-dia.ts.
import { createClient } from "@supabase/supabase-js";
import {
  idadeEmDias,
  diasDeAtraso,
  estadoPrazo,
  ordenarFila,
  filtrarPorPapel,
  filtrarMinhas,
  contarMinhas,
  podeVerItem,
  mesmaDataUTC,
  SLA_ANALISE_DOCUMENTO_DIAS,
  DIAS_COBRANCA_HUMANA,
  SLA_PROPOSTA_PARADA_DIAS,
  SLA_CONFIRMACAO_FORNECEDOR_DIAS,
  type ItemFila,
  type CategoriaFila,
  type EstadoPrazo,
  type EstadoTask,
} from "@/lib/fila-do-dia";
import { labelTipoExcecao, papelAlvoDoTipo, slaDiasDoTipo } from "@/lib/excecao";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { resolverEscopoTenant, membershipDoTenant, type MembershipTenant } from "@/lib/cron-tenant";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export type FilaDoDia = {
  itens: ItemFila[];
  contadores: { total: number; documentos: number; parcelas: number; excecoes: number; estourados: number; minhas: number };
};

// Item de uma fonte automatica ao vivo, com os campos extras que a
// materializacao precisa (papel-alvo, alvo e chave de dedupe).
type FonteItem = ItemFila & {
  chaveDedupe: string;
  papelAlvo: string;
  alvoTipo: string;
  alvoId: string;
};

// Extrai o nome do titular de um embed do Supabase (objeto ou array de 1).
function nomeDe(rel: unknown): string | undefined {
  if (!rel) return undefined;
  const obj = Array.isArray(rel) ? rel[0] : rel;
  const nome = (obj as { nome_completo?: string } | undefined)?.nome_completo;
  return nome || undefined;
}

// Fontes automaticas ao vivo da v1: documentos a analisar e parcelas em D+10.
//
// Multi-tenant (ver docs/deploy-multi-tenant.md): quando `membership` e passado
// (pelo cron materializar-tasks, escopado ao tenant do deploy), cada fonte e
// filtrada pela posse do tenant — documentos/excecoes pelo titular, parcelas pelo
// contrato, quote pelo tenant_id, confirmacoes pelo fornecedor. Sem `membership`
// (tela admin ao vivo, comportamento atual) a coleta e global.
async function coletarFontesAoVivo(
  supabase: ReturnType<typeof getSupabase>,
  agoraMs: number,
  membership?: MembershipTenant
): Promise<FonteItem[]> {
  const hojeISO = new Date(agoraMs).toISOString().slice(0, 10);
  const limiteD10 = new Date(agoraMs - DIAS_COBRANCA_HUMANA * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const fontes: FonteItem[] = [];

  // Falha FECHADA nas tres fontes: a reconciliacao do materializador conclui
  // tasks cuja fonte "sumiu" da lista viva. Se uma query falhar em silencio, a
  // lista fica parcial e a reconciliacao concluiria tasks indevidamente (ate o
  // E1 "contato em 24h"). Por isso, qualquer erro de leitura ABORTA a coleta.
  let qDocs = supabase
    .from("documentos")
    .select("id, created_at, titular_id, titular:titulares(nome_completo)")
    .eq("origem", "titular")
    .eq("status", "pendente");
  if (membership) qDocs = qDocs.in("titular_id", membership.titularIds);
  const { data: docs, error: errDocs } = await qDocs.order("created_at", { ascending: true });
  if (errDocs) throw new Error("Falha ao ler documentos da fila: " + errDocs.message);

  for (const d of docs ?? []) {
    const idade = idadeEmDias(d.created_at, agoraMs);
    fontes.push({
      categoria: "documento",
      titulo: "Documento aguardando análise",
      contexto: nomeDe(d.titular),
      // Deep-link direto ao Caso 360 do titular na aba certa (principio "operado
      // pela fila"): um clique leva a ACAO, nao a uma lista generica.
      href: d.titular_id ? `/admin/clientes/${d.titular_id}?aba=documentos` : "/admin/documentos",
      criadoEm: d.created_at,
      idadeDias: idade,
      estado: estadoPrazo(idade, SLA_ANALISE_DOCUMENTO_DIAS),
      chaveDedupe: `documento:${d.id}`,
      papelAlvo: "operacao",
      alvoTipo: "documento",
      alvoId: d.id,
    });
  }

  let qParcelas = supabase
    .from("parcelas")
    .select("id, vencimento, contrato_id, contrato:contratos(titular_id, titular:titulares(nome_completo))")
    .neq("status", "pago")
    .lte("vencimento", limiteD10);
  if (membership) qParcelas = qParcelas.in("contrato_id", membership.contratoIds);
  const { data: parcelas, error: errParcelas } = await qParcelas.order("vencimento", { ascending: true });
  if (errParcelas) throw new Error("Falha ao ler parcelas da fila: " + errParcelas.message);

  for (const p of parcelas ?? []) {
    if (!p.vencimento) continue;
    const atraso = diasDeAtraso(p.vencimento, hojeISO);
    const contratoRel = (p as { contrato?: unknown }).contrato;
    const contratoObj = Array.isArray(contratoRel) ? contratoRel[0] : contratoRel;
    const titularIdParcela = (contratoObj as { titular_id?: string } | undefined)?.titular_id;
    fontes.push({
      categoria: "parcela",
      titulo: `Cobrança humana — parcela em D+${atraso}`,
      contexto: nomeDe((contratoObj as { titular?: unknown } | undefined)?.titular),
      // Deep-link ao Caso 360 do titular, aba Financeiro (um clique ate a acao).
      href: titularIdParcela ? `/admin/clientes/${titularIdParcela}?aba=financeiro` : "/admin/financeiro",
      criadoEm: p.vencimento,
      idadeDias: atraso,
      estado: "estourado",
      chaveDedupe: `parcela:${p.id}`,
      papelAlvo: "financeiro",
      alvoTipo: "parcela",
      alvoId: p.id,
    });
  }

  // Excecoes abertas por idade (doc 07 §1). Cada processo nao-terminal vira um
  // item da fila, ordenado primeiro (ordenarFila prioriza 'excecao'), com o
  // papel-alvo e o SLA do TIPO (E1 -> consultor/24h, E9 -> financeiro, etc.). A
  // chave `excecao:<id>` coincide com a da tarefa dedicada do E1 (visto-service),
  // entao o caso nao aparece duas vezes na fila.
  let qExcecoes = supabase
    .from("case_exceptions")
    .select("id, tipo, aberta_em, titular_id, titular:titulares(nome_completo)")
    .in("status", ["aberta", "em_andamento"]);
  if (membership) qExcecoes = qExcecoes.in("titular_id", membership.titularIds);
  const { data: excecoes, error: errExcecoes } = await qExcecoes.order("aberta_em", { ascending: true });
  if (errExcecoes) throw new Error("Falha ao ler excecoes da fila: " + errExcecoes.message);

  for (const e of excecoes ?? []) {
    const criadoEm = e.aberta_em || new Date(agoraMs).toISOString();
    const idade = idadeEmDias(criadoEm, agoraMs);
    fontes.push({
      categoria: "excecao",
      titulo: `Exceção: ${labelTipoExcecao(e.tipo)}`,
      contexto: nomeDe((e as { titular?: unknown }).titular),
      href: `/admin/clientes/${e.titular_id}`,
      criadoEm,
      idadeDias: idade,
      estado: estadoPrazo(idade, slaDiasDoTipo(e.tipo)),
      chaveDedupe: `excecao:${e.id}`,
      papelAlvo: papelAlvoDoTipo(e.tipo),
      alvoTipo: "excecao",
      alvoId: e.id,
    });
  }

  // Propostas PARADAS: emitidas (issued/viewed/option_selected) e paradas há >=
  // N dias, sem converter/expirar/cancelar. Follow-up do consultor.
  const limiteProposta = new Date(agoraMs - SLA_PROPOSTA_PARADA_DIAS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  let qPropostas = supabase
    .from("quote")
    .select("id, reference, issue_date, status")
    .in("status", ["issued", "viewed", "option_selected"])
    .lte("issue_date", limiteProposta);
  if (membership) qPropostas = qPropostas.eq("tenant_id", membership.tenantId);
  const { data: propostas, error: errPropostas } = await qPropostas.order("issue_date", { ascending: true });
  if (errPropostas) throw new Error("Falha ao ler propostas da fila: " + errPropostas.message);

  for (const q of propostas ?? []) {
    if (!q.issue_date) continue;
    const idade = idadeEmDias(q.issue_date, agoraMs);
    fontes.push({
      categoria: "proposta",
      titulo: "Proposta parada — sem avanço",
      contexto: q.reference ? `Proposta ${q.reference}` : undefined,
      href: `/admin/quotes/${q.id}`,
      criadoEm: q.issue_date,
      idadeDias: idade,
      estado: estadoPrazo(idade, SLA_PROPOSTA_PARADA_DIAS),
      chaveDedupe: `proposta:${q.id}`,
      papelAlvo: "consultor",
      alvoTipo: "quote",
      alvoId: q.id,
    });
  }

  // Confirmações de FORNECEDOR em atraso: pedidas ao fornecedor e sem resposta há
  // >= N dias (status 'pending'). Follow-up da Operação com o fornecedor.
  let qConfirmacoes = supabase
    .from("availability_confirmation")
    .select("id, kind, created_at, supplier:supplier(display_name)")
    .eq("status", "pending");
  if (membership) qConfirmacoes = qConfirmacoes.in("supplier_id", membership.supplierIds);
  const { data: confirmacoes, error: errConfirmacoes } = await qConfirmacoes.order("created_at", { ascending: true });
  if (errConfirmacoes) throw new Error("Falha ao ler confirmações da fila: " + errConfirmacoes.message);

  for (const c of confirmacoes ?? []) {
    const idade = idadeEmDias(c.created_at, agoraMs);
    if (idade < SLA_CONFIRMACAO_FORNECEDOR_DIAS) continue; // ainda dentro do prazo
    const supplierRel = (c as { supplier?: unknown }).supplier;
    const supplierObj = Array.isArray(supplierRel) ? supplierRel[0] : supplierRel;
    const nome = (supplierObj as { display_name?: string } | undefined)?.display_name;
    fontes.push({
      categoria: "fornecedor",
      titulo: "Confirmação de fornecedor em atraso",
      contexto: nome,
      href: "/admin/fornecedores",
      criadoEm: c.created_at,
      idadeDias: idade,
      estado: estadoPrazo(idade, SLA_CONFIRMACAO_FORNECEDOR_DIAS),
      chaveDedupe: `confirmacao:${c.id}`,
      papelAlvo: "operacao",
      alvoTipo: "availability_confirmation",
      alvoId: c.id,
    });
  }

  return fontes;
}

// Monta a fila de hoje. Compoe as fontes ao vivo + tarefas abertas (manuais ou
// materializadas cuja fonte ja resolveu), sem duplicar (dedupe por chaveDedupe),
// filtra pelo papel (gestor ve tudo) e prioriza. `agoraMs` injetavel para teste.
export async function carregarFilaDoDia(
  agoraMs: number = Date.now(),
  papel?: string,
  opts?: { usuarioAtual?: string; apenasMinhas?: boolean }
): Promise<FilaDoDia> {
  const supabase = getSupabase();

  const fontes = await coletarFontesAoVivo(supabase, agoraMs);
  const chavesLive = new Set(fontes.map((f) => f.chaveDedupe));

  // Estado das tasks persistidas (todas), indexado por chave_dedupe — para
  // anexar dono/estado aos itens da fonte viva e descartar os ja concluidos.
  const { data: tarefas } = await supabase
    .from("tasks")
    .select("id, categoria, titulo, contexto, href, papel, prazo, criado_em, chave_dedupe, dono, estado")
    .order("criado_em", { ascending: true });
  const tarefasList = tarefas ?? [];
  const porChave = new Map<string, { id: string; dono: string | null; estado: EstadoTask }>();
  for (const t of tarefasList) {
    if (t.chave_dedupe) porChave.set(t.chave_dedupe, { id: t.id, dono: t.dono ?? null, estado: (t.estado ?? "aberto") as EstadoTask });
  }

  const itens: ItemFila[] = [];

  // 1) Fontes vivas — anexa dono/estado da task quando existir; descarta as ja
  //    CONCLUIDAS (operador tratou, mesmo que a fonte demore a sumir da leitura).
  for (const f of fontes) {
    const task = f.chaveDedupe ? porChave.get(f.chaveDedupe) : undefined;
    if (task?.estado === "concluido") continue;
    itens.push({
      categoria: f.categoria,
      titulo: f.titulo,
      contexto: f.contexto,
      href: f.href,
      criadoEm: f.criadoEm,
      idadeDias: f.idadeDias,
      estado: f.estado,
      chaveDedupe: f.chaveDedupe,
      papelAlvo: f.papelAlvo,
      taskId: task?.id,
      dono: task?.dono ?? null,
      estadoTask: task?.estado ?? "aberto",
    });
  }

  // 2) Tarefas persistidas (manuais ou materializadas) cuja fonte NAO esta mais
  //    viva e que nao estao concluidas. `papel` roteia pelo dono-alvo.
  for (const t of tarefasList) {
    if ((t.estado ?? "aberto") === "concluido") continue;
    if (t.chave_dedupe && chavesLive.has(t.chave_dedupe)) continue; // ja representada pela fonte viva
    const idade = idadeEmDias(t.criado_em, agoraMs);
    const estourado = t.prazo ? Date.parse(t.prazo) < agoraMs : false;
    itens.push({
      categoria: (t.categoria ?? "outro") as CategoriaFila,
      papelAlvo: (t.papel ?? undefined) as string | undefined,
      titulo: t.titulo,
      contexto: t.contexto ?? undefined,
      href: t.href ?? undefined,
      criadoEm: t.criado_em,
      idadeDias: idade,
      estado: (estourado ? "estourado" : "no_prazo") as EstadoPrazo,
      chaveDedupe: t.chave_dedupe ?? undefined,
      taskId: t.id,
      dono: t.dono ?? null,
      estadoTask: (t.estado ?? "aberto") as EstadoTask,
    });
  }

  const visiveis = papel ? filtrarPorPapel(itens, papel) : itens;
  const ordenada = ordenarFila(visiveis);
  const minhas = contarMinhas(ordenada, opts?.usuarioAtual);
  const exibidos =
    opts?.apenasMinhas && opts?.usuarioAtual ? filtrarMinhas(ordenada, opts.usuarioAtual) : ordenada;

  return {
    itens: exibidos,
    contadores: {
      total: ordenada.length,
      documentos: ordenada.filter((i) => i.categoria === "documento").length,
      parcelas: ordenada.filter((i) => i.categoria === "parcela").length,
      excecoes: ordenada.filter((i) => i.categoria === "excecao").length,
      estourados: ordenada.filter((i) => i.estado === "estourado").length,
      minhas,
    },
  };
}

// Item da aba "Concluídas hoje": tarefa fechada no dia-calendário de hoje.
export type ItemConcluida = {
  chaveDedupe: string | null;
  categoria: CategoriaFila;
  titulo: string;
  contexto?: string;
  href?: string;
  papelAlvo?: string;
  dono?: string | null;
  concluidoEm: string; // ISO
};

// Lista as tarefas CONCLUÍDAS hoje, filtradas pelo papel (mesmo critério da
// fila: `podeVerItem`), mais recentes primeiro. Base da aba "Concluídas hoje"
// (com ação de reabrir). Só tarefas com chave_dedupe podem ser reabertas pela
// UI, mas listamos todas para dar visibilidade do que o time fechou.
export async function carregarConcluidasHoje(
  agoraMs: number,
  papel: string
): Promise<ItemConcluida[]> {
  // Falha FECHADA: sem papel, não vê nada (evita o anti-padrão `if (papel && …)`
  // que vazaria todas as concluídas quando o argumento faltasse).
  if (!papel) return [];
  const supabase = getSupabase();
  const inicioHojeISO = new Date(agoraMs).toISOString().slice(0, 10) + "T00:00:00.000Z";

  const { data } = await supabase
    .from("tasks")
    .select("categoria, titulo, contexto, href, papel, chave_dedupe, dono, concluido_em")
    .eq("estado", "concluido")
    .gte("concluido_em", inicioHojeISO)
    .order("concluido_em", { ascending: false });

  const itens: ItemConcluida[] = [];
  for (const t of data ?? []) {
    // Guarda-corpo extra: só o dia de hoje (UTC), coerente com o resto do módulo.
    if (!mesmaDataUTC(t.concluido_em, agoraMs)) continue;
    const categoria = (t.categoria ?? "outro") as CategoriaFila;
    const papelAlvo = (t.papel ?? undefined) as string | undefined;
    // RBAC: o admin só vê (e poderá reabrir) o que veria na fila pelo seu papel.
    if (!podeVerItem(papel, categoria, papelAlvo)) continue;
    itens.push({
      chaveDedupe: t.chave_dedupe ?? null,
      categoria,
      titulo: t.titulo,
      contexto: t.contexto ?? undefined,
      href: t.href ?? undefined,
      papelAlvo,
      dono: t.dono ?? null,
      concluidoEm: t.concluido_em as string,
    });
  }
  return itens;
}

export type ResultadoMaterializacao = { fontes: number; criadas: number; concluidas: number };

// Materializa as fontes automaticas em linhas de `tasks` (para ganharem estado,
// dono e historico) e reconcilia: tarefas automaticas abertas cuja fonte ja
// resolveu sao concluidas. Idempotente por `chave_dedupe`. Chamada pelo cron.
export async function materializarTasksDaFila(
  agoraMs: number = Date.now()
): Promise<ResultadoMaterializacao> {
  const supabase = getSupabase();

  // Multi-tenant (ver docs/deploy-multi-tenant.md): escopa a fila ao tenant do
  // deploy. `tasks` nao tem tenant_id — a coleta filtra pela posse (membership) e
  // a reconciliacao so conclui tarefas do tenant (mais os orfaos, no deploy do
  // tenant legado). Falha fechada: sem tenant, propaga o erro (o cron responde 500).
  const escopo = await resolverEscopoTenant(supabase);
  const membership = await membershipDoTenant(supabase, escopo);
  const fontes = await coletarFontesAoVivo(supabase, agoraMs, membership);

  // Insere as que ainda nao existem (mantem o estado das ja existentes).
  let criadas = 0;
  for (const f of fontes) {
    const { data, error } = await supabase
      .from("tasks")
      .upsert(
        {
          categoria: f.categoria,
          titulo: f.titulo,
          contexto: f.contexto ?? null,
          alvo_tipo: f.alvoTipo,
          alvo_id: f.alvoId,
          href: f.href ?? null,
          papel: f.papelAlvo,
          origem: "automatica",
          chave_dedupe: f.chaveDedupe,
        },
        { onConflict: "chave_dedupe", ignoreDuplicates: true }
      )
      .select("id");
    if (!error && data && data.length > 0) criadas += 1;
  }

  // Reconcilia: fonte sumiu (documento aprovado, parcela paga, excecao
  // resolvida) -> conclui a task. Inclui origem 'excecao' (a tarefa dedicada do
  // E1) alem de 'automatica', para que a tarefa se feche sozinha quando a
  // excecao e resolvida/cancelada — a fonte `excecao:<id>` deixa chavesLive.
  const chavesLive = new Set(fontes.map((f) => f.chaveDedupe));
  const { data: abertas } = await supabase
    .from("tasks")
    .select("id, chave_dedupe, alvo_tipo, alvo_id")
    .in("origem", ["automatica", "excecao"])
    .neq("estado", "concluido");

  // Candidatas a concluir: abertas cuja fonte ja nao esta viva NESTE tenant.
  const candidatas = (abertas ?? []).filter(
    (t) => t.chave_dedupe && !chavesLive.has(t.chave_dedupe)
  ) as { id: string; chave_dedupe: string; alvo_tipo: string | null; alvo_id: string | null }[];

  // Como `tasks` e global e a coleta foi escopada, so podemos concluir as
  // candidatas que PERTENCEM a este tenant — senao o deploy de um tenant fecharia
  // as tarefas do outro (cuja fonte simplesmente nao esta na sua lista viva). Os
  // ORFAOS (alvo apagado, sem tenant atribuivel) sao concluidos apenas pelo deploy
  // do tenant legado, preservando a limpeza que a reconciliacao global fazia.
  const { doTenant, orfaos } = await atribuirTasksAoTenant(supabase, membership, candidatas);
  const concluir = new Set<string>(doTenant);
  if (escopo.incluiLegado) for (const id of orfaos) concluir.add(id);

  let concluidas = 0;
  for (const t of candidatas) {
    if (!concluir.has(t.id)) continue;
    await supabase
      .from("tasks")
      .update({ estado: "concluido", concluido_em: new Date(agoraMs).toISOString() })
      .eq("id", t.id);
    concluidas += 1;
  }

  return { fontes: fontes.length, criadas, concluidas };
}

// Atribui cada task candidata ao tenant pela entidade-alvo (a mesma posse usada
// na coleta). Retorna as que pertencem a ESTE tenant e os ORFAOS (alvo inexistente
// — entidade apagada, sem tenant atribuivel). Tarefas de OUTRO tenant ficam de
// fora de ambos os conjuntos (o deploy dono as concluira). Tasks sem alvo tambem
// entram em `orfaos` (nao ha como atribuir; so o deploy legado as limpa).
async function atribuirTasksAoTenant(
  supabase: ReturnType<typeof getSupabase>,
  membership: MembershipTenant,
  tasks: { id: string; alvo_tipo: string | null; alvo_id: string | null }[]
): Promise<{ doTenant: Set<string>; orfaos: Set<string> }> {
  const titularSet = new Set(membership.titularIds);
  const contratoSet = new Set(membership.contratoIds);
  const supplierSet = new Set(membership.supplierIds);
  const doTenant = new Set<string>();
  const orfaos = new Set<string>();

  // Agrupa por tipo de alvo para resolver em lote.
  const porTipo = new Map<string, { taskId: string; alvoId: string }[]>();
  for (const t of tasks) {
    if (!t.alvo_tipo || !t.alvo_id) {
      orfaos.add(t.id); // sem alvo: nao ha como atribuir -> so o deploy legado limpa
      continue;
    }
    const arr = porTipo.get(t.alvo_tipo) ?? [];
    arr.push({ taskId: t.id, alvoId: t.alvo_id });
    porTipo.set(t.alvo_tipo, arr);
  }

  // Resolve, por tipo, o "dono" de cada alvo e classifica em doTenant/outro/orfao.
  // `tabela`/`coluna` e o dono; `pertence` decide se o dono e deste tenant.
  async function classificar(
    tipo: string,
    tabela: string,
    coluna: string,
    pertence: (dono: string | null) => boolean
  ) {
    const itens = porTipo.get(tipo);
    if (!itens || itens.length === 0) return;
    const dono = new Map<string, string | null>(); // alvoId -> valor da coluna dona
    for (let i = 0; i < itens.length; i += 500) {
      const lote = itens.slice(i, i + 500).map((x) => x.alvoId);
      const { data } = await supabase.from(tabela).select(`id, ${coluna}`).in("id", lote);
      for (const r of data ?? []) {
        dono.set((r as any).id, ((r as any)[coluna] as string | null) ?? null);
      }
    }
    for (const { taskId, alvoId } of itens) {
      if (!dono.has(alvoId)) { orfaos.add(taskId); continue; } // alvo apagado
      if (pertence(dono.get(alvoId) ?? null)) doTenant.add(taskId);
      // senao: alvo de outro tenant -> nao entra em nenhum conjunto
    }
  }

  const TIPOS_CONHECIDOS = new Set([
    "documento",
    "parcela",
    "excecao",
    "quote",
    "availability_confirmation",
  ]);
  await classificar("documento", "documentos", "titular_id", (d) => d != null && titularSet.has(d));
  await classificar("parcela", "parcelas", "contrato_id", (c) => c != null && contratoSet.has(c));
  await classificar("excecao", "case_exceptions", "titular_id", (t) => t != null && titularSet.has(t));
  await classificar("quote", "quote", "tenant_id", (t) => t === membership.tenantId);
  await classificar(
    "availability_confirmation",
    "availability_confirmation",
    "supplier_id",
    (s) => s != null && supplierSet.has(s)
  );

  // alvo_tipo nao mapeado (ex.: um tipo novo esquecido aqui): trata como orfao para
  // NAO interromper silenciosamente a reconciliacao — o deploy legado o conclui,
  // preservando a limpeza que a reconciliacao global fazia.
  for (const [tipo, itens] of porTipo) {
    if (TIPOS_CONHECIDOS.has(tipo)) continue;
    for (const { taskId } of itens) orfaos.add(taskId);
  }

  return { doTenant, orfaos };
}

// ── Ações sobre uma tarefa da fila (assumir / concluir / devolver) ───────────
// A fila é "operada": o admin ASSUME um item (vira dono, em_andamento), CONCLUI
// (concluido) ou DEVOLVE (solta o dono, volta a aberto). Itens de fonte viva
// ainda não materializados são criados on-demand A PARTIR DA PRÓPRIA FONTE
// (conteúdo do servidor, nunca do corpo) — o cliente só envia a chave_dedupe.
export type AcaoTarefa = "assumir" | "concluir" | "devolver" | "reabrir";

// Contexto de autorização de uma chave: papel/categoria (para o gate por papel),
// a FONTE VIVA quando presente e o id da task já persistida quando existe.
// A fonte viva (server-authoritative, fresca) tem PRECEDÊNCIA sobre a task
// persistida — mesma ordem da exibição — para que autorizar e exibir nunca
// divirjam (ex.: catálogo de papel-alvo mudou após a task materializada).
type ContextoChave = {
  papel: string | null;
  categoria: CategoriaFila;
  fonte: FonteItem | null;
  taskId: string | null;
};

async function resolverContexto(
  supabase: ReturnType<typeof getSupabase>,
  chaveDedupe: string,
  agoraMs: number
): Promise<ContextoChave | null> {
  const fontes = await coletarFontesAoVivo(supabase, agoraMs);
  const fonte = fontes.find((x) => x.chaveDedupe === chaveDedupe) ?? null;
  const { data: existente } = await supabase
    .from("tasks")
    .select("id, papel, categoria")
    .eq("chave_dedupe", chaveDedupe)
    .maybeSingle();
  const taskId = (existente?.id as string) ?? null;

  if (fonte) return { papel: fonte.papelAlvo ?? null, categoria: fonte.categoria, fonte, taskId };
  if (taskId)
    return {
      papel: (existente!.papel as string) ?? null,
      categoria: (existente!.categoria ?? "outro") as CategoriaFila,
      fonte: null,
      taskId,
    };
  return null; // sem fonte viva e sem task -> já resolvida/inexistente
}

// Materializa a task a partir da FONTE VIVA (server-authoritative). Só é
// chamada DEPOIS de autorizar — nada é inserido para um ator sem permissão.
async function materializarDaFonte(
  supabase: ReturnType<typeof getSupabase>,
  f: FonteItem
): Promise<string | null> {
  const { data: inserida } = await supabase
    .from("tasks")
    .upsert(
      {
        categoria: f.categoria,
        titulo: f.titulo,
        contexto: f.contexto ?? null,
        alvo_tipo: f.alvoTipo,
        alvo_id: f.alvoId,
        href: f.href ?? null,
        papel: f.papelAlvo,
        origem: "automatica",
        chave_dedupe: f.chaveDedupe,
      },
      { onConflict: "chave_dedupe", ignoreDuplicates: false }
    )
    .select("id")
    .maybeSingle();
  return (inserida?.id as string) ?? null;
}

export type ResultadoAcao = { ok: boolean; estado?: EstadoTask; erro?: "sem_permissao" };

export async function acaoTarefa(
  acao: AcaoTarefa,
  chaveDedupe: string,
  actor: string,
  papelActor: string,
  ip?: string | null,
  agoraMs: number = Date.now()
): Promise<ResultadoAcao> {
  if (!chaveDedupe) return { ok: false };
  const supabase = getSupabase();

  const ctx = await resolverContexto(supabase, chaveDedupe, agoraMs);
  if (!ctx) return { ok: false };

  // RBAC por AÇÃO — ANTES de qualquer escrita: o admin só opera o que veria na
  // fila (mesma regra e mesma fonte de papel/categoria da exibição). Nenhuma
  // task é materializada para um ator sem permissão.
  if (!podeVerItem(papelActor, ctx.categoria, ctx.papel)) {
    return { ok: false, erro: "sem_permissao" };
  }

  if (acao === "devolver") {
    // Devolver não materializa: sem task persistida, não há o que soltar.
    if (!ctx.taskId) return { ok: false };
    const { data } = await supabase.from("tasks").update({ dono: null, estado: "aberto" }).eq("id", ctx.taskId).select("id");
    if (!data || data.length === 0) return { ok: false };
    await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fila.tarefa.devolver", alvo: chaveDedupe, ip: ip ?? null });
    return { ok: true, estado: "aberto" };
  }

  if (acao === "reabrir") {
    // Reabrir uma tarefa concluída por engano: volta a 'aberto', solta o dono e
    // limpa concluido_em. Não materializa (a task já existe, pois está
    // concluída) e só afeta linhas de fato concluídas. Se a fonte já resolveu,
    // o cron pode reconcluí-la no próximo ciclo — comportamento aceito (o
    // trabalho de fato terminou); reabrir vale para tarefa de fonte ainda viva.
    if (!ctx.taskId) return { ok: false };
    const { data } = await supabase
      .from("tasks")
      .update({ estado: "aberto", dono: null, concluido_em: null })
      .eq("id", ctx.taskId)
      .eq("estado", "concluido")
      .select("id");
    if (!data || data.length === 0) return { ok: false };
    await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fila.tarefa.reabrir", alvo: chaveDedupe, ip: ip ?? null });
    return { ok: true, estado: "aberto" };
  }

  // assumir/concluir materializam on-demand (após autorizar) se a task ainda
  // não existe — o conteúdo vem da FONTE, nunca do corpo da requisição.
  let taskId = ctx.taskId;
  if (!taskId) {
    if (!ctx.fonte) return { ok: false };
    taskId = await materializarDaFonte(supabase, ctx.fonte);
    if (!taskId) return { ok: false };
  }

  if (acao === "assumir") {
    await supabase.from("tasks").update({ dono: actor, estado: "em_andamento" }).eq("id", taskId);
    await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fila.tarefa.assumir", alvo: chaveDedupe, ip: ip ?? null });
    return { ok: true, estado: "em_andamento" };
  }

  // concluir (dono pode ser nulo — operador tratou sem assumir)
  await supabase
    .from("tasks")
    .update({ estado: "concluido", concluido_em: new Date(agoraMs).toISOString() })
    .eq("id", taskId);
  await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fila.tarefa.concluir", alvo: chaveDedupe, ip: ip ?? null });
  return { ok: true, estado: "concluido" };
}
