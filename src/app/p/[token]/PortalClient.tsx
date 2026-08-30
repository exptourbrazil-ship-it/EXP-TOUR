"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuote } from "@/lib/quote-issue-service";

// Cliente do portal do estudante. Registra comportamento (opened/option_viewed/
// downloaded/option_selected), alterna Detalhe/Resumo, e conduz a escolha em
// duas etapas (irreversivel). NAO recalcula nada: os valores vieram congelados.
//
// Visual por TENANT: as cores/tipografia vem de variaveis CSS (--p-*) aplicadas
// no wrapper (ver page.tsx + src/lib/tenant-brand.ts). A mesma tela veste a
// identidade da EXP Tour (verde/dourado, titulo serif) ou da Forio (Night,
// Portal Blue, Amber Gate, Confirmed, Inter) sem ramificar componentes.

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

// Id de sessao do checkout (Clausula 17.1): estavel por token e sobrevivendo a
// navegacao entre etapas (sessionStorage). Vai no aceite como identificador do
// ato de marcacao eletronica. Se o storage falhar, o servidor sintetiza um.
function checkoutSessionId(token: string): string {
  const chave = `checkout_sid:${token}`;
  try {
    const existente = window.sessionStorage.getItem(chave);
    if (existente) return existente;
    const novo = (window.crypto?.randomUUID?.() ?? `sid-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    window.sessionStorage.setItem(chave, novo);
    return novo;
  } catch {
    return "";
  }
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
  const [concluido, setConcluido] = useState(false);
  const abertoRef = useRef(false);

  // Registra 'opened' uma vez.
  useEffect(() => {
    if (abertoRef.current) return;
    abertoRef.current = true;
    void postEvento(token, "opened");
  }, [token]);

  const jaEscolhida = selectedIndex != null;
  const fx = dados.fx;

  // Aceite concluido: tela terminal de sucesso (o codigo de acesso foi enviado).
  if (concluido) return <Sucesso brand={dados.brand} />;

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
        await (navigator as Navigator).share({ title: `Minha cotação — ${dados.brand}`, url });
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
      <h1 className="titulo-portal text-3xl text-[color:var(--p-ink)]">
        {dados.studentFirstName ? `Olá, ${dados.studentFirstName}` : "Sua cotação"}
      </h1>
      <p className="mt-1 text-sm text-[color:var(--p-muted)]">
        {dados.brand} preparou {dados.options.length}{" "}
        {dados.options.length === 1 ? "opção" : "opções"} para você
        {dados.validUntil ? `. Válida até ${fmtData(dados.validUntil)}.` : "."}
      </p>

      {jaEscolhida ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-success-soft)] p-4 text-sm text-[color:var(--p-ink)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--p-success)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>
            Você escolheu a <strong>opção {selectedIndex! + 1}</strong>. Para concluir, confirme seus dados
            e aceite o Termo de Adesão abaixo.
          </span>
        </div>
      ) : null}

      {dados.consultant ? (
        <section className="mt-6 rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Seu consultor</h2>
          <p className="mt-1 text-[color:var(--p-ink)]">{dados.consultant.nome ?? `Equipe ${dados.brand}`}</p>
          {dados.consultant.email ? (
            <a className="text-sm text-[color:var(--p-muted)] underline" href={`mailto:${dados.consultant.email}`}>
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

      {/* Checkout (so aceite): aparece depois da opcao escolhida. */}
      {jaEscolhida ? (
        <Checkout
          token={token}
          brand={dados.brand}
          opcao={dados.options[selectedIndex!]}
          fx={fx}
          onConcluido={() => setConcluido(true)}
        />
      ) : null}

      {/* Cambio */}
      {fx.necessario ? (
        <section className="mt-6 rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] p-4 text-xs text-[color:var(--p-muted)]">
          <p>
            Conversão {fx.sourceCurrency} → {fx.presentmentCurrency} pela taxa{" "}
            <strong>{fx.rate?.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</strong>
            {fx.rateAt ? `, de ${fmtData(fx.rateAt)}` : ""} (congelada nesta cotação).
          </p>
          {fx.disclaimer ? <p className="mt-1 opacity-80">{fx.disclaimer}</p> : null}
        </section>
      ) : null}

      {/* Acoes */}
      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <button
          onClick={baixarPDF}
          className="min-h-[44px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-3 text-sm text-[color:var(--p-ink)] hover:opacity-90"
        >
          Baixar PDF
        </button>
        <button
          onClick={compartilhar}
          className="min-h-[44px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-3 text-sm text-[color:var(--p-ink)] hover:opacity-90"
        >
          Compartilhar
        </button>
      </div>

      <p className="mt-8 text-center text-[11px] text-[color:var(--p-muted)] opacity-80">
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

  // Realce: escolhida = Confirmed (sucesso); recomendada (ainda nao escolhida) =
  // Amber Gate (atencao / "proxima acao"); demais = linha neutra.
  const borda = escolhida
    ? "border-[color:var(--p-success)] ring-1 ring-[color:var(--p-success)]"
    : op.isRecommended
    ? "border-[color:var(--p-accent)] ring-1 ring-[color:var(--p-accent)]"
    : "border-[color:var(--p-line)]";

  return (
    <section className={`rounded-2xl border bg-[color:var(--p-surface)] p-5 ${borda}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="titulo-portal text-xl text-[color:var(--p-ink)]">{op.label}</h2>
          {op.isRecommended ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[color:var(--p-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--p-accent-ink)]">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                <path d="M12 2l2.9 6 6.6.6-5 4.3 1.5 6.5L12 16.9 5.9 19.4 7.4 12.9l-5-4.3L9 8z" />
              </svg>
              Recomendada
            </span>
          ) : null}
        </div>
        <div className="text-right">
          {temDesconto ? (
            <div className="text-xs text-[color:var(--p-muted)] line-through opacity-70">
              {fmtMoeda(op.bruto + op.taxas, op.currency)}
            </div>
          ) : null}
          <div className="titulo-portal text-2xl text-[color:var(--p-ink)]">{totalNaMoeda}</div>
          {totalConvertido ? <div className="text-xs text-[color:var(--p-muted)]">≈ {totalConvertido}</div> : null}
          {/* Entrada sempre visivel: e o numero de comprometimento na decisao. */}
          {op.depositAmount != null ? (
            <div className="mt-1 text-xs text-[color:var(--p-muted)]">
              Entrada {fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}
            </div>
          ) : null}
        </div>
      </div>

      {/* Abas */}
      <div className="mt-4 flex gap-2 border-b border-[color:var(--p-line)] text-sm">
        <button
          onClick={() => setAba("detalhe")}
          className={`-mb-px min-h-[44px] border-b-2 px-3 py-3 ${
            aba === "detalhe"
              ? "border-[color:var(--p-cta)] font-medium text-[color:var(--p-cta)]"
              : "border-transparent text-[color:var(--p-muted)]"
          }`}
        >
          Detalhe
        </button>
        <button
          onClick={() => setAba("resumo")}
          className={`-mb-px min-h-[44px] border-b-2 px-3 py-3 ${
            aba === "resumo"
              ? "border-[color:var(--p-cta)] font-medium text-[color:var(--p-cta)]"
              : "border-transparent text-[color:var(--p-muted)]"
          }`}
        >
          Resumo financeiro
        </button>
      </div>

      {aba === "detalhe" ? (
        <ul className="mt-3 space-y-2 text-sm">
          {op.itens.map((it, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="text-[color:var(--p-ink)] opacity-90">
                {it.nome}
                {it.startDate ? (
                  <span className="text-[color:var(--p-muted)]">
                    {" "}
                    · {fmtData(it.startDate)}
                    {it.endDate ? ` a ${fmtData(it.endDate)}` : ""}
                  </span>
                ) : null}
              </span>
              <span className="whitespace-nowrap text-[color:var(--p-ink)]">{fmtMoeda(it.grossAmount, it.currency)}</span>
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
          <p className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--p-success)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Opção escolhida
          </p>
        ) : emEscolha ? (
          <div className="rounded-xl border border-[color:var(--p-accent)] bg-[color:var(--p-accent-soft)] p-3">
            <p className="text-sm text-[color:var(--p-ink)]">
              Confirmar a escolha desta opção? Esta ação é <strong>definitiva</strong> por aqui.
            </p>
            {/* Erro perto do botao de confirmar (nao no rodape da pagina). */}
            {erro ? <AlertaErro msg={erro} /> : null}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={onConfirmar}
                disabled={enviando}
                className="min-h-[44px] w-full rounded-xl bg-[color:var(--p-cta)] px-5 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] disabled:opacity-60 sm:w-auto"
              >
                {enviando ? "Registrando…" : "Sim, escolher"}
              </button>
              <button
                onClick={onCancelarEscolha}
                disabled={enviando}
                className="min-h-[44px] w-full rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-5 py-3 text-sm text-[color:var(--p-muted)] sm:w-auto"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : desabilitado ? (
          // Outra opcao ja foi escolhida: nao mostrar botao "quebrado" (cinza).
          <p className="text-sm text-[color:var(--p-muted)] opacity-70">Não selecionada</p>
        ) : (
          <button
            onClick={onQueroEscolher}
            className="min-h-[44px] w-full rounded-xl bg-[color:var(--p-cta)] px-5 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] hover:opacity-90 sm:w-auto"
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
          className="mt-3 inline-flex min-h-[44px] items-center text-sm text-[color:var(--p-muted)] underline underline-offset-2 hover:text-[color:var(--p-ink)]"
        >
          Baixar PDF desta opção
        </button>
      </div>
    </section>
  );
}

function ResumoLinha({ rot, val, destaque }: { rot: string; val: string; destaque?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between ${destaque ? "border-t border-[color:var(--p-line)] pt-1" : ""}`}>
      <dt className="text-[color:var(--p-muted)]">{rot}</dt>
      <dd className={destaque ? "font-semibold text-[color:var(--p-ink)]" : "text-[color:var(--p-ink)] opacity-90"}>{val}</dd>
    </div>
  );
}

// Mascara de CPF apenas para exibicao (o servidor normaliza/valida de verdade).
function mascararCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

// Checkout (SO ACEITE, sem pagamento): confirma os dados do pagante, exibe o
// Termo de Adesao vigente e registra o aceite -> a cotacao vira contrato e o
// titular recebe o codigo de acesso por e-mail. Todo o dinheiro vem do servidor;
// aqui so coletamos CPF/e-mail/telefone e o aceite (data/hora/IP/versao ficam no
// servidor).
function Checkout({
  token,
  brand,
  opcao,
  fx,
  onConcluido,
}: {
  token: string;
  brand: string;
  opcao: OpcaoData;
  fx: PublicQuote["fx"];
  onConcluido: () => void;
}) {
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [aceite, setAceite] = useState(false);
  const [termo, setTermo] = useState<{ versao: string; conteudo: string | null } | null>(null);
  const [carregandoTermo, setCarregandoTermo] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/public/quotes/${token}/termo`);
        const j = await r.json();
        if (vivo && r.ok && j.ok) setTermo({ versao: j.data.versao, conteudo: j.data.conteudo });
      } catch {
        /* sem termo: o botao fica bloqueado e o erro aparece ao tentar */
      } finally {
        if (vivo) setCarregandoTermo(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  const cpfLimpo = cpf.replace(/\D/g, "");
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const podeEnviar = cpfLimpo.length === 11 && emailOk && aceite && !!termo && !enviando;

  const totalNaMoeda = fmtMoeda(opcao.liquido, opcao.currency);
  const totalConvertido =
    fx.necessario && opcao.liquidoConvertido != null
      ? fmtMoeda(opcao.liquidoConvertido, fx.presentmentCurrency)
      : null;

  async function enviar() {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/public/quotes/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, email: email.trim(), telefone, aceite: true, sessionId: checkoutSessionId(token) }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setErro(j?.error?.message ?? "Não foi possível concluir o aceite.");
      } else {
        onConcluido();
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[color:var(--p-accent)] bg-[color:var(--p-surface)] p-5 print:hidden">
      <h2 className="titulo-portal text-xl text-[color:var(--p-ink)]">Concluir a matrícula</h2>
      <p className="mt-1 text-sm text-[color:var(--p-muted)]">
        Opção escolhida: <strong className="text-[color:var(--p-ink)]">{opcao.label}</strong> — {totalNaMoeda}
        {totalConvertido ? ` (≈ ${totalConvertido})` : ""}.
      </p>

      {/* Dados do pagante */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-[color:var(--p-muted)]">CPF do responsável</span>
          <input
            value={cpf}
            onChange={(e) => setCpf(mascararCpf(e.target.value))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] px-3 py-2 text-[color:var(--p-ink)] outline-none focus:border-[color:var(--p-cta)]"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[color:var(--p-muted)]">E-mail</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="voce@email.com"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] px-3 py-2 text-[color:var(--p-ink)] outline-none focus:border-[color:var(--p-cta)]"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-[color:var(--p-muted)]">Telefone (WhatsApp)</span>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="(11) 99999-9999"
            className="mt-1 min-h-[44px] w-full rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] px-3 py-2 text-[color:var(--p-ink)] outline-none focus:border-[color:var(--p-cta)]"
          />
        </label>
      </div>

      {/* Termo de Adesao */}
      <div className="mt-4">
        <span className="text-xs font-medium text-[color:var(--p-muted)]">
          Termo de Adesão{termo ? ` — versão ${termo.versao}` : ""}
        </span>
        <div className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] p-3 text-xs text-[color:var(--p-ink)] opacity-90">
          {carregandoTermo ? "Carregando o termo…" : termo?.conteudo || "Termo indisponível no momento."}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-[color:var(--p-ink)]">
          <input
            type="checkbox"
            checked={aceite}
            onChange={(e) => setAceite(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[color:var(--p-cta)]"
          />
          <span>
            Li e aceito o <strong>Termo de Adesão</strong> e autorizo {brand} a dar sequência à minha
            matrícula. Registramos a data, hora e IP deste aceite.
          </span>
        </label>
      </div>

      {erro ? <AlertaErro msg={erro} /> : null}

      <button
        onClick={enviar}
        disabled={!podeEnviar}
        className="mt-4 min-h-[44px] w-full rounded-xl bg-[color:var(--p-cta)] px-5 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {enviando ? "Concluindo…" : "Aceitar e concluir"}
      </button>
      <p className="mt-2 text-[11px] text-[color:var(--p-muted)] opacity-80">
        Sem pagamento agora: o acerto das parcelas acontece depois, na sua Área do Cliente.
      </p>
    </section>
  );
}

// Tela terminal apos o aceite: a cotacao virou contrato e o codigo de acesso foi
// enviado por e-mail. Sem pagamento aqui (acontece depois, logado).
function Sucesso({ brand }: { brand: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--p-success-soft)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--p-success)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 className="titulo-portal mt-4 text-2xl text-[color:var(--p-ink)]">Matrícula confirmada!</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--p-muted)]">
        Enviamos um <strong className="text-[color:var(--p-ink)]">código de acesso</strong> para o seu
        e-mail. Entre na Área do Cliente com o seu CPF e o código para acompanhar o seu programa e
        combinar o pagamento das parcelas.
      </p>
      <a
        href="/"
        className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[color:var(--p-cta)] px-6 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] hover:opacity-90"
      >
        Ir para a Área do Cliente
      </a>
      <p className="mt-6 text-[11px] text-[color:var(--p-muted)] opacity-70">{brand}</p>
    </div>
  );
}
