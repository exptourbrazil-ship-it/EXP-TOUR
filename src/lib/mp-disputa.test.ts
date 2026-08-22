// Testes da deteccao de disputa de pagamento do MP (E9).
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_DISPUTA_MP, ehStatusDisputaMP, labelStatusDisputaMP } from "./mp-disputa.ts";

test("ehStatusDisputaMP: so in_mediation e charged_back", () => {
  assert.equal(ehStatusDisputaMP("in_mediation"), true);
  assert.equal(ehStatusDisputaMP("charged_back"), true);
  // aprovados/pendentes/refunds NAO sao disputa
  assert.equal(ehStatusDisputaMP("approved"), false);
  assert.equal(ehStatusDisputaMP("pending"), false);
  assert.equal(ehStatusDisputaMP("refunded"), false);
  assert.equal(ehStatusDisputaMP("partially_refunded"), false);
  assert.equal(ehStatusDisputaMP("cancelled"), false);
  assert.equal(ehStatusDisputaMP(null), false);
  assert.equal(ehStatusDisputaMP(undefined), false);
  assert.equal(STATUS_DISPUTA_MP.length, 2);
});

test("labelStatusDisputaMP", () => {
  assert.equal(labelStatusDisputaMP("in_mediation"), "Em mediação (MED Pix)");
  assert.equal(labelStatusDisputaMP("charged_back"), "Chargeback");
  assert.equal(labelStatusDisputaMP(null), "Em disputa");
  assert.equal(labelStatusDisputaMP("xpto"), "xpto");
});
