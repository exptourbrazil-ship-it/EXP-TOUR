// Regressao da RENUMERACAO na repactuacao/substituicao de parcelas.
//
// A renumeracao real vive nas funcoes Postgres `aplicar_cronograma_parcelas` e
// `substituir_parcelas` (e no fallback sequencial de repactuacao-service.ts). O
// node --test nao executa SQL, entao este arquivo MODELA a logica das duas
// versoes para travar a invariante que o bug quebrava:
//
//   depois de pagar uma parcela, o cliente redistribui/remove parcelas em volta
//   dela; o cronograma inteiro e reenviado renumerado 1..N. A parcela paga NAO
//   pode mudar de valor, mas o numero (so ordenacao) precisa ser reatribuido
//   JUNTO com as demais — senao uma parcela nao paga assume o numero que a paga
//   ainda carregava e viola unique(contrato_id, numero), abortando a transacao
//   (o erro generico "Nao foi possivel concluir a repactuacao").
import { test } from "node:test";
import assert from "node:assert/strict";

type Row = { id: string; numero: number; bloqueada: boolean };
type Nova = { id?: string; numero: number };

// Versao ANTIGA (com bug): desloca/renumera SO as nao bloqueadas; a bloqueada
// mantem o numero original. Retorna o multiconjunto de numeros finais.
function numerosFinaisBuggy(atuais: Row[], novas: Nova[]): number[] {
  const bloqueadas = new Map(atuais.filter((r) => r.bloqueada).map((r) => [r.id, r.numero]));
  const finais: number[] = [];
  for (const n of novas) {
    if (n.id && bloqueadas.has(n.id)) {
      finais.push(bloqueadas.get(n.id) as number); // mantem o numero ORIGINAL
    } else {
      finais.push(n.numero); // nao bloqueada / nova: numero do corpo
    }
  }
  return finais;
}

// Versao CORRIGIDA: renumera TODAS (inclusive as bloqueadas) pelo numero do
// corpo. Bloqueadas so trocam de numero; valor/vencimento ficam congelados.
function numerosFinaisCorrigido(_atuais: Row[], novas: Nova[]): number[] {
  return novas.map((n) => n.numero);
}

function temColisao(nums: number[]): boolean {
  return new Set(nums).size !== nums.length;
}

// Cenario relatado: entrada #1 (nao paga), #2 PAGA, #3, #4. O cliente remove a
// #1 e redistribui — o corpo chega renumerado 1..3 na ordem de exibicao.
const ATUAIS: Row[] = [
  { id: "p1", numero: 1, bloqueada: false },
  { id: "p2", numero: 2, bloqueada: true }, // paga
  { id: "p3", numero: 3, bloqueada: false },
  { id: "p4", numero: 4, bloqueada: false },
];
// Removeu a p1; corpo = [p2(paga), p3, p4] renumerado 1,2,3.
const NOVAS: Nova[] = [
  { id: "p2", numero: 1 },
  { id: "p3", numero: 2 },
  { id: "p4", numero: 3 },
];

test("renumeracao ANTIGA colide quando ha parcela paga (reproduz o bug)", () => {
  const finais = numerosFinaisBuggy(ATUAIS, NOVAS);
  // p2 paga mantem numero 2; p3 recebe numero 2 -> colisao no unique.
  assert.deepEqual(finais.sort(), [2, 2, 3]);
  assert.equal(temColisao(finais), true);
});

test("renumeracao CORRIGIDA nao colide (permite repactuar apos parcela paga)", () => {
  const finais = numerosFinaisCorrigido(ATUAIS, NOVAS);
  assert.deepEqual(finais.sort(), [1, 2, 3]);
  assert.equal(temColisao(finais), false);
});

// Caso comum (entrada paga primeiro, so redistribui as futuras) ja funcionava —
// garante que a correcao nao regride esse caminho.
test("renumeracao CORRIGIDA: entrada paga #1 + futuras redistribuidas, sem colisao", () => {
  const atuais: Row[] = [
    { id: "e", numero: 1, bloqueada: true },
    { id: "a", numero: 2, bloqueada: false },
    { id: "b", numero: 3, bloqueada: false },
  ];
  const novas: Nova[] = [
    { id: "e", numero: 1 },
    { id: "a", numero: 2 },
    { id: "b", numero: 3 },
  ];
  const finais = numerosFinaisCorrigido(atuais, novas);
  assert.equal(temColisao(finais), false);
});
