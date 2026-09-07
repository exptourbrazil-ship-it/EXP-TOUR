// Testes dos helpers puros da aba Viagem. `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emergenciaDoDestino,
  montarLinkMapa,
  montarLinkSuporteWhatsApp,
  viagemPreenchida,
  resumoViagem,
} from "./viagem.ts";

test("emergenciaDoDestino retorna o numero certo por destino", () => {
  assert.equal(emergenciaDoDestino("canada")?.numeroEmergencia, "911");
  assert.equal(emergenciaDoDestino("nova_zelandia")?.numeroEmergencia, "111");
});

test("emergenciaDoDestino retorna null para destino nulo ou desconhecido", () => {
  assert.equal(emergenciaDoDestino(null), null);
  assert.equal(emergenciaDoDestino("marte"), null);
});

test("montarLinkMapa codifica o endereco e ignora vazio", () => {
  const link = montarLinkMapa("1055 W Hastings St, Vancouver");
  assert.ok(link!.startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert.ok(link!.includes(encodeURIComponent("1055 W Hastings St, Vancouver")));
  assert.equal(montarLinkMapa(""), null);
  assert.equal(montarLinkMapa(null), null);
});

test("montarLinkSuporteWhatsApp usa o numero comercial so com digitos", () => {
  assert.equal(montarLinkSuporteWhatsApp(), "https://wa.me/17786827927");
});

test("viagemPreenchida: null e vazio sao pendentes; um campo util basta", () => {
  assert.equal(viagemPreenchida(null), false);
  assert.equal(
    viagemPreenchida({
      escola_nome: null,
      escola_endereco: "  ",
      acomodacao_endereco: null,
      contato_local_nome: null,
      contato_local_telefone: null,
      observacoes: null,
    }),
    false
  );
  assert.equal(
    viagemPreenchida({
      escola_nome: "ILAC",
      escola_endereco: null,
      acomodacao_endereco: null,
      contato_local_nome: null,
      contato_local_telefone: null,
      observacoes: null,
    }),
    true
  );
});

test("resumoViagem conta preenchidos vs pendentes", () => {
  const cheio = {
    escola_nome: "X",
    escola_endereco: null,
    acomodacao_endereco: null,
    contato_local_nome: null,
    contato_local_telefone: null,
    observacoes: null,
  };
  const r = resumoViagem([{ info: cheio }, { info: null }, { info: cheio }]);
  assert.deepEqual(r, { total: 3, preenchidos: 2, pendentes: 1 });
});
