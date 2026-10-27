// Regressao: a rota de upload do admin validava o tipo contra uma lista fixa de
// 11 valores enquanto a tela oferecia toda a taxonomia (~30), entao Passaporte,
// Documento de Identidade etc. voltavam "tipoDocumento invalido".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIPOS_DOCUMENTO, ehTipoDocumentoValido } from "./documentos.ts";

test("todo tipo oferecido na tela e aceito pela validacao", () => {
  for (const t of TIPOS_DOCUMENTO) assert.ok(ehTipoDocumentoValido(t.valor), t.valor);
  assert.ok(ehTipoDocumentoValido("passaporte"));
  assert.ok(ehTipoDocumentoValido("documento_identidade"));
  assert.equal(ehTipoDocumentoValido("tipo_que_nao_existe"), false);
});

test("a rota admin usa a taxonomia, nao uma lista fixa", () => {
  const src = readFileSync(new URL("../app/api/admin/documentos/route.ts", import.meta.url), "utf8");
  assert.match(src, /ehTipoDocumentoValido/);
  assert.doesNotMatch(src, /TIPOS_VALIDOS/);
  assert.doesNotMatch(src, /criado_por:\s*"rodrigo@/);
});
