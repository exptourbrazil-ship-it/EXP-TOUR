// Camada de dados da Política de Retenção do fornecedor (server-only, service
// role). Carrega as políticas ATIVAS de um campus (por âncora) do banco e as
// converte na forma consumível pelo motor puro politica-retencao.ts. Isola o SQL
// e o mapeamento; o cálculo em si segue puro/testável.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PoliticaRetencao,
  AncoraRetencao,
  UnidadeRetencao,
  DegrauRetencao,
} from "@/lib/politica-retencao";

const ANCORAS: AncoraRetencao[] = ["inicio_curso", "chegada_acomodacao"];
const UNIDADES: UnidadeRetencao[] = ["dias_corridos", "dias_uteis", "semanas", "percent_horas"];

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Normaliza os degraus vindos do jsonb (defensivo: ignora entradas malformadas).
function normalizarDegraus(raw: unknown): DegrauRetencao[] {
  if (!Array.isArray(raw)) return [];
  const out: DegrauRetencao[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const ate = o.ate == null ? null : num(o.ate);
    const pct = o.retencaoPercentual == null ? undefined : num(o.retencaoPercentual) ?? undefined;
    const valor = o.retencaoValor == null ? undefined : num(o.retencaoValor) ?? undefined;
    // Um degrau precisa de um limite (ate ou null explícito) e de uma retenção.
    if (ate === undefined) continue;
    if (pct === undefined && valor === undefined) continue;
    out.push({
      ate,
      ...(pct !== undefined ? { retencaoPercentual: pct } : {}),
      ...(valor !== undefined ? { retencaoValor: valor } : {}),
      ...(typeof o.rotulo === "string" ? { rotulo: o.rotulo } : {}),
    });
  }
  return out;
}

type LinhaPolitica = {
  ancora: string;
  unidade: string;
  degraus: unknown;
  moeda: string | null;
  teto: number | null;
  minimo: number | null;
};

function mapear(linha: LinhaPolitica, moedaFallback: string): PoliticaRetencao | null {
  if (!ANCORAS.includes(linha.ancora as AncoraRetencao)) return null;
  if (!UNIDADES.includes(linha.unidade as UnidadeRetencao)) return null;
  return {
    ancora: linha.ancora as AncoraRetencao,
    unidade: linha.unidade as UnidadeRetencao,
    degraus: normalizarDegraus(linha.degraus),
    moeda: (linha.moeda || moedaFallback || "BRL").toUpperCase(),
    teto: num(linha.teto),
    minimo: num(linha.minimo),
  };
}

// Todas as políticas ATIVAS de um campus (0, 1 ou 2 âncoras). Moeda cai no
// base_currency do campus quando a política não define a sua.
export async function carregarPoliticasRetencao(
  supabase: SupabaseClient,
  campusId: string,
): Promise<PoliticaRetencao[]> {
  if (!campusId) return [];
  const { data: campus } = await supabase
    .from("campus")
    .select("base_currency")
    .eq("id", campusId)
    .maybeSingle();
  const moedaFallback = ((campus?.base_currency as string) || "BRL").toUpperCase();

  const { data } = await supabase
    .from("politica_retencao")
    .select("ancora, unidade, degraus, moeda, teto, minimo")
    .eq("campus_id", campusId)
    .eq("ativo", true);

  const out: PoliticaRetencao[] = [];
  for (const linha of (data ?? []) as LinhaPolitica[]) {
    const p = mapear(linha, moedaFallback);
    if (p) out.push(p);
  }
  return out;
}

// Uma política específica (campus + âncora), ou null se não houver.
export async function carregarPoliticaRetencao(
  supabase: SupabaseClient,
  campusId: string,
  ancora: AncoraRetencao,
): Promise<PoliticaRetencao | null> {
  const todas = await carregarPoliticasRetencao(supabase, campusId);
  return todas.find((p) => p.ancora === ancora) ?? null;
}
