import { test } from "node:test";
import assert from "node:assert/strict";
import { proximoSeguro } from "./redirect-seguro.ts";

test("caminho interno do prefixo e aceito", () => {
  assert.equal(proximoSeguro("/admin/clientes", "/admin", "/admin"), "/admin/clientes");
  assert.equal(proximoSeguro("/admin", "/admin", "/admin"), "/admin");
  assert.equal(proximoSeguro("/admin?x=1", "/admin", "/admin"), "/admin?x=1");
  assert.equal(proximoSeguro("/fornecedor/materiais", "/fornecedor", "/fornecedor"), "/fornecedor/materiais");
});

test("URL externa, protocolo relativo e barra invertida voltam ao padrao", () => {
  for (const ruim of ["https://evil.com", "http://evil.com/admin", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", "/admin\\x"]) {
    assert.equal(proximoSeguro(ruim, "/admin", "/admin"), "/admin", ruim);
  }
});

test("fora do prefixo, vazio ou nulo voltam ao padrao", () => {
  assert.equal(proximoSeguro("/fornecedor", "/admin", "/admin"), "/admin");
  assert.equal(proximoSeguro("/administrador", "/admin", "/admin"), "/admin");
  assert.equal(proximoSeguro("", "/admin", "/admin"), "/admin");
  assert.equal(proximoSeguro(null, "/admin", "/admin"), "/admin");
});

test("caracteres de controle voltam ao padrao", () => {
  assert.equal(proximoSeguro("/admin/\n//evil.com", "/admin", "/admin"), "/admin");
});
