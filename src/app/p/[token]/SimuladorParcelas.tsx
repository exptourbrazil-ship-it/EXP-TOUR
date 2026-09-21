"use client";

// Régua de parcelas da PROPOSTA — a mesma ergonomia da tela pública
// /orcamento/comparar: o estudante arrasta o mês em que quer viajar e vê
// quantas parcelas cabem até lá e quanto fica cada uma em real.
//
// A conta é a mesma do público (núcleo puro e testado em src/lib/orcamento.ts):
//   N       = meses até o FIM do mês de início, menos 2 de folga (máx. 18)
//   parcela = (líquido − entrada) ÷ N, na moeda do curso, convertida pela VET
//
// Câmbio: usa `fx.rate`, que o portal resolve pela cotação do DIA em que o link
// é aberto (ver quote-issue-service). Por isso a simulação em real muda se a
// proposta for reaberta dias depois — é o mesmo comportamento do Pix.
//
// Por que é SIMULAÇÃO e não plano: o valor em real só se fecha na geração do
// Pix. Quando o consultor define um plano de pagamento explícito para a opção,
// aquele plano vence e esta régua não se aplica àquela opção.

import { calcularNTrimestre, simularParcelamento } from "@/lib/orcamento";
import { mesesInicioDisponiveis, type MesInicio } from "@/app/orcamento/shared";

export type FxPortal = {
  necessario: boolean;
  rate: number | null;
  rateAt: string | null;
  sourceCurrency: string | null;
  presentmentCurrency: string;
};

/**
 * Meses oferecidos na régua, derivados de uma data EXPLÍCITA. O "hoje" vem do
 * servidor (fuso de São Paulo): calcular com `new Date()` aqui faria o servidor
 * e o navegador montarem listas diferentes na virada do mês — divergência de
 * hidratação, com o número da parcela mudando sob o usuário.
 */
export function mesesDaRegua(hojeISO: string): MesInicio[] {
  return mesesInicioDisponiveis(hojeISO);
}

/** Mês em que a régua abre: o do início do curso, quando a proposta o conhece. */
export function mesInicialDaRegua(meses: MesInicio[], inicioCursoISO: string | null): number {
  if (inicioCursoISO) {
    const chave = inicioCursoISO.slice(0, 7); // AAAA-MM
    const i = meses.findIndex((m) => m.key === chave);
    if (i >= 0) return i;
  }
  // Sem data de início utilizável, abre ~6 meses à frente, como a tela pública.
  // Abrir no índice 0 anunciaria "até 1 parcela" — o total à vista.
  return Math.min(5, Math.max(0, meses.length - 1));
}

/** Só dá para simular em real quando há VET para a moeda DAQUELA opção. */
export function podeSimular(fx: FxPortal): boolean {
  return fx.necessario;
}

const fmtBRL = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");

function fmtDataCurta(iso: string | null): string {
  if (!iso) return "vigente";
  try {
    return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "vigente";
  }
}

function fmtMoeda(v: number, cur: string): string {
  try {
    return v.toLocaleString("pt-BR", { style: "currency", currency: cur, maximumFractionDigits: 0 });
  } catch {
    return `${cur} ${Math.round(v).toLocaleString("pt-BR")}`;
  }
}

/** Cartão da régua: escolha do mês + explicação do câmbio. */
export function SimuladorParcelas({
  meses,
  mesIdx,
  onMesIdx,
  fx,
  hojeISO,
}: {
  meses: MesInicio[];
  mesIdx: number;
  onMesIdx: (i: number) => void;
  fx: FxPortal;
  hojeISO: string;
}) {
  const mes = meses[mesIdx];
  if (!mes || !fx.necessario) return null;
  const n = calcularNTrimestre(hojeISO, mes.fimISO);
  return (
    <section className="rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="titulo-portal text-base text-[color:var(--p-ink)]">Quando você quer viajar?</h2>
        <p className="text-base font-semibold capitalize text-[color:var(--p-accent-ink)]">{mes.label}</p>
      </div>

      <input
        type="range"
        min={0}
        max={meses.length - 1}
        step={1}
        value={mesIdx}
        onChange={(e) => onMesIdx(parseInt(e.target.value, 10))}
        aria-label="Mês de início do curso"
        className="mt-3 w-full accent-[color:var(--p-cta)]"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[color:var(--p-muted)]">
        <span className="capitalize">{meses[0]?.label}</span>
        <span>arraste para escolher o mês de início</span>
        <span className="capitalize">{meses[meses.length - 1]?.label}</span>
      </div>

      <p className="mt-3 text-sm text-[color:var(--p-ink)] opacity-90">
        Até <strong>{n}</strong> {n === 1 ? "parcela" : "parcelas"} sem juros, na moeda do curso. A parcela em
        real acompanha a cotação do dia — é por isso que não existe juro embutido no valor.
      </p>
      {fx.rate ? (
        <p className="mt-1 text-xs text-[color:var(--p-muted)]">
          {/* A taxa cai para a congelada na emissão quando falta cotação do dia
              (cron de câmbio fora do ar). Dizer "de hoje" nesse caso seria
              afirmar o que não se sabe — então a frase segue a data real. */}
          Simulação pela cotação{" "}
          {fx.rateAt && fx.rateAt.slice(0, 10) === hojeISO ? "de hoje" : `de ${fmtDataCurta(fx.rateAt)}`}, de{" "}
          {fx.rate.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 })} por{" "}
          {fx.sourceCurrency}. O valor de cada parcela em real se confirma na geração do Pix.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Linha de parcela de UMA opção, sob a régua. `compacto` é a versão de uma
 * linha usada na comparação; a completa abre entrada e total financiado.
 */
export function ParcelaDaOpcao({
  liquido,
  entrada,
  currency,
  vet,
  vetAt,
  mes,
  hojeISO,
  compacto = false,
}: {
  liquido: number;
  entrada: number;
  currency: string;
  /** VET DESTA opção (BRL por 1 unidade da moeda dela). null = não simula. */
  vet: number | null;
  /** Data do VET desta opção (YYYY-MM-DD). */
  vetAt?: string | null;
  mes: MesInicio | undefined;
  hojeISO: string;
  compacto?: boolean;
}) {
  // Sem VET da moeda desta opção nao ha como publicar um R$ — o total ja
  // aparece so na moeda do curso, e a parcela segue a mesma regra.
  if (!mes || !vet || vet <= 0) return null;
  const n = calcularNTrimestre(hojeISO, mes.fimISO);
  const sim = simularParcelamento({
    totalMoeda: liquido,
    entradaMoeda: entrada,
    vet,
    n,
    anoTrimestre: mes.ano,
  });

  if (compacto) {
    return (
      <p className="mt-2 text-sm text-[color:var(--p-ink)]">
        até <strong>{sim.n}×</strong> de <strong>{fmtBRL(sim.parcelaBRL)}</strong>
        {sim.entradaMoeda > 0 ? (
          <span className="text-[color:var(--p-muted)]"> + entrada de {fmtMoeda(sim.entradaMoeda, currency)}</span>
        ) : null}
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">
        Até {sim.n} {sim.n === 1 ? "parcela" : "parcelas"} de
      </p>
      <p className="titulo-portal text-2xl text-[color:var(--p-ink)]">{fmtBRL(sim.parcelaBRL)}</p>

      {sim.entradaMoeda > 0 ? (
        <p className="mt-2 text-sm text-[color:var(--p-ink)]">
          Entrada de <strong>{fmtMoeda(sim.entradaMoeda, currency)}</strong>
          <span className="text-[color:var(--p-muted)]"> · ≈ {fmtBRL(sim.entradaBRL)}</span>
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-[color:var(--p-muted)]">
        {sim.entradaMoeda > 0 ? (
          <>
            A entrada é o valor exato das taxas que a escola não devolve. O restante,{" "}
            {fmtMoeda(sim.financiadoMoeda, currency)}, é o que se divide nas parcelas.
          </>
        ) : (
          <>Total de {fmtMoeda(liquido, currency)} dividido nas parcelas.</>
        )}
      </p>

      {/* Qual câmbio gerou este número. Numa cotação com opções em moedas
          diferentes não existe uma taxa só no cabeçalho, então a taxa tem de
          estar ao lado da parcela que ela produziu. */}
      <p className="mt-2 text-[11px] text-[color:var(--p-muted)]">
        Simulação pela cotação{" "}
        {vetAt ? (vetAt.slice(0, 10) === hojeISO ? "de hoje" : `de ${fmtDataCurta(vetAt)}`) : "vigente"}, de{" "}
        {vet.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 })} por {currency}.
        O valor de cada parcela em real se confirma na geração do Pix.
      </p>

      {sim.curto ? (
        <p className="mt-2 text-[11px] text-[color:var(--p-muted)]">
          Prazo curto até essa data: dá para poucas parcelas. Escolher um mês mais à frente aumenta o
          número de parcelas.
        </p>
      ) : null}
      {sim.longo ? (
        <p className="mt-2 text-[11px] text-[color:var(--p-muted)]">
          Saída em 2028 ou depois: o preço da escola para esse período ainda pode ser revisado.
        </p>
      ) : null}
    </div>
  );
}
