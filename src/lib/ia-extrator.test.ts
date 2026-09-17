// Testes da parte PURA da camada de IA (selecao de provedor, conversao de schema,
// classificacao de erros HTTP). `npm test` (node --test), sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { provedorIA, iaConfigurada, schemaGemini, classificarHttp, provedorParaSensivel, escolherModeloGemini } from "./ia-extrator.ts";

function comEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const antes: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    antes[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  }
}

test("I1 provedor: Gemini e o padrao quando a chave existe; Anthropic como alternativa; sem chave = null", () => {
  comEnv({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", IA_PROVIDER: undefined }, () => assert.equal(provedorIA(), "gemini"));
  comEnv({ GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: "a", IA_PROVIDER: undefined }, () => assert.equal(provedorIA(), "anthropic"));
  comEnv({ GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined, IA_PROVIDER: undefined }, () => {
    assert.equal(provedorIA(), null);
    assert.equal(iaConfigurada(), false);
  });
  // IA_PROVIDER forca — mas so se a chave daquele provedor existir (falha fechada).
  comEnv({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", IA_PROVIDER: "anthropic" }, () => assert.equal(provedorIA(), "anthropic"));
  comEnv({ GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: "a", IA_PROVIDER: "gemini" }, () => assert.equal(provedorIA(), null));
});

test("I2 schemaGemini: tipos em MAIUSCULAS, recursivo em properties/items, so campos suportados", () => {
  const g = schemaGemini({
    type: "object",
    additionalProperties: false, // nao suportado: some
    properties: {
      currency: { type: "string", description: "ISO", minLength: 3 },
      programs: { type: "array", items: { type: "object", properties: { name: { type: "string" }, tiers: { type: "array", items: { type: "object", properties: { minQuantity: { type: "number" }, unitPrice: { type: "number" } }, required: ["minQuantity", "unitPrice"] } } }, required: ["name"] } },
      refundable: { type: "boolean" },
      tipo: { type: "string", enum: ["a", "b"] },
    },
    required: ["programs"],
  });
  assert.equal(g.type, "OBJECT");
  assert.deepEqual(g.required, ["programs"]);
  assert.equal("additionalProperties" in g, false);
  const props = g.properties as Record<string, any>;
  assert.equal(props.currency.type, "STRING");
  assert.equal(props.currency.description, "ISO");
  assert.equal("minLength" in props.currency, false);
  assert.equal(props.programs.type, "ARRAY");
  assert.equal(props.programs.items.type, "OBJECT");
  assert.equal(props.programs.items.properties.tiers.items.properties.unitPrice.type, "NUMBER");
  assert.deepEqual(props.programs.items.properties.tiers.items.required, ["minQuantity", "unitPrice"]);
  assert.equal(props.refundable.type, "BOOLEAN");
  assert.deepEqual(props.tipo.enum, ["a", "b"]);
});

test("I3 classificarHttp: erro de CONFIG (chave/modelo/billing) e quota nunca sao definitivos — mesmo como 400/404 (Gemini)", () => {
  // Gemini: chave invalida vem como HTTP 400 INVALID_ARGUMENT / API_KEY_INVALID.
  const chave400 = classificarHttp(400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } });
  assert.equal(chave400.definitivo, false);
  assert.equal(chave400.codigo, "config");
  const modelo404 = classificarHttp(404, { error: { code: 404, status: "NOT_FOUND", message: "models/gemini-x is not found" } });
  assert.equal(modelo404.definitivo, false);
  assert.equal(modelo404.codigo, "config");
  assert.equal(classificarHttp(401).codigo, "config");
  assert.equal(classificarHttp(403).codigo, "config");
  const quota = classificarHttp(429, { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } });
  assert.equal(quota.codigo, "quota");
  assert.equal(quota.definitivo, false);
  assert.equal(classificarHttp(400, { error: { status: "FAILED_PRECONDITION", message: "User location is not supported" } }).codigo, "config");
  // Anthropic: authentication_error / not_found_error.
  assert.equal(classificarHttp(401, { error: { type: "authentication_error", message: "invalid x-api-key" } }).codigo, "config");
  assert.equal(classificarHttp(404, { error: { type: "not_found_error", message: "model: claude-x" } }).codigo, "config");
  // ARQUIVO: so quando o provedor fala do documento -> definitivo.
  const grande = classificarHttp(400, { error: { status: "INVALID_ARGUMENT", message: "Request payload size exceeds the limit: 20971520 bytes." } });
  assert.equal(grande.definitivo, true);
  assert.equal(grande.codigo, "arquivo");
  assert.equal(classificarHttp(413).codigo, "arquivo");
  assert.equal(classificarHttp(400, { error: { type: "invalid_request_error", message: "document exceeds the maximum of 100 pages" } }).definitivo, true);
  // 400 generico sem falar do arquivo: config (nao tira o material da fila).
  const generico = classificarHttp(400, { error: { status: "INVALID_ARGUMENT", message: "Invalid JSON payload received." } });
  assert.equal(generico.definitivo, false);
  assert.equal(generico.codigo, "config");
  // 5xx transitorio.
  assert.equal(classificarHttp(500).codigo, "leitura");
  assert.equal(classificarHttp(503).definitivo, false);
  // A mensagem nunca traz o corpo inteiro/chave: so status + trecho do message.
  assert.ok(!chave400.erro.includes("details"));
});

test("I4 sensivel: Gemini gratuito NAO recebe documento com dado pessoal; Anthropic ou GEMINI_TIER=paid liberam", () => {
  comEnv({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: undefined, GEMINI_TIER: undefined, IA_PROVIDER: undefined }, () => assert.equal(provedorParaSensivel(), null));
  comEnv({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", GEMINI_TIER: undefined, IA_PROVIDER: undefined }, () => assert.equal(provedorParaSensivel(), "anthropic"));
  comEnv({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: undefined, GEMINI_TIER: "paid", IA_PROVIDER: undefined }, () => assert.equal(provedorParaSensivel(), "gemini"));
});

test("I5 escolherModeloGemini: preferido so se existir; senao ordem de preferencia; senao qualquer flash; ignora image/tts/live", () => {
  const conta = ["models/gemini-3.8-flash", "models/gemini-3.5-flash-lite", "models/gemini-3.1-flash-image", "models/gemini-3.8-live", "models/gemini-embedding-2-preview"];
  assert.equal(escolherModeloGemini(conta, "gemini-2.5-flash"), "gemini-3.8-flash"); // preferido ausente -> 1o da preferencia presente
  assert.equal(escolherModeloGemini(conta, "gemini-3.5-flash-lite"), "gemini-3.5-flash-lite"); // preferido presente vence
  assert.equal(escolherModeloGemini(["models/gemini-9.1-flash", "models/gemini-9.1-flash-image"], null), "gemini-9.1-flash"); // familia desconhecida: regex de flash
  assert.equal(escolherModeloGemini(["models/gemini-3.1-flash-image", "models/gemini-3.8-live"], null), null); // nada que gere texto
  assert.equal(escolherModeloGemini([], "gemini-x"), "gemini-x"); // lista vazia: tenta o preferido mesmo assim
});
