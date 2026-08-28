// Extracao de price list (Fase C). A escola sobe o PDF; o Claude extrai um
// RASCUNHO estruturado (cursos/faixas/taxas) que a escola revisa antes de
// aprovar. NUNCA publica sozinho — o rascunho passa por duas aprovacoes.
//
// O NORMALIZADOR no topo e PURO (sem rede): valida/coage a saida da IA (ou o
// que a escola digitar) para a forma do catalogo. Testado em
// price-list-extract.test.ts. A chamada ao Claude fica na funcao do fim.

// ── Forma normalizada do rascunho ───────────────────────────────────────────
export type FaixaPreco = { minQuantity: number; unitPrice: number };
export type ProgramaExtraido = {
  name: string;
  educationType: string | null;
  unit: string; // "week" | "session" | "day" | "month"
  tiers: FaixaPreco[];
};
export type AcomodacaoExtraida = {
  name: string;
  type: string | null; // homestay | residence | shared_apartment | studio | hotel | other
  unit: string;
  tiers: FaixaPreco[];
};
export type TaxaExtraida = {
  name: string;
  feeType: string | null; // registration | material | placement | bank | service | courier | custom
  amount: number;
  basis: string | null; // once_per_quote | once_per_item | per_unit | per_person
  refundable: boolean | null;
};
export type PriceListExtraido = {
  currency: string | null; // ISO 4217 (3 letras) quando houver
  programs: ProgramaExtraido[];
  accommodations: AcomodacaoExtraida[];
  fees: TaxaExtraida[];
  notes: string | null;
};

export const UNIDADES = ["week", "session", "day", "month", "lesson", "hour", "unit"];
export const TIPOS_ACOM = ["homestay", "residence", "shared_apartment", "studio", "hotel", "other"];
export const TIPOS_TAXA = ["registration", "material", "placement", "bank", "service", "courier", "courier_of_documents", "custom"];
export const BASES_TAXA = ["once_per_quote", "once_per_item", "per_unit", "per_person"];

function texto(v: unknown, max = 200): string {
  return (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim().slice(0, max);
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const limpo = String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  // Number("") === 0 — sem esta guarda, texto sem digito viraria 0 (bug).
  if (limpo === "" || limpo === "-" || limpo === ".") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
function inteiroPos(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  const i = Math.round(n);
  return i >= 0 && i <= 100000 ? i : null;
}
function dinheiro(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  if (n < 0 || n > 100000000) return null;
  return Math.round(n * 100) / 100;
}
function unidade(v: unknown): string {
  const u = texto(v, 20).toLowerCase();
  return UNIDADES.includes(u) ? u : "week";
}
function umDe(v: unknown, lista: string[]): string | null {
  const s = texto(v, 40).toLowerCase();
  return lista.includes(s) ? s : null;
}
function moeda(v: unknown): string | null {
  // Nao cortar em 3 antes de validar: "dolar" nao pode virar "DOL".
  const c = texto(v, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}
function boolOuNulo(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  const s = texto(v, 6).toLowerCase();
  if (["true", "sim", "yes", "1"].includes(s)) return true;
  if (["false", "nao", "não", "no", "0"].includes(s)) return false;
  return null;
}

function normalizarTiers(raw: unknown): FaixaPreco[] {
  if (!Array.isArray(raw)) return [];
  const tiers: FaixaPreco[] = [];
  for (const t of raw) {
    const minQuantity = inteiroPos((t as any)?.minQuantity ?? (t as any)?.min ?? (t as any)?.from);
    const unitPrice = dinheiro((t as any)?.unitPrice ?? (t as any)?.price ?? (t as any)?.value);
    if (minQuantity == null || unitPrice == null) continue;
    tiers.push({ minQuantity, unitPrice });
  }
  // Dedup por minQuantity (mantem o ultimo) e ordena crescente.
  const porMin = new Map<number, number>();
  for (const t of tiers) porMin.set(t.minQuantity, t.unitPrice);
  return [...porMin.entries()].map(([minQuantity, unitPrice]) => ({ minQuantity, unitPrice })).sort((a, b) => a.minQuantity - b.minQuantity);
}

// Normaliza a saida da IA (ou o payload editado pela escola) para PriceListExtraido.
// Descarta silenciosamente o que nao for aproveitavel (a escola revisa depois).
export function normalizarPriceListExtraido(raw: unknown): PriceListExtraido {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const programs: ProgramaExtraido[] = Array.isArray(r.programs)
    ? r.programs
        .map((p): ProgramaExtraido => ({
          name: texto((p as any)?.name),
          educationType: texto((p as any)?.educationType, 60) || null,
          unit: unidade((p as any)?.unit),
          tiers: normalizarTiers((p as any)?.tiers),
        }))
        .filter((p) => p.name)
    : [];

  const accommodations: AcomodacaoExtraida[] = Array.isArray(r.accommodations)
    ? r.accommodations
        .map((a): AcomodacaoExtraida => ({
          name: texto((a as any)?.name),
          type: umDe((a as any)?.type, TIPOS_ACOM),
          unit: unidade((a as any)?.unit),
          tiers: normalizarTiers((a as any)?.tiers),
        }))
        .filter((a) => a.name)
    : [];

  const fees: TaxaExtraida[] = Array.isArray(r.fees)
    ? r.fees
        .map((f): TaxaExtraida => ({
          name: texto((f as any)?.name),
          feeType: umDe((f as any)?.feeType, TIPOS_TAXA),
          amount: dinheiro((f as any)?.amount) ?? 0,
          basis: umDe((f as any)?.basis, BASES_TAXA),
          refundable: boolOuNulo((f as any)?.refundable),
        }))
        .filter((f) => f.name && f.amount > 0)
    : [];

  return {
    currency: moeda(r.currency),
    programs,
    accommodations,
    fees,
    notes: texto(r.notes, 2000) || null,
  };
}

// Total de linhas aproveitaveis (para a UI dizer "N itens extraidos").
export function contarItens(p: PriceListExtraido): number {
  return p.programs.length + p.accommodations.length + p.fees.length;
}

// ── Chamada ao Claude (impura) ──────────────────────────────────────────────
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// Schema do tool que forca a saida estruturada.
const TOOL_SCHEMA = {
  name: "registrar_price_list",
  description: "Registra a lista de precos extraida do documento da escola.",
  input_schema: {
    type: "object",
    properties: {
      currency: { type: "string", description: "Codigo ISO 4217 (3 letras), ex.: CAD, USD, GBP." },
      programs: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            educationType: { type: "string" },
            unit: { type: "string", description: "week, session, day ou month" },
            tiers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  minQuantity: { type: "number", description: "Duracao minima da faixa (ex.: semanas)." },
                  unitPrice: { type: "number", description: "Preco por unidade nessa faixa." },
                },
                required: ["minQuantity", "unitPrice"],
              },
            },
          },
          required: ["name", "tiers"],
        },
      },
      accommodations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string", description: "homestay, residence, shared_apartment, studio, hotel ou other" },
            unit: { type: "string" },
            tiers: {
              type: "array",
              items: {
                type: "object",
                properties: { minQuantity: { type: "number" }, unitPrice: { type: "number" } },
                required: ["minQuantity", "unitPrice"],
              },
            },
          },
          required: ["name", "tiers"],
        },
      },
      fees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            feeType: { type: "string", description: "registration, material, placement, bank, service, courier ou custom" },
            amount: { type: "number" },
            basis: { type: "string", description: "once_per_quote, once_per_item, per_unit ou per_person" },
            refundable: { type: "boolean" },
          },
          required: ["name", "amount"],
        },
      },
      notes: { type: "string" },
    },
    required: ["programs", "fees"],
  },
} as const;

const PROMPT_EXTRACAO =
  "Voce recebe o PRICE LIST (lista de precos) de uma escola de intercambio. Extraia os precos de forma " +
  "estruturada e chame a ferramenta registrar_price_list. Regras: preserve a MOEDA original (nao converta); " +
  "para cursos/programas, capture as faixas por duracao (minQuantity = duracao minima da faixa, unitPrice = " +
  "preco por unidade); capture acomodacoes e taxas (matricula, material, placement, etc.). Se algo nao estiver " +
  "no documento, omita — nao invente numeros. Nao arredonde nem some nada; copie os valores como estao.";

export type ResultadoExtracao =
  | { ok: true; dados: PriceListExtraido; status: "ok" }
  | { ok: false; status: "sem_ia" | "erro"; erro: string };

// Extrai o price list de um PDF (base64) via Claude. Falha FECHADA: sem a chave,
// devolve status 'sem_ia' (a escola preenche/edita o rascunho a mao). Erros de
// rede/parse devolvem 'erro'. NUNCA lanca (o chamador segue com rascunho vazio).
export async function extrairPriceListPdf(pdfBase64: string): Promise<ResultadoExtracao> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: "sem_ia", erro: "Extracao por IA nao configurada (sem ANTHROPIC_API_KEY)." };
  }
  // Default opus-5 (guia do claude-api); PRICE_EXTRACT_MODEL sobrescreve.
  const model = (process.env.PRICE_EXTRACT_MODEL || "claude-opus-5").trim();

  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        // Extracao mecanica: esforco baixo e sem "thinking" — thinking e
        // incompativel com tool_choice forcado; a saida vem direto no tool_use.
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "tool", name: "registrar_price_list" },
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: PROMPT_EXTRACAO },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha de rede na extracao." };
  }

  if (!resp.ok) {
    return { ok: false, status: "erro", erro: `Extracao falhou (status ${resp.status}).` };
  }

  try {
    const data = await resp.json();
    const bloco = Array.isArray(data?.content)
      ? data.content.find((c: any) => c?.type === "tool_use" && c?.name === "registrar_price_list")
      : null;
    if (!bloco?.input) return { ok: false, status: "erro", erro: "A IA nao retornou dados estruturados." };
    return { ok: true, dados: normalizarPriceListExtraido(bloco.input), status: "ok" };
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha ao ler a resposta da IA." };
  }
}
