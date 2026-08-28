// Testes do mapeamento puro pendencia -> alerta.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chaveAlerta,
  janelaLoa,
  destinatariosDoAlerta,
  conteudoAlerta,
  montarAlertas,
  type UsuarioFornecedorAlerta,
} from "./fornecedor-alertas.ts";
import type { Pendencia } from "./fornecedor-pendencias.ts";

function pend(over: Partial<Pendencia> = {}): Pendencia {
  return {
    tipo: "nova_matricula",
    contratoId: "c1",
    estudanteNome: "Aluno X",
    titulo: "t",
    idadeDias: 1,
    prazoDias: null,
    severidade: "info",
    ...over,
  };
}

const admissions: UsuarioFornecedorAlerta = {
  id: "u1", email: "adm@escola.com", name: "Ana", role: "admissions", language: "pt", active: true,
};
const admin: UsuarioFornecedorAlerta = {
  id: "u2", email: "boss@escola.com", name: "Bo", role: "supplier_admin", language: "en", active: true,
};
const marketing: UsuarioFornecedorAlerta = {
  id: "u3", email: "mkt@escola.com", name: "Mia", role: "marketing", language: "en", active: true,
};
const inativo: UsuarioFornecedorAlerta = {
  id: "u4", email: "old@escola.com", name: "Old", role: "admissions", language: "en", active: false,
};

test("janelaLoa: atencao -> d3, urgente -> d7, info -> null", () => {
  assert.equal(janelaLoa(pend({ tipo: "loa_pendente", severidade: "atencao" })), "d3");
  assert.equal(janelaLoa(pend({ tipo: "loa_pendente", severidade: "urgente" })), "d7");
  assert.equal(janelaLoa(pend({ tipo: "loa_pendente", severidade: "info" })), null);
});

test("chaveAlerta: por tipo, com janela do LOA; LOA info nao dispara", () => {
  assert.equal(chaveAlerta(pend({ tipo: "loa_pendente", severidade: "atencao" })), "supplier-alert:loa:c1:d3");
  assert.equal(chaveAlerta(pend({ tipo: "loa_pendente", severidade: "urgente" })), "supplier-alert:loa:c1:d7");
  assert.equal(chaveAlerta(pend({ tipo: "loa_pendente", severidade: "info" })), null);
  assert.equal(chaveAlerta(pend({ tipo: "documento_devolvido", refId: "d9" })), "supplier-alert:devolvido:d9");
  assert.equal(chaveAlerta(pend({ tipo: "documento_devolvido" })), null); // sem refId
  assert.equal(chaveAlerta(pend({ tipo: "docs_viagem" })), "supplier-alert:viagem:c1");
  assert.equal(chaveAlerta(pend({ tipo: "nova_matricula" })), "supplier-alert:matricula:c1");
});

test("destinatarios: admissions + admin; marketing e inativo ficam de fora; dedupe por e-mail", () => {
  const d = destinatariosDoAlerta(pend(), [admissions, admin, marketing, inativo, admissions]);
  const emails = d.map((x) => x.email).sort();
  assert.deepEqual(emails, ["adm@escola.com", "boss@escola.com"]);
});

test("documento devolvido vai para quem enviou (se ativo); senao cai para admissions/admin", () => {
  const paraUploader = destinatariosDoAlerta(
    pend({ tipo: "documento_devolvido", refId: "d1", destinatarioSupplierUserId: "u3" }),
    [admissions, admin, marketing]
  );
  assert.deepEqual(paraUploader.map((x) => x.email), ["mkt@escola.com"]); // o uploader, mesmo marketing

  const uploaderInativo = destinatariosDoAlerta(
    pend({ tipo: "documento_devolvido", refId: "d1", destinatarioSupplierUserId: "u4" }),
    [admissions, admin, inativo]
  );
  // uploader inativo -> fallback admissions/admin
  assert.deepEqual(uploaderInativo.map((x) => x.email).sort(), ["adm@escola.com", "boss@escola.com"]);
});

test("conteudoAlerta e bilingue e usa o nome do estudante", () => {
  const en = conteudoAlerta(pend({ tipo: "loa_pendente" }), "en");
  assert.match(en.subject, /Letter of Acceptance/);
  assert.match(en.contexto, /Aluno X/);
  const pt = conteudoAlerta(pend({ tipo: "loa_pendente" }), "pt");
  assert.match(pt.subject, /Carta de Aceite/);
});

test("montarAlertas filtra pendencias sem chave e sem destinatario", () => {
  const itens = montarAlertas(
    [
      pend({ tipo: "loa_pendente", severidade: "info" }), // sem chave -> fora
      pend({ tipo: "nova_matricula", contratoId: "c2" }), // ok
    ],
    [admissions]
  );
  assert.equal(itens.length, 1);
  assert.equal(itens[0].pendencia.contratoId, "c2");
  assert.equal(itens[0].caminho, "/fornecedor/estudantes/c2");

  // sem usuarios -> nenhum item
  assert.equal(montarAlertas([pend({ tipo: "nova_matricula" })], []).length, 0);
});
