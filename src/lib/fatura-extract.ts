// Extracao da FATURA (invoice) da escola (doc 05 secao 1/2). A escola sobe a
// fatura (documentos.tipo_documento = 'invoice_escola'); o Claude extrai os
// campos e a conferencia cruza contra a previsao do caso.
//
// O NORMALIZADOR no topo e PURO (sem rede): coage a saida da IA para a forma
// canonica. Testado em fatura-extract.test.ts. A chamada ao Claude fica no fim.

export type FaturaExtraida = {
  studentName: string | null; // nome do estudante na fatura
  programName: string | null; // curso/programa
  grossAmount: number | null; // valor BRUTO total da fatura (a pagar a escola)
  currency: string | null; // ISO 4217 (3 letras)
  invoiceNumber: string | null;
  issueDate: string | null; // ISO YYYY-MM-DD quando houver
  notes: string | null;
};

function texto(v: unknown, max = 200): string {
  return (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim().slice(0, max);
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const limpo = String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (limpo === "" || limpo === "-" || limpo === ".") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}
function dinheiro(v: unknown): number | null {
  const n = num(v);
  if (n == null) return null;
  if (n < 0 || n > 100000000) return null;
  return Math.round(n * 100) / 100;
}
function moeda(v: unknown): string | null {
  const c = texto(v, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}
function dataIso(v: unknown): string | null {
  const s = texto(v, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

// Normaliza a saida da IA (ou payload editado) para FaturaExtraida. Puro.
export function normalizarFaturaExtraida(raw: unknown): FaturaExtraida {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    studentName: texto(r.studentName ?? (r as any).student ?? (r as any).estudante, 160) || null,
    programName: texto(r.programName ?? (r as any).program ?? (r as any).course, 160) || null,
    grossAmount: dinheiro(r.grossAmount ?? (r as any).total ?? (r as any).amount ?? (r as any).valor),
    currency: moeda(r.currency ?? (r as any).moeda),
    invoiceNumber: texto(r.invoiceNumber ?? (r as any).number ?? (r as any).numero, 60) || null,
    issueDate: dataIso(r.issueDate ?? (r as any).date ?? (r as any).data),
    notes: texto(r.notes, 1000) || null,
  };
}

// ── Chamada ao Claude (impura) ──────────────────────────────────────────────
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const TOOL_SCHEMA = {
  name: "registrar_fatura",
  description: "Registra os campos extraidos da fatura (invoice) da escola.",
  input_schema: {
    type: "object",
    properties: {
      studentName: { type: "string", description: "Nome completo do estudante na fatura." },
      programName: { type: "string", description: "Curso/programa faturado." },
      grossAmount: { type: "number", description: "Valor TOTAL bruto da fatura (a pagar a escola)." },
      currency: { type: "string", description: "Codigo ISO 4217 (3 letras), ex.: CAD, USD, GBP." },
      invoiceNumber: { type: "string" },
      issueDate: { type: "string", description: "Data de emissao no formato YYYY-MM-DD." },
      notes: { type: "string" },
    },
    required: ["grossAmount"],
  },
} as const;

const PROMPT =
  "Voce recebe uma FATURA (invoice) emitida por uma escola de intercambio para a EXP Tour. Extraia os campos " +
  "e chame a ferramenta registrar_fatura. Regras: preserve a MOEDA original (nao converta); grossAmount e o " +
  "TOTAL a pagar a escola (o maior total da fatura, ja com taxas, nao um subtotal). Copie os valores como " +
  "estao; se algo nao estiver na fatura, omita — nao invente.";

export type ResultadoFatura =
  | { ok: true; dados: FaturaExtraida; status: "ok" }
  | { ok: false; status: "sem_ia" | "erro"; erro: string };

// Extrai a fatura de um PDF (base64) via Claude. Falha FECHADA: sem a chave,
// devolve 'sem_ia' (a conferencia fica pendente para o humano). NUNCA lanca.
export async function extrairFaturaPdf(pdfBase64: string): Promise<ResultadoFatura> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, status: "sem_ia", erro: "Extracao por IA nao configurada (sem ANTHROPIC_API_KEY)." };
  const model = (process.env.PRICE_EXTRACT_MODEL || "claude-opus-5").trim();

  let resp: Response;
  try {
    resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "tool", name: "registrar_fatura" },
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha de rede na extracao." };
  }

  if (!resp.ok) return { ok: false, status: "erro", erro: `Extracao falhou (status ${resp.status}).` };

  try {
    const data = await resp.json();
    const bloco = Array.isArray(data?.content)
      ? data.content.find((c: any) => c?.type === "tool_use" && c?.name === "registrar_fatura")
      : null;
    if (!bloco?.input) return { ok: false, status: "erro", erro: "A IA nao retornou dados estruturados." };
    return { ok: true, dados: normalizarFaturaExtraida(bloco.input), status: "ok" };
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha ao ler a resposta da IA." };
  }
}
