import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarTravaRemessa, prazoArrependimentoRemessaISO } from "./trava-remessa.ts";

// V1 — dentro dos 7 dias, sem processamento imediato -> BLOQUEADO.
test("V1 arrependimento em curso bloqueia", () => {
  const t = avaliarTravaRemessa({
    aceiteISO: "2026-08-01T12:00:00.000Z",
    agoraISO: "2026-08-05T12:00:00.000Z", // dia 4
    processamentoImediato: false,
  });
  assert.equal(t.liberado, false);
  assert.equal(t.motivo, "arrependimento");
  assert.equal(t.liberaEmISO, "2026-08-08T12:00:00.000Z");
});

// V2 — processamento imediato libera mesmo dentro do prazo.
test("V2 processamento imediato libera", () => {
  const t = avaliarTravaRemessa({
    aceiteISO: "2026-08-01T12:00:00.000Z",
    agoraISO: "2026-08-02T12:00:00.000Z",
    processamentoImediato: true,
  });
  assert.equal(t.liberado, true);
  assert.equal(t.motivo, "processamento_imediato");
});

// V3 — apos os 7 dias -> liberado (prazo decorrido).
test("V3 prazo decorrido libera", () => {
  const t = avaliarTravaRemessa({
    aceiteISO: "2026-08-01T12:00:00.000Z",
    agoraISO: "2026-08-09T12:00:00.000Z", // dia 8
    processamentoImediato: false,
  });
  assert.equal(t.liberado, true);
  assert.equal(t.motivo, "prazo_decorrido");
});

// V4 — no exato limite (dia 7) ainda bloqueia (<=).
test("V4 limite inclusivo", () => {
  const t = avaliarTravaRemessa({
    aceiteISO: "2026-08-01T12:00:00.000Z",
    agoraISO: "2026-08-08T12:00:00.000Z",
    processamentoImediato: false,
  });
  assert.equal(t.liberado, false);
});

// V5 — sem ancora de aceite -> nao bloqueia (defensivo).
test("V5 sem aceite nao bloqueia", () => {
  const t = avaliarTravaRemessa({ aceiteISO: null, agoraISO: "2026-08-05T12:00:00.000Z", processamentoImediato: false });
  assert.equal(t.liberado, true);
  assert.equal(t.motivo, "sem_aceite");
});

// V6 — prazo = aceite + 7 dias.
test("V6 prazo", () => {
  assert.equal(prazoArrependimentoRemessaISO("2026-08-01T00:00:00.000Z"), "2026-08-08T00:00:00.000Z");
});
