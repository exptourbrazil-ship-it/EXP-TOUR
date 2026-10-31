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

// Regressao: o CHECK do banco ficou defasado e o insert do admin falhava para
// certificado_conclusao e outros. O schema de referencia deve listar todos.
test("o CHECK de tipo_documento no schema cobre toda a taxonomia", () => {
  const sql = readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
  const ini = sql.lastIndexOf("add constraint documentos_tipo_documento_check");
  assert.ok(ini >= 0);
  const bloco = sql.slice(ini, sql.indexOf(");", ini));
  for (const t of TIPOS_DOCUMENTO) assert.ok(bloco.includes("'" + t.valor + "'"), t.valor);
});
