// Ponte PURA entre o motor do Anexo I (reembolso escalonado, fonte unica da regra
// de retencao contratual — Clausula 9 / Anexo I) e a forma do ACERTO persistido.
// Converte um ReembolsoResultado (etapa x tuition + nao recuperaveis, com teto) na
// forma Acerto (retencaoValor absoluto, saldo a devolver e memoria de calculo em
// linhas info/debito/credito, prontas para o Termo).
//
// Por que uma ponte e nao recalcular: o Anexo I ja e a UNICA fonte da matematica
// de retencao (reembolso-anexo-i.ts, testado). O motor de acerto (acerto.ts) fazia
// retencao = valorTotal x percentual (faixas placeholder por dias). Aqui plugamos
// o escalonado por etapa no acerto SEM duplicar a conta: so mapeamos os numeros.
//
// SEM imports de runtime (so `import type`, apagado no type-stripping): roda no
// runner nativo do Node e e testavel isolado.
import type { ReembolsoResultado } from "./reembolso-anexo-i";
import type { Acerto, LinhaMemoria } from "./acerto";

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// Percentual formatado para o rotulo (o Termo formata TODO valor como moeda, entao
// o percentual entra no TEXTO da linha, nunca como valor de uma linha "pct").
function pctLabel(frac: number): string {
  const p = round2((Number(frac) || 0) * 100);
  return `${p.toString().replace(".", ",")}%`;
}

// Monta o Acerto a partir do resultado do Anexo I. `valorTotal` (valor_total do
// contrato) entra so para o registro/derivacao; a matematica de retencao/saldo vem
// TODA do resultado (totalRetido / reembolso), preservando o teto e a dispensa.
export function montarAcertoDeReembolso(args: {
  valorTotal: number;
  resultado: ReembolsoResultado;
  refundEscolaEsperado?: number;
}): Acerto {
  const r = args.resultado;
  const valorTotal = round2(args.valorTotal);
  const totalPago = round2(r.totalPago);
  const retencaoValor = Math.max(0, round2(r.totalRetido));
  const saldoDevolverCliente = Math.max(0, round2(r.reembolso));
  const refundEscola = Math.max(0, round2(args.refundEscolaEsperado || 0));
  // Percentual EFETIVO retido sobre o total do programa (apos teto). Fracao 0..1,
  // so informacional no acerto — a conta de saldo usa o valor absoluto acima. 4
  // casas (round2 distorceria uma fracao pequena: 0,035 -> 0,04).
  const retencaoPercentual = valorTotal > 0 ? Math.round((retencaoValor / valorTotal) * 10000) / 10000 : 0;

  const memoria: LinhaMemoria[] = [
    { rotulo: "Valor total do programa", valor: valorTotal, tipo: "info" },
    { rotulo: "Total pago pelo cliente", valor: totalPago, tipo: "info" },
  ];
  if (r.dispensada) {
    memoria.push({ rotulo: "Retenção escalonada dispensada (Anexo I.4)", valor: 0, tipo: "debito" });
  } else {
    const etapaTxt = r.etapa ? ` — ${r.etapa.rotulo}` : "";
    memoria.push({
      rotulo: `Retenção Anexo I${etapaTxt} (${pctLabel(r.retencaoPercentual)})`,
      valor: round2(r.retencaoBruta),
      tipo: "debito",
    });
  }
  if (r.naoRecuperaveis > 0) {
    memoria.push({ rotulo: "Valores não recuperáveis", valor: round2(r.naoRecuperaveis), tipo: "debito" });
  }
  if (r.tetoAtingido) {
    memoria.push({ rotulo: "Total retido limitado ao teto contratual", valor: retencaoValor, tipo: "info" });
  }
  // "Total retido" so quando SOMA componentes ou o teto cortou — senao seria uma
  // segunda linha de debito identica a de retencao (parece dobro no Termo).
  if (r.naoRecuperaveis > 0 || r.tetoAtingido) {
    memoria.push({ rotulo: "Total retido", valor: retencaoValor, tipo: "debito" });
  }
  memoria.push({ rotulo: "Saldo a devolver ao cliente", valor: saldoDevolverCliente, tipo: "credito" });
  memoria.push({ rotulo: "Refund esperado da escola (tesouraria)", valor: refundEscola, tipo: "info" });

  return {
    retencaoPercentual,
    retencaoValor,
    saldoDevolverCliente,
    refundEscolaEsperado: refundEscola,
    memoria,
  };
}
