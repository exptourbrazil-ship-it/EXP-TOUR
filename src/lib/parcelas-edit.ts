// Validacao PURA da edicao de um conjunto de parcelas de um contrato — as mesmas
// invariantes do self-service do cliente (rota /api/parcelas/ajustar), extraidas
// para serem reusadas pelo Admin (Caso 360) e cobertas por testes sem rede/DB.
//
// Regra central (dinheiro): parcela PAGA ou com Pix gerado (qr_code_url) e
// IMUTAVEL — nunca editada nem removida. Mas ela NAO trava o resto do plano: as
// pagas sao MANTIDAS (pass-through) e o cliente/admin ajusta livremente as demais.
// Isso permite ajustar as parcelas em aberto mesmo depois de uma ou mais pagas.
//
// Invariantes (aplicadas SEMPRE no servidor, nunca so na UI):
//  - ao menos uma parcela;
//  - cada parcela: descricao, valor > 0, vencimento;
//  - toda parcela travada (paga/Pix) precisa ser MANTIDA (nao pode ser removida)
//    e nao pode ter seus valores alterados (o apply ignora mudancas nelas);
//  - a soma do plano confere com o valor_total do contrato (quando houver),
//    usando o valor CONGELADO das travadas + o valor informado das demais;
//  - regra dos 30 dias: o ultimo vencimento <= data_inicio - 30 (quando houver);
//  - valor_original NUNCA e sobrescrito (preservado no apply, fora daqui).
//
// Modulo-folha (sem imports de runtime) para ser testavel com node --test, que
// nao resolve o alias `@/`. Os helpers de soma abaixo espelham parcelas.ts (a
// tolerancia de centavos e a MESMA); mantidos aqui para nao criar dependencia.

// Tolerancia (moeda do contrato) na comparacao soma x total — absorve centavos.
const TOLERANCIA_SOMA = 0.01;

// Soma arredondando para centavos.
function somaValoresParcelas(valores: number[]): number {
  const soma = valores.reduce((acc, v) => acc + (Number(v) || 0), 0);
  return Math.round(soma * 100) / 100;
}

// Confere a soma contra o total, em centavos inteiros (evita erro de float na
// fronteira da tolerancia).
function somaParcelasConfere(valores: number[], valorTotal: number): boolean {
  const soma = somaValoresParcelas(valores);
  const diffCents = Math.round(Math.abs(soma - valorTotal) * 100);
  return diffCents <= Math.round(TOLERANCIA_SOMA * 100);
}

export type ParcelaEditInput = {
  id?: string; // ausente = nova parcela
  numero?: number;
  descricao: string;
  valor: number; // moeda do programa
  vencimento: string; // YYYY-MM-DD
};

export type ParcelaAtual = {
  id: string;
  status: string;
  qr_code_url: string | null;
  valor_atual: number; // valor congelado usado na soma quando a parcela e travada
};

export type EdicaoInvalida = { ok: false; codigo: string; mensagem: string };
// remover = ids a excluir; manterTravadas = ids que sao pass-through (nao editar).
export type EdicaoValida = { ok: true; remover: string[]; travadas: Set<string> };
export type ResultadoEdicao = EdicaoValida | EdicaoInvalida;

// Uma parcela paga ou com Pix ja gerado esta "travada": imutavel e obrigatoria.
export function parcelaTravada(p: { status?: string; qr_code_url?: string | null } | undefined | null): boolean {
  return !!p && (p.status === "pago" || !!p.qr_code_url);
}

export function validarEdicaoParcelas(args: {
  parcelas: ParcelaEditInput[];
  atuais: ParcelaAtual[];
  valorTotal: number | null;
  dataInicio: string | null;
}): ResultadoEdicao {
  const { parcelas, atuais, valorTotal, dataInicio } = args;

  if (!Array.isArray(parcelas) || parcelas.length === 0) {
    return { ok: false, codigo: "vazio", mensagem: "É preciso manter ao menos uma parcela." };
  }

  const atuaisPorId = new Map(atuais.map((p) => [p.id, p]));
  const travadas = new Set(atuais.filter(parcelaTravada).map((p) => p.id));

  for (const p of parcelas) {
    if (!p.descricao || typeof p.valor !== "number" || !(p.valor > 0) || !p.vencimento) {
      return {
        ok: false,
        codigo: "campos",
        mensagem: "Cada parcela precisa de descrição, valor maior que zero e data de vencimento.",
      };
    }
    if (p.id && !atuaisPorId.has(p.id)) {
      return { ok: false, codigo: "nao_pertence", mensagem: "Parcela informada não pertence a este contrato." };
    }
    // Parcela travada presente no input e PERMITIDA — ela é mantida como está
    // (o apply ignora qualquer alteração de valor/vencimento nela).
  }

  // Toda parcela travada precisa continuar no plano (não pode ser removida).
  const idsRecebidos = new Set(parcelas.filter((p) => p.id).map((p) => p.id as string));
  for (const id of travadas) {
    if (!idsRecebidos.has(id)) {
      return {
        ok: false,
        codigo: "remover_travada",
        mensagem: "Não é possível excluir uma parcela já paga ou com Pix já gerado.",
      };
    }
  }
  const remover = atuais.filter((p) => !idsRecebidos.has(p.id)).map((p) => p.id); // só não-travadas chegam aqui

  // Soma do plano == valor_total. Para as travadas usa-se o valor congelado
  // (valor_atual do banco), não o que o cliente enviou.
  if (valorTotal != null && Number(valorTotal) > 0) {
    const valores = parcelas.map((p) => {
      const atual = p.id ? atuaisPorId.get(p.id) : undefined;
      return atual && parcelaTravada(atual) ? Number(atual.valor_atual) : p.valor;
    });
    if (!somaParcelasConfere(valores, Number(valorTotal))) {
      const soma = somaValoresParcelas(valores);
      return {
        ok: false,
        codigo: "soma",
        mensagem: `A soma das parcelas (${soma}) precisa ser igual ao total do contrato (${Number(valorTotal)}).`,
      };
    }
  }

  // Regra dos 30 dias: último vencimento das parcelas EM ABERTO <= data_inicio - 30.
  // (As travadas já foram pagas; suas datas não entram na barreira.)
  if (dataInicio) {
    const inicio = new Date(dataInicio + "T00:00:00");
    const limite = new Date(inicio);
    limite.setDate(limite.getDate() - 30);
    const abertas = parcelas.filter((p) => !(p.id && travadas.has(p.id)));
    const ultimoVenc = abertas
      .map((p) => new Date(p.vencimento + "T00:00:00"))
      .reduce((max, d) => (d > max ? d : max), new Date(0));
    if (abertas.length > 0 && ultimoVenc > limite) {
      const limiteISO = limite.toISOString().slice(0, 10);
      return {
        ok: false,
        codigo: "d30",
        mensagem: `O último pagamento precisa ser até ${limiteISO} (30 dias antes do início do programa).`,
      };
    }
  }

  return { ok: true, remover, travadas };
}
