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
  SLA_ANALISE_DOCUMENTO_DIAS,
  DIAS_COBRANCA_HUMANA,
  type ItemFila,
  type CategoriaFila,
  type EstadoPrazo,
} from "@/lib/fila-do-dia";
import { labelTipoExcecao, papelAlvoDoTipo, slaDiasDoTipo } from "@/lib/excecao";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export type FilaDoDia = {
  itens: ItemFila[];
  contadores: { total: number; documentos: number; parcelas: number; excecoes: number; estourados: number };
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
    .select("id, created_at, titular:titulares(nome_completo)")
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
      href: "/admin/documentos",
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
    .select("id, vencimento, contrato:contratos(titular:titulares(nome_completo))")
    .neq("status", "pago")
    .lte("vencimento", limiteD10)
    .order("vencimento", { ascending: true });
  if (errParcelas) throw new Error("Falha ao ler parcelas da fila: " + errParcelas.message);

  for (const p of parcelas ?? []) {
    if (!p.vencimento) continue;
    const atraso = diasDeAtraso(p.vencimento, hojeISO);
    fontes.push({
      categoria: "parcela",
      titulo: `Cobrança humana — parcela em D+${atraso}`,
      contexto: nomeDe((p as { contrato?: { titular?: unknown } }).contrato?.titular),
      href: "/admin/financeiro",
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
  papel?: string
): Promise<FilaDoDia> {
  const supabase = getSupabase();

  const fontes = await coletarFontesAoVivo(supabase, agoraMs);
  const chavesLive = new Set(fontes.map((f) => f.chaveDedupe));

  const itens: ItemFila[] = fontes.map((f) => ({
    categoria: f.categoria,
    titulo: f.titulo,
    contexto: f.contexto,
    href: f.href,
    criadoEm: f.criadoEm,
    idadeDias: f.idadeDias,
    estado: f.estado,
    chaveDedupe: f.chaveDedupe,
    papelAlvo: f.papelAlvo,
  }));

  // Tarefas abertas: manuais, ou materializadas cuja fonte nao esta mais viva.
  // `papel` roteia o item pelo dono (necessario para exceptions materializadas).
  const { data: tarefas } = await supabase
    .from("tasks")
    .select("id, categoria, titulo, contexto, href, papel, prazo, criado_em, chave_dedupe")
    .neq("estado", "concluido")
    .order("criado_em", { ascending: true });

  for (const t of tarefas ?? []) {
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
    });
  }

  const visiveis = papel ? filtrarPorPapel(itens, papel) : itens;
  const ordenada = ordenarFila(visiveis);

  return {
    itens: ordenada,
    contadores: {
      total: ordenada.length,
      documentos: ordenada.filter((i) => i.categoria === "documento").length,
      parcelas: ordenada.filter((i) => i.categoria === "parcela").length,
      excecoes: ordenada.filter((i) => i.categoria === "excecao").length,
      estourados: ordenada.filter((i) => i.estado === "estourado").length,
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
