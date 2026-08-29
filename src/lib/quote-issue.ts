// Helpers PUROS da emissao de cotacao (Marco 5). Sem dependencia de rede/DB,
// para serem cobertos por node --test sem mocks. As funcoes que tocam banco ou
// usam crypto (token) ficam em quote-issue-service.ts (server-only).
//
// Regras: comentarios/erros em portugues; identificadores em ingles (ADR-001).

/** Pre-condicoes de emissao (spec 5.1): o que precisa ser verdade para `issued`. */
export type PrecondicoesEmissao = {
  /** Quantidade de opcoes da cotacao. */
  numOpcoes: number;
  /** Quantidade de itens em cada opcao (comprimento = numOpcoes). */
  itensPorOpcao: number[];
  /** `valid_until` definido. */
  temValidUntil: boolean;
  /** A conversao cambial e necessaria (moeda de origem != apresentacao). */
  fxNecessario: boolean;
  /** Ha uma taxa de cambio congelavel disponivel. */
  fxPresente: boolean;
  /** A taxa disponivel esta vencida (mais velha que max_rate_age_hours). */
  fxVencido: boolean;
  /** Itens em mais de uma moeda de origem (nao ha taxa unica para congelar). */
  fxMoedasMisturadas: boolean;
  /** Numero de avisos bloqueantes acumulados no construtor. */
  warningsBloqueantes: number;
};

/**
 * Decide se a cotacao pode ser emitida e, se nao, por que. Puro e determinístico
 * para ser testavel; a rota traduz `motivos` para a resposta ao operador.
 */
export function podeEmitir(p: PrecondicoesEmissao): { ok: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (p.numOpcoes < 1) motivos.push("A cotacao precisa de ao menos uma opcao.");
  const opcoesVazias = p.itensPorOpcao.filter((n) => n < 1).length;
  if (opcoesVazias > 0) {
    motivos.push(`Ha ${opcoesVazias} opcao(oes) sem itens; cada opcao precisa de ao menos um item.`);
  }
  if (!p.temValidUntil) motivos.push("Defina a validade (valid_until) antes de emitir.");
  if (p.fxNecessario) {
    if (p.fxMoedasMisturadas) {
      motivos.push("A cotacao tem itens em moedas diferentes; nao ha taxa unica para congelar.");
    } else if (!p.fxPresente) {
      motivos.push("Nao ha taxa de cambio disponivel para congelar.");
    } else if (p.fxVencido) {
      motivos.push("A taxa de cambio disponivel esta vencida (fora de max_rate_age_hours).");
    }
  }
  if (p.warningsBloqueantes > 0) {
    motivos.push(`Ha ${p.warningsBloqueantes} aviso(s) bloqueante(s) a resolver.`);
  }
  return { ok: motivos.length === 0, motivos };
}

/**
 * Converte um valor na moeda de origem para a de apresentacao pela taxa
 * congelada. Retorna 2 casas (dinheiro). `rate` <= 0 -> 0 (defensivo).
 * `rate` aqui e a cotacao_vet (ja embute PTAX + spread + IOF), a MESMA que o
 * contrato usa na cobranca -> o BRL exibido casa com a regra da parcela.
 */
export function converterPelaTaxa(valorOrigem: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(valorOrigem * rate * 100) / 100;
}

/**
 * Data de validade padrao: `issueISO` (YYYY-MM-DD) + `dias`. Aritmetica em UTC
 * (data civil, sem fuso) para nao escorregar um dia. `dias` < 0 vira 0.
 */
export function validadePadraoISO(issueISO: string, dias: number): string {
  const base = new Date(`${issueISO}T00:00:00.000Z`).getTime();
  const d = Number.isFinite(dias) && dias > 0 ? Math.floor(dias) : 0;
  return new Date(base + d * 86400000).toISOString().slice(0, 10);
}

/** Ultimo dia (civil) do mes de `iso` (YYYY-MM-DD). UTC. Ex.: "2026-08-14" -> "2026-08-31". */
export function ultimoDiaDoMesISO(iso: string): string {
  const [ano, mes] = iso.slice(0, 10).split("-").map(Number);
  // Dia 0 do mes SEGUINTE = ultimo dia do mes atual.
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

/**
 * Validade do CAMBIO congelado na cotacao: o que vier PRIMEIRO entre
 * `issue + dias` (default 10) e o ULTIMO DIA DO MES da emissao. A taxa e
 * congelada e nao pode ser honrada alem dessa janela curta (o cambio flutua e
 * o fechamento mensal e um marco); depois disso, reemitir para refrescar. Puro.
 */
export const VALIDADE_CAMBIO_DIAS = 10;
export function validadeCambioQuote(issueISO: string, dias: number = VALIDADE_CAMBIO_DIAS): string {
  const porDias = validadePadraoISO(issueISO, dias);
  const fimDoMes = ultimoDiaDoMesISO(issueISO);
  return porDias <= fimDoMes ? porDias : fimDoMes;
}

/**
 * A cotacao_vet (por DIA civil) esta vencida para congelar na emissao? Vencida
 * se nao ha data, ou se a data do VET esta mais de `maxDias` antes do dia da
 * emissao (cron diario deveria manter a diferenca em 0-1; a folga cobre
 * fim de semana/feriado/falha do job). VET "do futuro" nao conta como vencido.
 */
export function cambioVencidoPorData(vetDataISO: string | null, issueISO: string, maxDias: number): boolean {
  if (!vetDataISO || vetDataISO.length < 10) return true;
  const vet = new Date(`${vetDataISO.slice(0, 10)}T00:00:00.000Z`).getTime();
  const issue = new Date(`${issueISO.slice(0, 10)}T00:00:00.000Z`).getTime();
  const diffDias = Math.round((issue - vet) / 86400000);
  if (diffDias < 0) return false;
  const limite = Number.isFinite(maxDias) && maxDias >= 0 ? Math.floor(maxDias) : 0;
  return diffDias > limite;
}

/** A cotacao ja foi emitida (token vivo)? Estados a partir de `issued`. */
export function jaEmitida(status: string): boolean {
  return status === "issued" || status === "viewed" || status === "option_selected";
}

/**
 * Formato de token publico valido: 32 bytes em base64url sem padding = 43 chars
 * no alfabeto [A-Za-z0-9_-]. Barra tokens malformados antes de ir ao banco.
 */
export function tokenValidoFormato(token: string): boolean {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

/**
 * Moeda de origem unica entre os itens. Retorna a moeda se todos os itens
 * (nao vazios) compartilham a mesma; null se ha mistura; e a propria
 * apresentacao se a lista estiver vazia (nada a converter).
 */
export function moedaOrigemUnica(
  currencies: string[],
  presentment: string,
): string | null {
  const distintas = Array.from(new Set(currencies.filter(Boolean)));
  if (distintas.length === 0) return presentment;
  if (distintas.length === 1) return distintas[0];
  return null;
}
