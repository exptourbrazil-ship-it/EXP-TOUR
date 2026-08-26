"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuote } from "@/lib/quote-issue-service";

// Cliente do portal do estudante. Registra comportamento (opened/option_viewed/
// downloaded/option_selected), alterna Detalhe/Resumo, e conduz a escolha em
// duas etapas (irreversivel). NAO recalcula nada: os valores vieram congelados.

function fmtMoeda(valor: number, moeda: string): string {
  const c = (moeda || "").toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) {
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: c }).format(valor);
    } catch {
      /* fallback abaixo */
    }
  }
  return `${c || "?"} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}
function fmtData(iso: string | null): string {
  if (!iso || iso.length < 10) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

async function postEvento(token: string, kind: string, metadata?: Record<string, unknown>) {
  try {
    await fetch(`/api/public/quotes/${token}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, metadata }),
    });
  } catch {
    /* telemetria e best-effort */
  }
}

// Alerta de erro na Area do Cliente: ambar + icone + texto (nunca vermelho puro;
// vermelho fica para emergencia). Reutilizado onde a acao pode falhar.
function AlertaErro({ msg }: { msg: string }) {
  return (
    <div
      role="alert"
      className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      </svg>
      <span>{msg}</span>
    </div>
  );
}

export default function PortalClient({ token, dados }: { token: string; dados: PublicQuote }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(dados.selectedIndex);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const abertoRef = useRef(false);

  // Registra 'opened' uma vez.
  useEffect(() => {
    if (abertoRef.current) return;
    abertoRef.current = true;
    void postEvento(token, "opened");
  }, [token]);

  const jaEscolhida = selectedIndex != null;
  const fx = dados.fx;

  function baixarPDF() {
    // PDF gerado no SERVIDOR (layout de marca). O proprio endpoint registra o
    // evento 'downloaded', entao nao duplicamos aqui.
    if (typeof window !== "undefined") {
      window.location.href = `/api/public/quotes/${token}/pdf`;
    }
  }

  async function compartilhar() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
        await (navigator as Navigator).share({ title: "Minha cotação — EXP Tour", url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert("Link copiado.");
      }
    } catch {
      /* usuario cancelou o compartilhamento */
    }
  }

  async function confirmarEscolha(index: number) {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/public/quotes/${token}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex: index, confirmar: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErro(json?.error?.message ?? "Não foi possível registrar a escolha.");
      } else {
        setSelectedIndex(index);
        setPendingIndex(null);
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      {/* Inicio */}
      <h1 className="font-serif text-3xl text-brand">
        {dados.studentFirstName ? `Olá, ${dados.studentFirstName}!` : "Sua cotação"}
      </h1>
      <p className="mt-1 text-sm text-neutral-600">
        {dados.brand} preparou {dados.options.length}{" "}
        {dados.options.length === 1 ? "opção" : "opções"} para você
        {dados.validUntil ? `. Válida até ${fmtData(dados.validUntil)}.` : "."}
      </p>

      {jaEscolhida ? (
        <div className="mt-4 rounded-2xl border border-brand/20 bg-brand-cream/60 p-4 text-sm text-brand">
          Você escolheu a <strong>opção {selectedIndex! + 1}</strong>. A EXP Tour dará sequência. A
          escolha por aqui é definitiva — fale com o seu consultor para ajustes.
        </div>
      ) : null}

      {dados.consultant ? (
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Seu consultor</h2>
          <p className="mt-1 text-brand">{dados.consultant.nome ?? "Equipe EXP Tour"}</p>
          {dados.consultant.email ? (
            <a className="text-sm text-neutral-600 underline" href={`mailto:${dados.consultant.email}`}>
              {dados.consultant.email}
            </a>
          ) : null}
        </section>
      ) : null}

      {/* Opcoes */}
      <div className="mt-6 space-y-4">
        {dados.options.map((op) => (
          <Opcao
            key={op.index}
            token={token}
            op={op}
            fx={fx}
            escolhida={selectedIndex === op.index}
            desabilitado={jaEscolhida}
            emEscolha={pendingIndex === op.index}
            enviando={enviando}
            erro={pendingIndex === op.index ? erro : null}
            onQueroEscolher={() => {
              setErro(null);
              setPendingIndex(op.index);
            }}
            onCancelarEscolha={() => {
              setErro(null);
              setPendingIndex(null);
            }}
            onConfirmar={() => confirmarEscolha(op.index)}
          />
        ))}
      </div>

      {/* Cambio */}
      {fx.necessario ? (
        <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 text-xs text-neutral-600">
          <p>
            Conversão {fx.sourceCurrency} → {fx.presentmentCurrency} pela taxa{" "}
            <strong>{fx.rate?.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</strong>
            {fx.rateAt ? `, de ${fmtData(fx.rateAt)}` : ""} (congelada nesta cotação).
          </p>
          {fx.disclaimer ? <p className="mt-1 text-neutral-500">{fx.disclaimer}</p> : null}
        </section>
      ) : null}

      {/* Acoes */}
      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <button
          onClick={baixarPDF}
          className="min-h-[44px] rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-brand hover:bg-neutral-50"
        >
          Baixar PDF
        </button>
        <button
          onClick={compartilhar}
          className="min-h-[44px] rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-brand hover:bg-neutral-50"
        >
          Compartilhar
        </button>
      </div>

      <p className="mt-8 text-center text-[11px] text-neutral-400">
        Cotação {dados.reference} · valores congelados na emissão
        {dados.validUntil ? ` · válida até ${fmtData(dados.validUntil)}` : ""}.
      </p>
    </div>
  );
}

type OpcaoData = PublicQuote["options"][number];

function Opcao({
  token,
  op,
  fx,
  escolhida,
  desabilitado,
  emEscolha,
  enviando,
  erro,
  onQueroEscolher,
  onCancelarEscolha,
  onConfirmar,
}: {
  token: string;
  op: OpcaoData;
  fx: PublicQuote["fx"];
  escolhida: boolean;
  desabilitado: boolean;
  emEscolha: boolean;
  enviando: boolean;
  erro: string | null;
  onQueroEscolher: () => void;
  onCancelarEscolha: () => void;
  onConfirmar: () => void;
}) {
  const [aba, setAba] = useState<"detalhe" | "resumo">("detalhe");
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void postEvento(token, "option_viewed", { optionIndex: op.index });
  }, [token, op.index]);

  const temDesconto = op.descontos > 0;
  const totalNaMoeda = fmtMoeda(op.liquido, op.currency);
  const totalConvertido =
    fx.necessario && op.liquidoConvertido != null
      ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency)
      : null;

  // Realce: escolhida = verde; recomendada (ainda nao escolhida) = dourado
  // (atencao / "proxima acao"); demais = neutra.
  const borda = escolhida
    ? "border-brand ring-1 ring-brand/30"
    : op.isRecommended
    ? "border-brand-gold ring-1 ring-brand-gold/40"
    : "border-neutral-200";

  return (
    <section className={`rounded-2xl border bg-white p-5 ${borda}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-brand">{op.label}</h2>
          {op.isRecommended ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-gold/20 px-2 py-0.5 text-[11px] font-semibold text-brand-golddark">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                <path d="M12 2l2.9 6 6.6.6-5 4.3 1.5 6.5L12 16.9 5.9 19.4 7.4 12.9l-5-4.3L9 8z" />
              </svg>
              Recomendada
            </span>
          ) : null}
        </div>
        <div className="text-right">
          {temDesconto ? (
            <div className="text-xs text-neutral-400 line-through">
              {fmtMoeda(op.bruto + op.taxas, op.currency)}
            </div>
          ) : null}
          <div className="font-serif text-2xl text-brand">{totalNaMoeda}</div>
          {totalConvertido ? <div className="text-xs text-neutral-500">≈ {totalConvertido}</div> : null}
          {/* Entrada sempre visivel: e o numero de comprometimento na decisao. */}
          {op.depositAmount != null ? (
            <div className="mt-1 text-xs text-neutral-500">
              Entrada {fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}
            </div>
          ) : null}
        </div>
      </div>

      {/* Abas */}
      <div className="mt-4 flex gap-2 border-b border-neutral-100 text-sm">
        <button
          onClick={() => setAba("detalhe")}
          className={`-mb-px min-h-[44px] border-b-2 px-3 py-3 ${
            aba === "detalhe" ? "border-brand font-medium text-brand" : "border-transparent text-neutral-500"
          }`}
        >
          Detalhe
        </button>
        <button
          onClick={() => setAba("resumo")}
          className={`-mb-px min-h-[44px] border-b-2 px-3 py-3 ${
            aba === "resumo" ? "border-brand font-medium text-brand" : "border-transparent text-neutral-500"
          }`}
        >
          Resumo financeiro
        </button>
      </div>

      {aba === "detalhe" ? (
        <ul className="mt-3 space-y-2 text-sm">
          {op.itens.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-neutral-700">
                {it.nome}
                {it.startDate ? (
                  <span className="text-neutral-400">
                    {" "}
                    · {fmtData(it.startDate)}
                    {it.endDate ? ` a ${fmtData(it.endDate)}` : ""}
                  </span>
                ) : null}
              </span>
              <span className="whitespace-nowrap text-brand">{fmtMoeda(it.grossAmount, it.currency)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <dl className="mt-3 space-y-1 text-sm">
          <ResumoLinha rot="Subtotal" val={fmtMoeda(op.bruto, op.currency)} />
          {op.taxas > 0 ? <ResumoLinha rot="Taxas" val={fmtMoeda(op.taxas, op.currency)} /> : null}
          {op.descontos > 0 ? (
            <ResumoLinha rot="Descontos" val={`- ${fmtMoeda(op.descontos, op.currency)}`} />
          ) : null}
          <ResumoLinha rot="Total" val={totalNaMoeda} destaque />
          {op.depositAmount != null ? (
            <ResumoLinha
              rot="Entrada"
              val={fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}
            />
          ) : null}
        </dl>
      )}

      {/* Escolha (2 etapas) */}
      <div className="mt-5 print:hidden">
        {escolhida ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Opção escolhida
          </p>
        ) : emEscolha ? (
          <div className="rounded-xl border border-brand/30 bg-brand-cream/50 p-3">
            <p className="text-sm text-brand">
              Confirmar a escolha desta opção? Esta ação é <strong>definitiva</strong> por aqui.
            </p>
            {/* Erro perto do botao de confirmar (nao no rodape da pagina). */}
            {erro ? <AlertaErro msg={erro} /> : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={onConfirmar}
                disabled={enviando}
                className="min-h-[44px] w-full rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
              >
                {enviando ? "Registrando…" : "Sim, escolher"}
              </button>
              <button
                onClick={onCancelarEscolha}
                disabled={enviando}
                className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm text-neutral-600 sm:w-auto"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : desabilitado ? (
          // Outra opcao ja foi escolhida: nao mostrar botao "quebrado" (cinza).
          <p className="text-sm text-neutral-400">Não selecionada</p>
        ) : (
          <button
            onClick={onQueroEscolher}
            className="min-h-[44px] w-full rounded-xl bg-brand px-5 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto"
          >
            Escolher esta opção
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.location.href = `/api/public/quotes/${token}/pdf?option=${op.index}`;
            }
          }}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm text-neutral-500 underline underline-offset-2 hover:text-brand"
        >
          Baixar PDF desta opção
        </button>
      </div>
    </section>
  );
}

function ResumoLinha({ rot, val, destaque }: { rot: string; val: string; destaque?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${destaque ? "border-t border-neutral-100 pt-1" : ""}`}>
      <dt className="text-neutral-500">{rot}</dt>
      <dd className={destaque ? "font-semibold text-brand" : "text-neutral-700"}>{val}</dd>
    </div>
  );
}
