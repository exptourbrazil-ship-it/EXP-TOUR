// Helpers PUROS da baixa manual de parcela (pagamento recebido "por fora" do
// Pix/Mercado Pago, lancado por um admin financeiro). Sem dependencia de rede/DB
// para serem testaveis com o runner nativo do Node (ver CLAUDE.md). A escrita de
// dinheiro em si acontece na funcao Postgres `registrar_pagamento_manual` (sob
// lock, transacional) — aqui so calculamos e validamos.

// Cotacao IMPLICITA (VET) de uma baixa manual: quantos reais por 1 unidade da
// moeda do programa, a partir do BRL recebido e do valor na moeda do programa.
// Arredonda para 6 casas (mesma precisao de parcelas.cotacao_aplicada). Retorna
// null quando os insumos nao permitem calcular (evita divisao por zero).
export function cotacaoImplicita(valorBRL: number, valorPrograma: number): number | null {
  if (!Number.isFinite(valorBRL) || !Number.isFinite(valorPrograma)) return null;
  if (!(valorBRL > 0) || !(valorPrograma > 0)) return null;
  return Math.round((valorBRL / valorPrograma) * 1e6) / 1e6;
}

export type ValidacaoPagamentoManual =
  | { ok: true }
  | { ok: false; motivo: string };

// Guarda-corpos de entrada da baixa manual (o mesmo espirito e revalidado no
// servidor/SQL). Datas no futuro sao recusadas: um pagamento so pode ter sido
// recebido ate hoje.
export function validarValoresPagamentoManual(args: {
  valorBRL: number;
  valorPrograma: number;
  pagoEm: string; // YYYY-MM-DD
  hojeISO: string; // YYYY-MM-DD
}): ValidacaoPagamentoManual {
  if (!Number.isFinite(args.valorBRL) || !(args.valorBRL > 0)) {
    return { ok: false, motivo: "valor_brl_invalido" };
  }
  if (!Number.isFinite(args.valorPrograma) || !(args.valorPrograma > 0)) {
    return { ok: false, motivo: "valor_programa_invalido" };
  }
  const pago = (args.pagoEm || "").slice(0, 10);
  if (pago.length < 10) return { ok: false, motivo: "data_invalida" };
  if (pago > (args.hojeISO || "").slice(0, 10)) return { ok: false, motivo: "data_no_futuro" };
  return { ok: true };
}
