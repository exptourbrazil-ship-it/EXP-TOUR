import { test } from "node:test";
import assert from "node:assert/strict";
import {
  podeCliente,
  podeVerFinanceiro,
  normalizarPerfil,
  perfilValido,
  rotuloPerfil,
  PERFIL_PADRAO,
  type CapacidadeCliente,
} from "./perfil-acesso.ts";

test("contratante tem acesso pleno (todas as capacidades)", () => {
  const todas: CapacidadeCliente[] = [
    "financeiro.ver",
    "valores.ver",
    "pagamento.gerir",
    "documentos.ver",
    "programa.ver",
    "recibos_proprios.ver",
  ];
  for (const c of todas) assert.equal(podeCliente("contratante", c), true, c);
});

test("participante NUNCA vê dinheiro (bloqueio financeiro 5.4.4 + LGPD)", () => {
  assert.equal(podeCliente("participante", "financeiro.ver"), false);
  assert.equal(podeCliente("participante", "valores.ver"), false);
  assert.equal(podeCliente("participante", "pagamento.gerir"), false);
  assert.equal(podeCliente("participante", "recibos_proprios.ver"), false);
  assert.equal(podeVerFinanceiro("participante"), false);
});

test("participante vê documentos e andamento do programa", () => {
  assert.equal(podeCliente("participante", "documentos.ver"), true);
  assert.equal(podeCliente("participante", "programa.ver"), true);
});

test("terceiro pagador vê SÓ o comprovante do que pagou", () => {
  assert.equal(podeCliente("terceiro_pagador", "recibos_proprios.ver"), true);
  assert.equal(podeCliente("terceiro_pagador", "financeiro.ver"), false);
  assert.equal(podeCliente("terceiro_pagador", "valores.ver"), false);
  assert.equal(podeCliente("terceiro_pagador", "pagamento.gerir"), false);
  assert.equal(podeCliente("terceiro_pagador", "documentos.ver"), false);
  assert.equal(podeCliente("terceiro_pagador", "programa.ver"), false);
});

test("normalizarPerfil: retrocompatibilidade -> contratante (acesso pleno)", () => {
  assert.equal(normalizarPerfil(null), "contratante");
  assert.equal(normalizarPerfil(undefined), "contratante");
  assert.equal(normalizarPerfil(""), "contratante");
  assert.equal(normalizarPerfil("desconhecido"), "contratante");
  assert.equal(normalizarPerfil("participante"), "participante");
  assert.equal(normalizarPerfil("terceiro_pagador"), "terceiro_pagador");
  assert.equal(PERFIL_PADRAO, "contratante");
});

test("valor cru inesperado NÃO abre bloqueio além do padrão", () => {
  // Um valor lixo vira contratante (padrão), mas isso é o comportamento atual;
  // o ponto é que nunca vira participante/terceiro por acidente.
  assert.equal(podeVerFinanceiro("lixo"), true); // = contratante
  assert.equal(podeVerFinanceiro(null), true); // = contratante
  // E o inverso: quem É participante nunca "escapa" para ver dinheiro.
  assert.equal(podeVerFinanceiro("participante"), false);
});

test("perfilValido e rotuloPerfil", () => {
  assert.equal(perfilValido("contratante"), true);
  assert.equal(perfilValido("participante"), true);
  assert.equal(perfilValido("terceiro_pagador"), true);
  assert.equal(perfilValido("outro"), false);
  assert.equal(perfilValido(null), false);
  assert.equal(rotuloPerfil("participante"), "Participante (estudante)");
  assert.equal(rotuloPerfil(null), "Contratante"); // padrão
});
