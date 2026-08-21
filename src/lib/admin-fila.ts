// Carregador da Fila do Dia (server-only: usa a service role). Compoe a fila a
// partir de fontes reais e prioriza com os helpers puros de fila-do-dia.ts.
// So deve ser importado por server components / rotas de API. Ver docs/07 (3.1).
import { createClient } from "@supabase/supabase-js";
import {
  idadeEmDias,
  diasDeAtraso,
  estadoPrazo,
  ordenarFila,
  SLA_ANALISE_DOCUMENTO_DIAS,
  DIAS_COBRANCA_HUMANA,
  type ItemFila,
} from "@/lib/fila-do-dia";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

export type FilaDoDia = {
  itens: ItemFila[];
  contadores: {
    total: number;
    documentos: number;
    parcelas: number;
    tarefas: number;
    estourados: number;
  };
};

// Extrai o nome do titular de um embed do Supabase (que pode vir objeto ou array
// de um elemento, dependendo da cardinalidade inferida).
function nomeDe(rel: unknown): string | undefined {
  if (!rel) return undefined;
  const obj = Array.isArray(rel) ? rel[0] : rel;
  const nome = (obj as { nome_completo?: string } | undefined)?.nome_completo;
  return nome || undefined;
}

// Monta a fila de hoje. Fontes da v1: documentos a analisar, parcelas em D+10 e
// tarefas abertas (manuais/materializadas). `agoraMs` e injetavel para teste.
export async function carregarFilaDoDia(agoraMs: number = Date.now()): Promise<FilaDoDia> {
  const supabase = getSupabase();
  const hojeISO = new Date(agoraMs).toISOString().slice(0, 10);
  const limiteD10 = new Date(agoraMs - DIAS_COBRANCA_HUMANA * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const itens: ItemFila[] = [];

  // 1) Documentos enviados pelo cliente aguardando analise (origem 'titular').
  const { data: docs } = await supabase
    .from("documentos")
    .select("id, tipo_documento, created_at, titular:titulares(nome_completo)")
    .eq("origem", "titular")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  for (const d of docs ?? []) {
    const idade = idadeEmDias(d.created_at, agoraMs);
    itens.push({
      categoria: "documento",
      titulo: "Documento aguardando análise",
      contexto: nomeDe(d.titular),
      href: "/admin/documentos",
      criadoEm: d.created_at,
      idadeDias: idade,
      estado: estadoPrazo(idade, SLA_ANALISE_DOCUMENTO_DIAS),
    });
  }

  // 2) Parcelas nao pagas vencidas ha >= 10 dias (cobranca humana, doc 07 3.1).
  const { data: parcelas } = await supabase
    .from("parcelas")
    .select("id, vencimento, contrato:contratos(titular:titulares(nome_completo))")
    .neq("status", "pago")
    .lte("vencimento", limiteD10)
    .order("vencimento", { ascending: true });

  for (const p of parcelas ?? []) {
    if (!p.vencimento) continue;
    const atraso = diasDeAtraso(p.vencimento, hojeISO);
    itens.push({
      categoria: "parcela",
      titulo: `Cobrança humana — parcela em D+${atraso}`,
      contexto: nomeDe((p as { contrato?: { titular?: unknown } }).contrato?.titular),
      href: "/admin/financeiro",
      criadoEm: p.vencimento,
      idadeDias: atraso,
      estado: "estourado",
    });
  }

  // 3) Tarefas abertas (manuais ou materializadas por jobs futuros).
  const { data: tarefas } = await supabase
    .from("tasks")
    .select("id, categoria, titulo, contexto, href, prazo, criado_em")
    .neq("estado", "concluido")
    .order("criado_em", { ascending: true });

  for (const t of tarefas ?? []) {
    const idade = idadeEmDias(t.criado_em, agoraMs);
    const estourado = t.prazo ? Date.parse(t.prazo) < agoraMs : false;
    itens.push({
      categoria: (t.categoria ?? "outro") as ItemFila["categoria"],
      titulo: t.titulo,
      contexto: t.contexto ?? undefined,
      href: t.href ?? undefined,
      criadoEm: t.criado_em,
      idadeDias: idade,
      estado: estourado ? "estourado" : "no_prazo",
    });
  }

  const ordenada = ordenarFila(itens);
  return {
    itens: ordenada,
    contadores: {
      total: ordenada.length,
      documentos: ordenada.filter((i) => i.categoria === "documento").length,
      parcelas: ordenada.filter((i) => i.categoria === "parcela").length,
      tarefas: (tarefas ?? []).length,
      estourados: ordenada.filter((i) => i.estado === "estourado").length,
    },
  };
}
