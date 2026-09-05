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
  SLA_ANALISE_DOCUMENTO_DIAS,
  DIAS_COBRANCA_HUMANA,
  type ItemFila,
  type CategoriaFila,
  type EstadoPrazo,
  type EstadoTask,
} from "@/lib/fila-do-dia";
import { labelTipoExcecao, papelAlvoDoTipo, slaDiasDoTipo } from "@/lib/excecao";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

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
async function coletarFontesAoVivo(
  supabase: ReturnType<typeof getSupabase>,
  agoraMs: number
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
  const { data: docs, error: errDocs } = await supabase
    .from("documentos")
    .select("id, created_at, titular_id, titular:titulares(nome_completo)")
    .eq("origem", "titular")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });
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

  const { data: parcelas, error: errParcelas } = await supabase
    .from("parcelas")
    .select("id, vencimento, contrato:contratos(titular_id, titular:titulares(nome_completo))")
    .neq("status", "pago")
    .lte("vencimento", limiteD10)
    .order("vencimento", { ascending: true });
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
  const { data: excecoes, error: errExcecoes } = await supabase
    .from("case_exceptions")
    .select("id, tipo, aberta_em, titular_id, titular:titulares(nome_completo)")
    .in("status", ["aberta", "em_andamento"])
    .order("aberta_em", { ascending: true });
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

export type ResultadoMaterializacao = { fontes: number; criadas: number; concluidas: number };

// Materializa as fontes automaticas em linhas de `tasks` (para ganharem estado,
// dono e historico) e reconcilia: tarefas automaticas abertas cuja fonte ja
// resolveu sao concluidas. Idempotente por `chave_dedupe`. Chamada pelo cron.
export async function materializarTasksDaFila(
  agoraMs: number = Date.now()
): Promise<ResultadoMaterializacao> {
  const supabase = getSupabase();
  const fontes = await coletarFontesAoVivo(supabase, agoraMs);

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
    .select("id, chave_dedupe")
    .in("origem", ["automatica", "excecao"])
    .neq("estado", "concluido");

  let concluidas = 0;
  for (const t of abertas ?? []) {
    if (t.chave_dedupe && !chavesLive.has(t.chave_dedupe)) {
      await supabase
        .from("tasks")
        .update({ estado: "concluido", concluido_em: new Date(agoraMs).toISOString() })
        .eq("id", t.id);
      concluidas += 1;
    }
  }

  return { fontes: fontes.length, criadas, concluidas };
}

// ── Ações sobre uma tarefa da fila (assumir / concluir / devolver) ───────────
// A fila é "operada": o admin ASSUME um item (vira dono, em_andamento), CONCLUI
// (concluido) ou DEVOLVE (solta o dono, volta a aberto). Itens de fonte viva
// ainda não materializados são criados on-demand A PARTIR DA PRÓPRIA FONTE
// (conteúdo do servidor, nunca do corpo) — o cliente só envia a chave_dedupe.
export type AcaoTarefa = "assumir" | "concluir" | "devolver";

async function garantirTaskPorChave(
  supabase: ReturnType<typeof getSupabase>,
  chaveDedupe: string,
  agoraMs: number
): Promise<string | null> {
  const { data: existente } = await supabase.from("tasks").select("id").eq("chave_dedupe", chaveDedupe).maybeSingle();
  if (existente?.id) return existente.id as string;

  // Materializa a partir da fonte viva correspondente (server-authoritative).
  const fontes = await coletarFontesAoVivo(supabase, agoraMs);
  const f = fontes.find((x) => x.chaveDedupe === chaveDedupe);
  if (!f) return null; // sem task e sem fonte viva -> já resolvida/inexistente

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

export async function acaoTarefa(
  acao: AcaoTarefa,
  chaveDedupe: string,
  actor: string,
  ip?: string | null,
  agoraMs: number = Date.now()
): Promise<{ ok: boolean; estado?: EstadoTask }> {
  if (!chaveDedupe) return { ok: false };
  const supabase = getSupabase();

  if (acao === "devolver") {
    // Só audita/retorna ok se uma linha realmente mudou (evita trilha-lixo com
    // alvo inexistente e resposta enganosa quando a chave não casa nada).
    const { data } = await supabase
      .from("tasks")
      .update({ dono: null, estado: "aberto" })
      .eq("chave_dedupe", chaveDedupe)
      .select("id");
    if (!data || data.length === 0) return { ok: false };
    await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fila.tarefa.devolver", alvo: chaveDedupe, ip: ip ?? null });
    return { ok: true, estado: "aberto" };
  }

  const id = await garantirTaskPorChave(supabase, chaveDedupe, agoraMs);
  if (!id) return { ok: false }; // fonte sumiu (já resolvida)

  if (acao === "assumir") {
    await supabase.from("tasks").update({ dono: actor, estado: "em_andamento" }).eq("id", id);
    await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fila.tarefa.assumir", alvo: chaveDedupe, ip: ip ?? null });
    return { ok: true, estado: "em_andamento" };
  }

  // concluir (dono pode ser nulo — operador tratou sem assumir)
  await supabase
    .from("tasks")
    .update({ estado: "concluido", concluido_em: new Date(agoraMs).toISOString() })
    .eq("id", id);
  await registrarAuditoriaAdmin(supabase, { usuario: actor, acao: "fila.tarefa.concluir", alvo: chaveDedupe, ip: ip ?? null });
  return { ok: true, estado: "concluido" };
}
