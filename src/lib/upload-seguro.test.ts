import test from "node:test";
import assert from "node:assert/strict";

import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao, TAMANHO_MAXIMO_BYTES } from "./upload-seguro.ts";

function buf(bytes: number[], tamanho = bytes.length): ArrayBuffer {
  const a = new Uint8Array(tamanho);
  a.set(bytes);
  return a.buffer;
}

const PDF = [0x25, 0x50, 0x44, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test("aceita PDF e PNG reais", () => {
  const pdf = validarArquivo(4, buf(PDF));
  assert.equal(pdf.ok && pdf.mime, "application/pdf");
  const png = validarArquivo(8, buf(PNG));
  assert.equal(png.ok && png.extensao, "png");
});

test("rejeita HTML mesmo quando o cliente declara outro tipo", () => {
  // "<html>" — era este o vetor: subir HTML com <script> e faze-lo ser servido
  // pelo Storage na mesma origem do /rest/v1.
  const html = [0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e];
  const r = validarArquivo(html.length, buf(html));
  assert.equal(r.ok, false);
});

test("rejeita arquivo vazio e acima do teto", () => {
  assert.equal(validarArquivo(0, buf(PDF)).ok, false);
  assert.equal(validarArquivo(TAMANHO_MAXIMO_BYTES + 1, buf(PDF)).ok, false);
});

test("a chave do storage nao carrega nenhum byte do nome enviado", () => {
  const chave = montarChaveStorage("titular-uuid", "pdf");
  assert.match(chave, /^titular-uuid\/[0-9a-f-]{36}\.pdf$/);
  assert.ok(!chave.includes(".."));
});

test("sanitizarNomeExibicao remove separadores de caminho e aspas", () => {
  // Os ".." sobrevivem como texto, e tudo bem: este valor e so exibicao e
  // Content-Disposition. O que importa e que nao ha mais separador de caminho,
  // e que a CHAVE do storage nao usa este valor (ver teste acima).
  assert.equal(sanitizarNomeExibicao("../../../documentos-admin/x.html"), "..-..-..-documentos-admin-x.html");
  assert.equal(sanitizarNomeExibicao('a"b.pdf'), "ab.pdf");
  assert.equal(sanitizarNomeExibicao(""), "documento");
});
