// Testes da parte PURA da extracao de promocao (F3.3). `npm test` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarPromocoesExtraidas, chaveDedupe, entradaPromocaoProposta, avisosDaPromocao, dataISO } from "./promocao-extract.ts";
import { validarPromocao } from "./promocao.ts";

test("P1 normalizar: whitelist de tipo/alvo, datas ISO validas, valor limpo, descarta sem nome", () => {
  const r = normalizarPromocoesExtraidas([
    { nome: "Early bird", tipo: "PERCENT_OFF", valor: "15%", aplica_a: "tuition", reserva_ate: "2026-09-30", viagem_de: "2026-02-30", condicoes: "Book by Sept 30" },
    { nome: "", tipo: "fixed_off" }, // sem nome: fora
    { nome: "Free weeks", tipo: "free_units", valor: 2, min_quantidade: "12", semantica_gratis: "bonus_on_top" },
    { nome: "No reg fee", tipo: "waive_fee", valor: 100, aplica_a: "fees" }, // waive_fee ignora valor
    { nome: "Weird", tipo: "bogo", aplica_a: "everything" },
  ]);
  assert.equal(r.length, 4);
  assert.equal(r[0].tipo, "percent_off");
  assert.equal(r[0].valor, 15);
  assert.equal(r[0].reserva_ate, "2026-09-30");
  assert.equal(r[0].viagem_de, null); // 30/02 nao existe
  assert.equal(r[1].semantica_gratis, "bonus_on_top");
  assert.equal(r[1].min_quantidade, 12);
  assert.equal(r[2].valor, null);
  assert.equal(r[3].tipo, null);
  assert.equal(r[3].aplica_a, null);
});

test("P2 dataISO: so YYYY-MM-DD existente", () => {
  assert.equal(dataISO("2026-10-15"), "2026-10-15");
  assert.equal(dataISO("15/10/2026"), null);
  assert.equal(dataISO("2026-13-01"), null);
  assert.equal(dataISO(42), null);
});

test("P3 chaveDedupe: ordem/acento/caixa nao importam; prazo diferente = promocao diferente", () => {
  assert.equal(chaveDedupe({ nome: "Early Bird 15%", reserva_ate: "2026-09-30" }), chaveDedupe({ nome: "15% early bird", reserva_ate: "2026-09-30" }));
  assert.notEqual(chaveDedupe({ nome: "Early Bird", reserva_ate: "2026-09-30" }), chaveDedupe({ nome: "Early Bird", reserva_ate: "2026-12-31" }));
});

test("P4 entradaPromocaoProposta: passa em validarPromocao quando completa; supplier vem do contexto; alvo casado vira specific_product", () => {
  const [p] = normalizarPromocoesExtraidas([{ nome: "Early bird", tipo: "percent_off", valor: 15, aplica_a: "tuition", reserva_ate: "2026-09-30" }]);
  const e = entradaPromocaoProposta(p, { supplierId: "sup-1", campusId: "cam-1" });
  const v = validarPromocao({ ...e, status: "active" });
  assert.ok(v.ok);
  if (v.ok) {
    assert.equal(v.valor.promotion.supplier_id, "sup-1");
    assert.equal(v.valor.promotion.booking_until, "2026-09-30");
    assert.equal(v.valor.promotion.status, "active");
  }
  const e2 = entradaPromocaoProposta({ ...p, aplica_a: "specific_product", alvo_nome: "General English" }, { supplierId: "sup-1", campusId: null, refId: "prod-9" });
  assert.equal(e2.applies_to, "specific_product");
  assert.equal(e2.applies_to_ref_id, "prod-9");
  // Alvo especifico SEM produto casado cai para tuition (o aviso conta isso ao admin).
  const e3 = entradaPromocaoProposta({ ...p, aplica_a: "specific_product", alvo_nome: "X" }, { supplierId: "sup-1", campusId: null });
  assert.equal(e3.applies_to, "tuition");
  assert.equal(e3.applies_to_ref_id, null);
});

test("P5 entrada incompleta NAO passa em validarPromocao (tipo/valor ausentes) — o admin completa na tela", () => {
  const [p] = normalizarPromocoesExtraidas([{ nome: "Mystery deal" }]);
  const v = validarPromocao({ ...entradaPromocaoProposta(p, { supplierId: "s", campusId: null }), status: "active" });
  assert.equal(v.ok, false);
});

test("P6 avisos: prazo vencido, sem prazo, tipo/valor ausentes, alvo nao encontrado", () => {
  const hoje = "2026-09-16";
  const [vencida] = normalizarPromocoesExtraidas([{ nome: "Old", tipo: "percent_off", valor: 10, reserva_ate: "2026-01-31" }]);
  assert.ok(avisosDaPromocao(vencida, hoje).some((a) => a.includes("já passou")));
  const [semPrazo] = normalizarPromocoesExtraidas([{ nome: "Open", tipo: "percent_off", valor: 10 }]);
  assert.ok(avisosDaPromocao(semPrazo, hoje).some((a) => a.includes("sem prazo")));
  const [vaga] = normalizarPromocoesExtraidas([{ nome: "Vague", reserva_ate: "2026-12-31" }]);
  const av = avisosDaPromocao(vaga, hoje);
  assert.ok(av.some((a) => a.includes("tipo de promoção")));
  assert.ok(!av.some((a) => a.includes("valor"))); // sem tipo, nao cobra valor
  const [alvo] = normalizarPromocoesExtraidas([{ nome: "GE deal", tipo: "fixed_off", valor: 100, aplica_a: "specific_product", alvo_nome: "General English", reserva_ate: "2026-12-31" }]);
  assert.ok(avisosDaPromocao(alvo, hoje).some((a) => a.includes("não encontrado")));
  // Com o alvo casado (marcador "alvo:..."), nao avisa e o marcador nao vaza.
  const comAlvo = avisosDaPromocao(alvo, hoje, ["alvo:prod-1", "já existe promoção ativa parecida: GE 10%"]);
  assert.ok(!comAlvo.some((a) => a.includes("não encontrado")));
  assert.ok(!comAlvo.some((a) => a.startsWith("alvo:")));
  assert.ok(comAlvo.some((a) => a.includes("já existe")));
});

test("avisosDaPromocao: override_price sem alvo casado ganha aviso proprio (motor nunca aplica sem produto)", () => {
  const hoje = "2026-01-01";
  const [semAlvo] = normalizarPromocoesExtraidas([{
    nome: "Preco promocional", tipo: "override_price", valor: 220,
    aplica_a: "specific_product", alvo_nome: "General English", reserva_ate: "2026-12-31",
  }]);
  const av = avisosDaPromocao(semAlvo, hoje);
  assert.ok(av.some((a) => a.includes("EXIGE o curso casado")));
  // O aviso generico dos demais tipos ("aplicada ao curso em geral") NAO se
  // aplica aqui — seria falso: override_price sem alvo nunca desconta nada.
  assert.ok(!av.some((a) => a.includes("aplicada ao curso em geral")));
});

test("entradaPromocaoProposta: override_price sem alvo casado cai em applies_to='tuition' e o validador recusa", () => {
  const [semAlvo] = normalizarPromocoesExtraidas([{
    nome: "Preco promocional", tipo: "override_price", valor: 220, aplica_a: "specific_product",
    alvo_nome: "General English", reserva_ate: "2026-12-31",
  }]);
  const entrada = entradaPromocaoProposta(semAlvo, { supplierId: "sup-1", campusId: null });
  assert.equal(entrada.applies_to, "tuition");
  const r = validarPromocao(entrada);
  assert.ok(!r.ok);
});
