// Testes dos helpers puros do convite de usuario do fornecedor.
// Roda com o runner nativo do Node: `npm test` (node --test), sem dependencias.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarConvite, emailValido } from "./supplier-user-admin.ts";

test("emailValido aceita forma valida e rejeita lixo", () => {
  assert.equal(emailValido("Maria@Escola.com"), true);
  assert.equal(emailValido("sem-arroba"), false);
  assert.equal(emailValido("a@b"), false);
  assert.equal(emailValido(""), false);
  assert.equal(emailValido(null), false);
});

test("validarConvite normaliza e-mail (minusculas), nome e defaults", () => {
  const r = validarConvite({
    supplierId: "sup-1",
    name: "  Maria Silva  ",
    email: "  Maria@Escola.COM  ",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.dados, {
      supplierId: "sup-1",
      name: "Maria Silva",
      email: "maria@escola.com",
      role: "admissions", // default do banco quando vazio
      language: "en", // default quando vazio
    });
  }
});

test("validarConvite aceita papel e idioma explicitos", () => {
  const r = validarConvite({
    supplierId: "sup-1",
    name: "John Doe",
    email: "john@school.com",
    role: "supplier_admin",
    language: "pt",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.dados.role, "supplier_admin");
    assert.equal(r.dados.language, "pt");
  }
});

test("validarConvite exige fornecedor, nome e e-mail", () => {
  assert.equal(validarConvite({ name: "X", email: "x@y.com" }).ok, false);
  assert.equal(validarConvite({ supplierId: "s", email: "x@y.com" }).ok, false);
  assert.equal(validarConvite({ supplierId: "s", name: "X" }).ok, false);
});

test("validarConvite rejeita e-mail invalido, papel e idioma desconhecidos", () => {
  assert.equal(validarConvite({ supplierId: "s", name: "X", email: "nope" }).ok, false);
  assert.equal(
    validarConvite({ supplierId: "s", name: "X", email: "x@y.com", role: "root" }).ok,
    false
  );
  assert.equal(
    validarConvite({ supplierId: "s", name: "X", email: "x@y.com", language: "fr" }).ok,
    false
  );
});
