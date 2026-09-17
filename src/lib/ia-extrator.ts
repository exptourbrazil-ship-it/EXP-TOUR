// CAMADA UNICA de chamada a IA para EXTRACAO ESTRUTURADA (arquivo + schema -> JSON).
// SERVER-ONLY. Provedores: GEMINI (padrao quando GEMINI_API_KEY existe — decisao do
// usuario em 16/09/2026, custo) e ANTHROPIC (alternativa; PRICE_EXTRACT_MODEL).
// Os extratores (price list, brochura, promocao, calendario, fatura) chamam
// `extrairEstruturado` por import DINAMICO — eles sao modulos puros testados com
// `node --test` sem bundler, que nao resolve `@/`.
//
// Falha FECHADA: sem chave -> 'sem_ia'; rede/parse -> 'erro'. `definitivo` = o ARQUIVO
// foi rejeitado (tamanho/paginas/formato/bloqueio de conteudo): repetir nao adianta.
// `codigo` classifica a causa lendo o CORPO do erro (que nao contem a chave): 'config'
// (chave invalida — no Gemini vem como HTTP 400 API_KEY_INVALID —, modelo inexistente,
// billing/regiao), 'quota' (429), 'arquivo' (definitivo) ou 'leitura' (transitorio
// generico). config/quota NAO gastam tentativas do material. NUNCA lanca.
//
// Documento SENSIVEL (`sensivel: true`, ex.: fatura com nome do estudante): NAO vai para
// o plano gratuito do Gemini (dados podem ser usados para treino) — so Anthropic ou
// Gemini com GEMINI_TIER=paid; senao 'sem_ia' (o humano confere).

export type ProvedorIA = "gemini" | "anthropic";

export type ToolIA = { name: string; description: string; input_schema: Record<string, unknown> };
export type ArquivoIA = { base64: string; mime: string; ehImagem: boolean };
export type CodigoFalhaIA = "config" | "quota" | "arquivo" | "leitura";
export type ResultadoChamadaIA =
  | { ok: true; input: Record<string, unknown>; provedor: ProvedorIA }
  | { ok: false; status: "sem_ia" | "erro"; erro: string; definitivo?: boolean; codigo?: CodigoFalhaIA };

export function provedorIA(): ProvedorIA | null {
  const forcado = (process.env.IA_PROVIDER || "").trim().toLowerCase();
  if (forcado === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (forcado === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}
export function iaConfigurada(): boolean {
  return provedorIA() !== null;
}
// Para mensagens ao admin: qual variavel falta.
export const ROTULO_CHAVE_IA = "GEMINI_API_KEY (ou ANTHROPIC_API_KEY)";

const SEM_IA: ResultadoChamadaIA = { ok: false, status: "sem_ia", erro: `Extracao por IA nao configurada (sem ${ROTULO_CHAVE_IA}).` };

export // Classifica um erro HTTP do provedor pelo status + corpo JSON do erro (Gemini:
// {error:{status,message}}; Anthropic: {error:{type,message}}). So e 'arquivo'
// (definitivo) quando o provedor fala do DOCUMENTO; erro de chave/modelo/billing e
// 'config' mesmo vindo como 400/404. A mensagem nunca ecoa o corpo inteiro.
// Palavras que apontam para o DOCUMENTO (nao para o pedido em si: "payload"/"input"
// aparecem em erros de JSON/schema, que sao config).
const RE_ARQUIVO = /too large|payload size|\bsize\b|\bpages?\b|unsupported|mime|media_type|\bdocument\b|\bimage\b|\bpdf\b|base64|exceed/i;
export function classificarHttp(status: number, corpo?: unknown): { erro: string; definitivo: boolean; codigo: CodigoFalhaIA } {
  const e = corpo && typeof corpo === "object" && (corpo as any).error && typeof (corpo as any).error === "object" ? (corpo as any).error : {};
  const tipo = String(e.status ?? e.type ?? "").toUpperCase();
  const msg = String(e.message ?? "").slice(0, 200);
  const chave = /API_KEY|AUTHENTICATION|PERMISSION|UNAUTHENTICATED/.test(tipo) || /api key|apikey/i.test(msg);
  if (status === 401 || status === 403 || chave) return { erro: `Chave da IA recusada (status ${status}) — confira ${ROTULO_CHAVE_IA} no ambiente.`, definitivo: false, codigo: "config" };
  if (status === 404 || /NOT_FOUND/.test(tipo)) return { erro: `Modelo da IA não encontrado (status ${status}) — confira GEMINI_MODEL / PRICE_EXTRACT_MODEL.`, definitivo: false, codigo: "config" };
  if (status === 429 || /RESOURCE_EXHAUSTED|RATE_LIMIT|OVERLOADED/.test(tipo)) return { erro: "Limite de requisições da IA atingido (429) — volta à fila.", definitivo: false, codigo: "quota" };
  if (/FAILED_PRECONDITION|BILLING/.test(tipo) || /billing|region|not available in your country/i.test(msg)) return { erro: `IA indisponível para esta conta/região (status ${status}) — confira billing/região.`, definitivo: false, codigo: "config" };
  if (status === 413 || (status >= 400 && status < 500 && RE_ARQUIVO.test(msg))) return { erro: `A IA rejeitou o arquivo (status ${status}${msg ? `: ${msg}` : ""}).`, definitivo: true, codigo: "arquivo" };
  if (status >= 400 && status < 500) return { erro: `A IA recusou o pedido (status ${status}${msg ? `: ${msg}` : ""}) — confira a configuração da IA.`, definitivo: false, codigo: "config" };
  return { erro: `Extração falhou (status ${status}).`, definitivo: false, codigo: "leitura" };
}
async function corpoErro(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

// ── Gemini ──────────────────────────────────────────────────────────────────
// Schema JSON (nosso) -> Schema OpenAPI do Gemini (types em MAIUSCULAS; so os campos
// suportados: type, description, properties, required, items, enum).
export function schemaGemini(s: unknown): Record<string, unknown> {
  if (!s || typeof s !== "object") return { type: "STRING" };
  const o = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof o.type === "string") out.type = o.type.toUpperCase();
  if (typeof o.description === "string") out.description = o.description;
  if (Array.isArray(o.enum)) out.enum = o.enum;
  if (Array.isArray(o.required)) out.required = o.required;
  if (o.properties && typeof o.properties === "object") {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o.properties as Record<string, unknown>)) props[k] = schemaGemini(v);
    out.properties = props;
  }
  if (o.items) out.items = schemaGemini(o.items);
  return out;
}

// Modelo Gemini: a lista de modelos servidos varia por conta e muda com o tempo (o
// primeiro teste em producao deu 404 em gemini-2.5-flash). Em vez de chutar um nome,
// perguntamos ao ListModels quais suportam generateContent e escolhemos pela ordem
// de preferencia (GEMINI_MODEL primeiro, se existir na lista). Cache por processo.
const PREFERENCIA_GEMINI = [
  "gemini-2.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-pro",
];
// Puro (testado): escolhe o modelo dado o que a conta oferece.
export function escolherModeloGemini(disponiveis: string[], preferido?: string | null): string | null {
  const nomes = disponiveis.map((n) => n.replace(/^models\//, ""));
  const pref = (preferido || "").trim();
  if (pref && nomes.includes(pref)) return pref;
  for (const p of PREFERENCIA_GEMINI) if (nomes.includes(p)) return p;
  // Qualquer flash que gere conteudo (exclui image/tts/live/embedding/audio).
  const flash = nomes.find((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
  if (flash) return flash;
  const gemini = nomes.find((n) => /^gemini-[\d.]+-/.test(n) && !/image|tts|live|embedding|audio|transcribe|robotics|computer-use/.test(n));
  return gemini ?? (pref || null);
}
let cacheModelo: { nome: string; em: number } | null = null;
const CACHE_MODELO_MS = 60 * 60_000;
async function resolverModeloGemini(apiKey: string): Promise<{ ok: true; model: string } | { ok: false; resultado: ResultadoChamadaIA }> {
  const preferido = (process.env.GEMINI_MODEL || "").trim() || null;
  if (cacheModelo && Date.now() - cacheModelo.em < CACHE_MODELO_MS) return { ok: true, model: cacheModelo.nome };
  let resp: Response;
  try {
    resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": apiKey } });
  } catch (err) {
    // Sem lista (rede): tenta o preferido ou o primeiro da preferencia.
    return { ok: true, model: preferido ?? PREFERENCIA_GEMINI[0] };
  }
  if (!resp.ok) return { ok: false, resultado: { ok: false, status: "erro", ...classificarHttp(resp.status, await corpoErro(resp)) } };
  try {
    const data = await resp.json();
    const lista: string[] = (Array.isArray(data?.models) ? data.models : [])
      .filter((m: any) => !Array.isArray(m?.supportedGenerationMethods) || m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => String(m?.name ?? ""))
      .filter(Boolean);
    const escolhido = escolherModeloGemini(lista, preferido);
    if (!escolhido) return { ok: false, resultado: { ok: false, status: "erro", erro: "Nenhum modelo Gemini com generateContent disponível para esta chave.", codigo: "config" } };
    if (preferido && preferido !== escolhido) console.warn(`[ia-extrator] GEMINI_MODEL=${preferido} nao disponivel; usando ${escolhido}`);
    cacheModelo = { nome: escolhido, em: Date.now() };
    return { ok: true, model: escolhido };
  } catch {
    return { ok: true, model: preferido ?? PREFERENCIA_GEMINI[0] };
  }
}

async function chamarGemini(args: { tool: ToolIA; prompt: string; arquivo: ArquivoIA; maxTokens: number }): Promise<ResultadoChamadaIA> {
  const apiKey = process.env.GEMINI_API_KEY as string;
  const modelo = await resolverModeloGemini(apiKey);
  if (!modelo.ok) return modelo.resultado;
  const model = modelo.model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  // Extracao mecanica: sem "pensamento" na familia 2.x (thinking_budget 0). Em outras
  // familias o knob difere — nao mandamos thinking_config e damos folga de tokens,
  // porque max_output_tokens INCLUI o raciocinio.
  const familia2 = model.startsWith("gemini-2.");
  const generation_config: Record<string, unknown> = {
    temperature: 0,
    max_output_tokens: familia2 ? args.maxTokens : Math.min(args.maxTokens * 3, 32768),
    ...(familia2 ? { thinking_config: { thinking_budget: 0 } } : {}),
  };
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: args.arquivo.ehImagem ? args.arquivo.mime : "application/pdf", data: args.arquivo.base64 } },
              { text: args.prompt },
            ],
          },
        ],
        tools: [{ function_declarations: [{ name: args.tool.name, description: args.tool.description, parameters: schemaGemini(args.tool.input_schema) }] }],
        // Chamada de funcao FORCADA: a saida vem estruturada no functionCall.
        tool_config: { function_calling_config: { mode: "ANY", allowed_function_names: [args.tool.name] } },
        generation_config,
      }),
    });
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha de rede na extracao." };
  }
  if (!resp.ok) {
    if (resp.status === 404) cacheModelo = null; // modelo sumiu: re-resolve na proxima
    return { ok: false, status: "erro", ...classificarHttp(resp.status, await corpoErro(resp)) };
  }
  try {
    const data = await resp.json();
    const cand = data?.candidates?.[0];
    const parts: any[] = cand?.content?.parts ?? [];
    const fc = parts.find((p) => p?.functionCall?.name === args.tool.name)?.functionCall;
    if (fc && fc.args && typeof fc.args === "object" && !Array.isArray(fc.args)) return { ok: true, input: fc.args as Record<string, unknown>, provedor: "gemini" };
    // Fallback: modelo devolveu JSON (objeto) em texto.
    const texto = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("").trim();
    if (texto) {
      const limpo = texto.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      try {
        const obj = JSON.parse(limpo);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) return { ok: true, input: obj as Record<string, unknown>, provedor: "gemini" };
      } catch {
        // texto nao-JSON: cai na classificacao por finishReason abaixo
      }
    }
    // Sem dados estruturados: o motivo esta no finishReason / promptFeedback.
    const fim = String(cand?.finishReason ?? "").toUpperCase();
    const bloqueio = data?.promptFeedback?.blockReason;
    if (bloqueio || /SAFETY|RECITATION|PROHIBITED_CONTENT|SPII/.test(fim)) {
      return { ok: false, status: "erro", erro: `A IA bloqueou o conteúdo do documento (${bloqueio ?? fim}).`, definitivo: true, codigo: "arquivo" };
    }
    if (fim === "MAX_TOKENS") return { ok: false, status: "erro", erro: "Documento longo demais para uma leitura — divida o arquivo.", definitivo: true, codigo: "arquivo" };
    return { ok: false, status: "erro", erro: `A IA não retornou dados estruturados${fim ? ` (${fim})` : ""}.`, codigo: "leitura" };
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha ao ler a resposta da IA." };
  }
}

// ── Anthropic ───────────────────────────────────────────────────────────────
async function chamarAnthropic(args: { tool: ToolIA; prompt: string; arquivo: ArquivoIA; maxTokens: number }): Promise<ResultadoChamadaIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY as string;
  const model = (process.env.PRICE_EXTRACT_MODEL || "claude-opus-5").trim();
  const blocoArquivo = args.arquivo.ehImagem
    ? { type: "image", source: { type: "base64", media_type: args.arquivo.mime, data: args.arquivo.base64 } }
    : { type: "document", source: { type: "base64", media_type: "application/pdf", data: args.arquivo.base64 } };
  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: args.maxTokens,
        // Extracao mecanica: sem thinking (incompativel com tool_choice forcado), esforco baixo.
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        tools: [args.tool],
        tool_choice: { type: "tool", name: args.tool.name },
        messages: [{ role: "user", content: [blocoArquivo, { type: "text", text: args.prompt }] }],
      }),
    });
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha de rede na extracao." };
  }
  if (!resp.ok) return { ok: false, status: "erro", ...classificarHttp(resp.status, await corpoErro(resp)) };
  try {
    const data = await resp.json();
    const bloco = Array.isArray(data?.content) ? data.content.find((c: any) => c?.type === "tool_use" && c?.name === args.tool.name) : null;
    if (!bloco?.input || typeof bloco.input !== "object" || Array.isArray(bloco.input)) {
      const fim = String(data?.stop_reason ?? "");
      if (fim === "max_tokens") return { ok: false, status: "erro", erro: "Documento longo demais para uma leitura — divida o arquivo.", definitivo: true, codigo: "arquivo" };
      return { ok: false, status: "erro", erro: `A IA não retornou dados estruturados${fim ? ` (${fim})` : ""}.`, codigo: "leitura" };
    }
    return { ok: true, input: bloco.input as Record<string, unknown>, provedor: "anthropic" };
  } catch (err) {
    return { ok: false, status: "erro", erro: err instanceof Error ? err.message : "Falha ao ler a resposta da IA." };
  }
}

// Ponto unico de entrada dos extratores.
// Provedor para documento SENSIVEL (dado pessoal): nunca o Gemini gratuito.
export function provedorParaSensivel(): ProvedorIA | null {
  const p = provedorIA();
  if (p === "gemini" && (process.env.GEMINI_TIER || "").trim().toLowerCase() !== "paid") {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  }
  return p;
}

export async function extrairEstruturado(args: { tool: ToolIA; prompt: string; arquivo: ArquivoIA; maxTokens?: number; sensivel?: boolean }): Promise<ResultadoChamadaIA> {
  const provedor = args.sensivel ? provedorParaSensivel() : provedorIA();
  if (!provedor) {
    return args.sensivel && provedorIA()
      ? { ok: false, status: "sem_ia", erro: "Documento com dados pessoais não vai para o plano gratuito do Gemini — defina GEMINI_TIER=paid (billing ativo) ou ANTHROPIC_API_KEY." }
      : SEM_IA;
  }
  const maxTokens = args.maxTokens ?? 8192;
  return provedor === "gemini" ? chamarGemini({ ...args, maxTokens }) : chamarAnthropic({ ...args, maxTokens });
}
