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

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export type FilaDoDia = {
  itens: ItemFila[];
  contadores: { total: number; documentos: number; parcelas: number; estourados: number };
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

  const { data: docs } = await supabase
    .from("documentos")
    .select("id, created_at, titular:titulares(nome_completo)")
    .eq("origem", "titular")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

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

  const { data: parcelas } = await supabase
    .from("parcelas")
    .select("id, vencimento, contrato:contratos(titular:titulares(nome_completo))")
    .neq("status", "pago")
    .lte("vencimento", limiteD10)
    .order("vencimento", { ascending: true });

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
  }));

  // Tarefas abertas: manuais, ou materializadas cuja fonte nao esta mais viva.
  const { data: tarefas } = await supabase
    .from("tasks")
    .select("id, categoria, titulo, contexto, href, prazo, criado_em, chave_dedupe")
    .neq("estado", "concluido")
    .order("criado_em", { ascending: true });

  for (const t of tarefas ?? []) {
    if (t.chave_dedupe && chavesLive.has(t.chave_dedupe)) continue; // ja representada pela fonte viva
    const idade = idadeEmDias(t.criado_em, agoraMs);
    const estourado = t.prazo ? Date.parse(t.prazo) < agoraMs : false;
    itens.push({
      categoria: (t.categoria ?? "outro") as CategoriaFila,
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

  // Reconcilia: fonte sumiu (documento aprovado, parcela paga) -> conclui a task.
  const chavesLive = new Set(fontes.map((f) => f.chaveDedupe));
  const { data: abertas } = await supabase
    .from("tasks")
    .select("id, chave_dedupe")
    .eq("origem", "automatica")
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
