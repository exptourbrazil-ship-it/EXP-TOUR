"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicQuote } from "@/lib/quote-issue-service";
import {
  ParcelaDaOpcao,
  SimuladorParcelas,
  mesInicialDaRegua,
  mesesDaRegua,
} from "./SimuladorParcelas";
import type { MesInicio } from "@/app/orcamento/shared";
import { REDE_LABEL, type Rede } from "@/lib/redes-sociais";

// Cliente do portal do estudante — apresentacao no formato Edvisor, em ABAS:
// Overview (opcoes lado a lado) · Option 1..N (detalhe de cada opcao: itens +
// Preco + plano de pagamento) · About Us (institucional da agencia) · Notes
// (observacoes do consultor). Registra comportamento (opened/option_viewed/
// downloaded/option_selected) e conduz a escolha em 2 etapas (irreversivel).
// O valor na MOEDA do curso vem congelado na emissao; a conversao em R$ e a
// cotacao do DIA (getPublicQuote recalcula pelo cotacao_vet corrente).
//
// Visual por TENANT: cores/tipografia vem de variaveis CSS (--p-*) aplicadas no
// wrapper (ver page.tsx + src/lib/tenant-brand.ts).

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
// F5: prazo da promocao (congelado na cotacao). Passado o prazo, sinaliza em vez
// de sumir — o valor cotado continua o mesmo (fotografia), so a leitura muda.
// `hojeISO` vem do servidor: `new Date()` aqui e avaliado no SSR e de novo na
// hidratacao, e na virada do dia os dois divergem — React acusa e o texto pisca.
function rotuloPrazo(validoAte: string | null, hojeISO: string): string {
  if (!validoAte) return "";
  const hoje = hojeISO.slice(0, 10);
  return validoAte < hoje
    ? ` · prazo da promoção encerrado em ${fmtData(validoAte)}`
    : ` · válida até ${fmtData(validoAte)}`;
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

type Aba = "overview" | "about" | "notes" | { opt: number };

export default function PortalClient({
  token,
  dados,
  hojeISO,
}: {
  token: string;
  dados: PublicQuote;
  hojeISO: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(dados.selectedIndex);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);
  const [aba, setAba] = useState<Aba>("overview");
  const abertoRef = useRef(false);
  const vistasRef = useRef<Set<number>>(new Set());

  // Registra 'opened' uma vez.
  useEffect(() => {
    if (abertoRef.current) return;
    abertoRef.current = true;
    void postEvento(token, "opened");
  }, [token]);

  // 'option_viewed' quando o estudante abre a aba de uma opcao (uma vez por opcao).
  useEffect(() => {
    if (typeof aba === "object") {
      const idx = aba.opt;
      if (!vistasRef.current.has(idx)) {
        vistasRef.current.add(idx);
        void postEvento(token, "option_viewed", { optionIndex: idx });
      }
    }
  }, [aba, token]);

  const jaEscolhida = selectedIndex != null;
  const fx = dados.fx;

  // Regua de parcelas: um unico mes escolhido vale para todas as opcoes, para
  // o estudante comparar sob a mesma premissa. `hoje` fica fixo na montagem —
  // recalcular a cada render mudaria N no meio da sessao.
  const meses = useMemo(() => mesesDaRegua(hojeISO), [hojeISO]);
  // Data de inicio do curso da cotacao: a regua abre nesse mes, em vez de
  // anunciar "ate 1 parcela" (o total a vista) do mes que vem.
  const inicioCurso = useMemo(() => {
    const datas = dados.options
      .flatMap((o) => o.itens.map((i) => i.startDate))
      .filter((d): d is string => !!d)
      .sort();
    return datas[0] ?? null;
  }, [dados.options]);
  const [mesIdx, setMesIdx] = useState(() => mesInicialDaRegua(meses, inicioCurso));
  const mostrarRegua = fx.necessario;
  // Taxa do dia por moeda, a partir das opcoes (cada uma ja carrega o seu VET).
  // Uma cotacao pode comparar destinos em moedas diferentes.
  const taxasPorMoeda = (() => {
    const m = new Map<string, { moeda: string; vet: number; vetAt: string | null }>();
    for (const op of dados.options) {
      if (op.currency === fx.presentmentCurrency || op.vet == null) continue;
      if (!m.has(op.currency)) m.set(op.currency, { moeda: op.currency, vet: op.vet, vetAt: op.vetAt });
    }
    return [...m.values()].sort((a, b) => a.moeda.localeCompare(b.moeda));
  })();
  // Par moeda+taxa resolvido de UMA fonte so: pegar a moeda de um lado e a taxa
  // do outro pode imprimir "1 GBP = <VET do CAD>", errado e com cara de preciso.
  const taxaUnica =
    taxasPorMoeda[0] ??
    (fx.sourceCurrency && fx.rate ? { moeda: fx.sourceCurrency, vet: fx.rate, vetAt: fx.rateAt } : null);
  // Opcao estrangeira que ficou sem valor em real (sem cotacao do dia, ou opcao
  // com moedas misturadas). Silencio aqui seria o cliente procurando um numero
  // que nao esta la.
  const opcoesSemReal = dados.options.filter(
    (op) => op.currency !== fx.presentmentCurrency && op.liquidoConvertido == null,
  );
  const temNotes = !!dados.notesHtml || dados.notas.length > 0;

  // Aceite concluido: tela terminal de sucesso (o codigo de acesso foi enviado).
  if (concluido) return <Sucesso brand={dados.brand} />;

  function irParaOpcao(index: number) {
    setAba({ opt: index });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function baixarPDF() {
    // PDF gerado no SERVIDOR (layout de marca). O proprio endpoint registra o
    // evento 'downloaded', entao nao duplicamos aqui.
    if (typeof window !== "undefined") window.location.href = `/api/public/quotes/${token}/pdf`;
  }

  function imprimir() {
    if (typeof window !== "undefined") window.print();
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

  const abaAtivaOpt = typeof aba === "object" ? aba.opt : null;

  return (
    <div>
      {/* Cabecalho: emissao, consultor, aluno, nº de opcoes */}
      <header className="border-b border-[color:var(--p-line)] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="titulo-portal text-2xl text-[color:var(--p-ink)]">
              {dados.studentFirstName ? `Cotação para ${dados.studentFirstName}` : "Sua cotação"}
            </h1>
            <p className="mt-1 text-sm text-[color:var(--p-muted)]">
              {dados.options.length} {dados.options.length === 1 ? "opção" : "opções"}
              {dados.issuedOn ? ` · emitida em ${fmtData(dados.issuedOn)}` : ""}
              {dados.validUntil ? ` · válida até ${fmtData(dados.validUntil)}` : ""}
            </p>
            {dados.consultant ? (
              <p className="mt-0.5 text-xs text-[color:var(--p-muted)]">
                Preparada por {dados.consultant.nome ?? `Equipe ${dados.brand}`}
                {dados.consultant.email ? ` · ${dados.consultant.email}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2 print:hidden">
            <button onClick={compartilhar} className="min-h-[40px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-3 py-2 text-sm text-[color:var(--p-ink)]">
              Compartilhar
            </button>
            <button onClick={imprimir} className="min-h-[40px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-3 py-2 text-sm text-[color:var(--p-ink)]">
              Imprimir
            </button>
          </div>
        </div>
      </header>

      {/* Navegacao de abas (Edvisor): Overview · Option 1..N · About Us · Notes */}
      <nav className="mt-4 flex flex-wrap gap-1 border-b border-[color:var(--p-line)] text-sm print:hidden" aria-label="Seções da cotação">
        <BotaoAba ativo={aba === "overview"} onClick={() => setAba("overview")}>Overview</BotaoAba>
        {dados.options.map((op) => (
          <BotaoAba key={op.index} ativo={abaAtivaOpt === op.index} onClick={() => setAba({ opt: op.index })}>
            Opção {op.index + 1}
            {selectedIndex === op.index ? " ✓" : ""}
          </BotaoAba>
        ))}
        <BotaoAba ativo={aba === "about"} onClick={() => setAba("about")}>Sobre nós</BotaoAba>
        {temNotes ? <BotaoAba ativo={aba === "notes"} onClick={() => setAba("notes")}>Observações</BotaoAba> : null}
      </nav>

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

      {/* Regua de parcelas — uma so, acima das abas, como na tela publica. */}
      {mostrarRegua ? (
        <div className="mt-6">
          <SimuladorParcelas
            meses={meses}
            mesIdx={mesIdx}
            onMesIdx={setMesIdx}
            fx={fx}
            hojeISO={hojeISO}
          />
        </div>
      ) : null}

      {/* Conteudo da aba */}
      <div className="mt-6">
        {aba === "overview" ? (
          <Overview
            dados={dados}
            mes={mostrarRegua ? meses[mesIdx] : undefined}
            hojeISO={hojeISO}
            selectedIndex={selectedIndex}
            onVerDetalhes={irParaOpcao}
            onEscolher={(idx) => {
              setErro(null);
              setPendingIndex(idx);
              irParaOpcao(idx);
            }}
          />
        ) : aba === "about" ? (
          <AboutUs dados={dados} />
        ) : aba === "notes" ? (
          <Notes html={dados.notesHtml} notas={dados.notas} />
        ) : (
          <DetalheOpcao
            token={token}
            op={dados.options[abaAtivaOpt!]}
            fx={fx}
            mes={mostrarRegua ? meses[mesIdx] : undefined}
            hojeISO={hojeISO}
            escolasContato={dados.escolas}
            escolhida={selectedIndex === abaAtivaOpt}
            desabilitado={jaEscolhida}
            emEscolha={pendingIndex === abaAtivaOpt}
            enviando={enviando}
            erro={pendingIndex === abaAtivaOpt ? erro : null}
            onQueroEscolher={() => {
              setErro(null);
              setPendingIndex(abaAtivaOpt);
            }}
            onCancelarEscolha={() => {
              setErro(null);
              setPendingIndex(null);
            }}
            onConfirmar={() => confirmarEscolha(abaAtivaOpt!)}
          />
        )}
      </div>

      {/* Checkout (so aceite): aparece depois da opcao escolhida, abaixo das abas. */}
      {jaEscolhida ? (
        <Checkout
          token={token}
          brand={dados.brand}
          opcao={dados.options[selectedIndex!]}
          fx={fx}
          onConcluido={() => setConcluido(true)}
        />
      ) : null}

      {/* Cambio. Quando as opcoes estao em moedas diferentes (ex.: Londres em GBP
          e Vancouver em CAD) nao ha UMA taxa: cada opcao e convertida pela
          cotacao da sua propria moeda, e o bloco lista todas. Sem nenhuma taxa
          conhecida o bloco nao aparece — melhor nada do que "1  =  BRL". */}
      {taxasPorMoeda.length > 0 || opcoesSemReal.length > 0 ? (
        <section className="mt-6 rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] p-4 text-xs text-[color:var(--p-muted)]">
          {taxasPorMoeda.length > 1 ? (
            <>
              <p>
                As opções estão em moedas diferentes: cada uma é convertida para{" "}
                {fx.presentmentCurrency} pela cotação da sua própria moeda, atualizada cada vez que
                este link é aberto.
              </p>
              <ul className="mt-1 space-y-0.5">
                {taxasPorMoeda.map((t) => (
                  <li key={t.moeda}>
                    1 {t.moeda} ={" "}
                    <strong>
                      {t.vet.toLocaleString("pt-BR", { style: "currency", currency: fx.presentmentCurrency, minimumFractionDigits: 4 })}
                    </strong>
                    {t.vetAt ? (t.vetAt.slice(0, 10) === hojeISO ? ", de hoje" : `, de ${fmtData(t.vetAt)}`) : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : taxaUnica ? (
            <p>
              Conversão {taxaUnica.moeda} → {fx.presentmentCurrency} pela taxa{" "}
              <strong>{taxaUnica.vet.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</strong>
              {/* "do dia" so quando a cotacao E do dia: quando o cambio nao rodou
                  hoje, afirmar isso seria dizer o que nao se sabe. */}
              {taxaUnica.vetAt
                ? taxaUnica.vetAt.slice(0, 10) === hojeISO
                  ? " — cotação de hoje"
                  : `, de ${fmtData(taxaUnica.vetAt)}`
                : ""}
              , atualizada cada vez que este link é aberto.
            </p>
          ) : null}
          {opcoesSemReal.length > 0 ? (
            <p className="mt-1 text-[color:var(--p-ink)]">
              {opcoesSemReal.length === 1
                ? `O valor em ${fx.presentmentCurrency} de "${opcoesSemReal[0].label || "uma das opções"}" não pôde ser calculado hoje; fale com seu consultor.`
                : `O valor em ${fx.presentmentCurrency} de ${opcoesSemReal.length} opções não pôde ser calculado hoje; fale com seu consultor.`}
            </p>
          ) : null}
          {fx.disclaimer ? <p className="mt-1 opacity-80">{fx.disclaimer}</p> : null}
        </section>
      ) : null}

      {/* Acoes globais */}
      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <button onClick={baixarPDF} className="min-h-[44px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-3 text-sm text-[color:var(--p-ink)]">
          Baixar PDF
        </button>
        <button onClick={compartilhar} className="min-h-[44px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-3 text-sm text-[color:var(--p-ink)]">
          Compartilhar
        </button>
      </div>

      <p className="mt-8 text-center text-[11px] text-[color:var(--p-muted)] opacity-80">
        Cotação {dados.reference} · valor na moeda do curso fixo · R$ pela cotação do dia
        {dados.validUntil ? ` · válida até ${fmtData(dados.validUntil)}` : ""}.
      </p>
    </div>
  );
}

function BotaoAba({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-current={ativo ? "page" : undefined}
      className={`-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-3 py-2.5 font-medium ${
        ativo
          ? "border-[color:var(--p-cta)] text-[color:var(--p-cta)]"
          : "border-transparent text-[color:var(--p-muted)] hover:text-[color:var(--p-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

type OpcaoData = PublicQuote["options"][number];
type FichaItem = NonNullable<OpcaoData["itens"][number]["ficha"]>;

// Rotulo pt-BR do grupo do item (para agrupar itens na apresentacao).
const GRUPO_LABEL: Record<string, string> = {
  program: "Curso",
  accommodation: "Acomodação",
  insurance: "Seguro",
  other: "Serviços",
  package: "Pacote",
};

// ---------------------------------------------------------------------------
// Aba OVERVIEW — opcoes lado a lado, resumidas, com total e CTA.
// ---------------------------------------------------------------------------
function Overview({
  dados,
  mes,
  hojeISO,
  selectedIndex,
  onVerDetalhes,
  onEscolher,
}: {
  dados: PublicQuote;
  mes: MesInicio | undefined;
  hojeISO: string;
  selectedIndex: number | null;
  onVerDetalhes: (index: number) => void;
  onEscolher: (index: number) => void;
}) {
  const fx = dados.fx;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {dados.options.map((op) => {
        const totalNaMoeda = fmtMoeda(op.liquido, op.currency);
        const totalConvertido =
          op.liquidoConvertido != null ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency) : null;
        const escolhida = selectedIndex === op.index;
        const borda = escolhida
          ? "border-[color:var(--p-success)] ring-1 ring-[color:var(--p-success)]"
          : op.isRecommended
          ? "border-[color:var(--p-accent)] ring-1 ring-[color:var(--p-accent)]"
          : "border-[color:var(--p-line)]";
        return (
          <section key={op.index} className={`flex flex-col rounded-2xl border bg-[color:var(--p-surface)] p-5 ${borda}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="titulo-portal text-lg text-[color:var(--p-ink)]">{op.label || `Opção ${op.index + 1}`}</h2>
              {op.isRecommended ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--p-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--p-accent-ink)]">
                  Recomendada
                </span>
              ) : null}
            </div>

            {/* Itens resumidos por grupo */}
            <ul className="mt-3 flex-1 space-y-1.5 text-sm">
              {op.itens.map((it, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="text-[color:var(--p-ink)] opacity-90">
                    <span className="text-[color:var(--p-muted)]">{GRUPO_LABEL[it.grupo] ?? it.grupo}: </span>
                    {it.nome}
                  </span>
                  <span className="whitespace-nowrap text-[color:var(--p-ink)]">{fmtMoeda(it.grossAmount, it.currency)}</span>
                </li>
              ))}
              {/* F5: cada promocao com o PRAZO congelado ("valida ate" / "prazo
                  encerrado"); manuais saem como "Desconto comercial". */}
              {op.descontosDetalhados.map((d, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-[color:var(--p-success)]">
                  <span>
                    {d.promocao ? "Promoção: " : "Desconto: "}
                    {d.nome}
                    {d.validoAte ? (
                      <span className="ml-1 text-xs text-[color:var(--p-muted)]">{rotuloPrazo(d.validoAte, hojeISO)}</span>
                    ) : null}
                  </span>
                  <span className="whitespace-nowrap">- {fmtMoeda(d.amount, d.currency)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-4 border-t border-[color:var(--p-line)] pt-3">
              <div className="flex items-end justify-between">
                <span className="text-sm text-[color:var(--p-muted)]">Total</span>
                <div className="text-right">
                  <div className="titulo-portal text-xl text-[color:var(--p-ink)]">
                    {totalConvertido ?? totalNaMoeda}
                  </div>
                  {totalConvertido ? <div className="text-xs text-[color:var(--p-muted)]">{totalNaMoeda}</div> : null}
                </div>
              </div>
              <ParcelaDaOpcao
                liquido={op.liquido}
                entrada={op.entrada}
                currency={op.currency}
                vet={op.vet}
                vetAt={op.vetAt}
                mes={mes}
                hojeISO={hojeISO}
                compacto
              />
              {/* A linha antiga de entrada so aparece quando a regua NAO esta
                  mostrando a dela — senao o mesmo dinheiro sai duas vezes
                  seguidas, e a leitura natural vira "entrada + entrada". */}
              {op.depositAmount != null && !(mes && op.vet && op.entrada > 0) ? (
                <p className="mt-1 text-right text-xs text-[color:var(--p-muted)]">
                  Entrada {fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <button
                onClick={() => onVerDetalhes(op.index)}
                className="min-h-[44px] flex-1 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-2.5 text-sm text-[color:var(--p-ink)]"
              >
                Ver detalhes
              </button>
              {selectedIndex == null ? (
                <button
                  onClick={() => onEscolher(op.index)}
                  className="min-h-[44px] flex-1 rounded-xl bg-[color:var(--p-cta)] px-4 py-2.5 text-sm font-medium text-[color:var(--p-cta-fg)]"
                >
                  Escolher
                </button>
              ) : escolhida ? (
                <span className="flex flex-1 items-center justify-center gap-1.5 text-sm font-medium text-[color:var(--p-success)]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Escolhida
                </span>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Bloco de bullets da ficha. Renderiza como TEXTO (o React escapa) — nunca HTML.
function BlocoBullets({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">{titulo}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[color:var(--p-ink)]">
        {itens.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

// Galeria de midia da ficha. URLs ja vem validadas (so http/https) do servidor.
// As fotos ABREM em tela cheia: na miniatura de 112px o estudante nao consegue
// avaliar o quarto, que e metade da decisao de acomodacao.
function GaleriaMidia({ midias }: { midias: FichaItem["midias"] }) {
  const imagens = midias.filter((m) => m.kind === "image");
  const outros = midias.filter((m) => m.kind !== "image");
  const [aberta, setAberta] = useState<number | null>(null);

  if (midias.length === 0) return null;
  return (
    <div className="mt-3">
      {imagens.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {imagens.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAberta(i)}
              aria-label={`Ampliar ${m.caption ?? "foto"} (${i + 1} de ${imagens.length})`}
              className="group relative block h-28 w-full overflow-hidden rounded-lg print:pointer-events-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url}
                alt={m.caption ?? "Foto do programa"}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full cursor-zoom-in object-cover transition group-hover:brightness-90"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 print:hidden"
              >
                ampliar
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {aberta != null && imagens[aberta] ? (
        <Lightbox
          imagens={imagens}
          indice={aberta}
          onFechar={() => setAberta(null)}
          onIr={(i) => setAberta(i)}
        />
      ) : null}
      {outros.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {outros.map((m, i) => (
            <li key={i}>
              <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="text-[color:var(--p-nav)] underline">
                {m.caption ?? (m.kind === "video" ? "Assistir ao vídeo" : "Abrir documento")}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}


// Visualizador de foto em tela cheia. Teclado: Esc fecha, setas navegam — e o
// que se espera de uma galeria, e o estudante pode estar no notebook decidindo
// com a familia ao lado.
function Lightbox({
  imagens,
  indice,
  onFechar,
  onIr,
}: {
  imagens: FichaItem["midias"];
  indice: number;
  onFechar: () => void;
  onIr: (i: number) => void;
}) {
  const atual = imagens[indice];
  const total = imagens.length;

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowRight" && total > 1) onIr((indice + 1) % total);
      else if (e.key === "ArrowLeft" && total > 1) onIr((indice - 1 + total) % total);
    }
    window.addEventListener("keydown", aoTeclar);
    // Trava o scroll do fundo enquanto a foto esta aberta.
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntes;
    };
  }, [indice, total, onFechar, onIr]);

  if (!atual) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={atual.caption ?? "Foto ampliada"}
      onClick={onFechar}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4 print:hidden"
    >
      <div className="flex w-full max-w-5xl items-center justify-between gap-3 pb-2 text-white">
        <span className="text-xs text-white/70">
          {total > 1 ? `${indice + 1} de ${total}` : ""}
        </span>
        <button
          type="button"
          onClick={onFechar}
          className="rounded-lg border border-white/25 px-3 py-1.5 text-xs font-medium text-white/90 transition hover:bg-white/10"
        >
          Fechar
        </button>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={atual.url}
        alt={atual.caption ?? "Foto ampliada"}
        referrerPolicy="no-referrer"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[78vh] w-auto max-w-full rounded-lg object-contain"
      />

      {atual.caption ? (
        <p className="mt-2 max-w-3xl text-center text-sm text-white/85">{atual.caption}</p>
      ) : null}

      {total > 1 ? (
        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => onIr((indice - 1 + total) % total)}
            aria-label="Foto anterior"
            className="rounded-lg border border-white/25 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10"
          >
            ‹ Anterior
          </button>
          <button
            type="button"
            onClick={() => onIr((indice + 1) % total)}
            aria-label="Próxima foto"
            className="rounded-lg border border-white/25 px-4 py-2 text-sm text-white/90 transition hover:bg-white/10"
          >
            Próxima ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Disclosure com a ficha do produto (do snapshot). A descricao vem SANITIZADA do
// servidor; so ela usa dangerouslySetInnerHTML. Os bullets sao texto puro.
function FichaDetalhes({ ficha }: { ficha: FichaItem }) {
  const temAlgo =
    !!ficha.descriptionHtml ||
    ficha.highlights.length > 0 ||
    ficha.inclusions.length > 0 ||
    ficha.exclusions.length > 0 ||
    ficha.notIdealFor.length > 0 ||
    ficha.midias.length > 0;
  if (!temAlgo) return null;
  return (
    <details className="mt-1.5 rounded-lg border border-[color:var(--p-line)] px-3 py-2">
      <summary className="cursor-pointer text-xs font-medium text-[color:var(--p-nav)]">Detalhes</summary>
      <div className="mt-2 text-sm leading-relaxed">
        {ficha.isMachineTranslated ? (
          <p className="mb-2 text-[11px] italic text-[color:var(--p-muted)]">Tradução automática — sujeita a revisão.</p>
        ) : null}
        {ficha.descriptionHtml ? (
          <div
            className="space-y-2 text-[color:var(--p-ink)] [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: ficha.descriptionHtml }}
          />
        ) : null}
        <BlocoBullets titulo="Destaques" itens={ficha.highlights} />
        <BlocoBullets titulo="Incluído" itens={ficha.inclusions} />
        <BlocoBullets titulo="Não incluído" itens={ficha.exclusions} />
        <BlocoBullets titulo="Menos indicado para" itens={ficha.notIdealFor} />
        <GaleriaMidia midias={ficha.midias} />
      </div>
    </details>
  );
}

type DetalhesItem = OpcaoData["itens"][number]["detalhes"];
type EscolaItem = NonNullable<DetalhesItem["escola"]>;

// Grade de Quick Info (rótulo/valor) — curso ou acomodação.
function QuickInfoGrid({ linhas }: { linhas: { rotulo: string; valor: string }[] }) {
  if (linhas.length === 0) return null;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {linhas.map((l, i) => (
        <div key={i}>
          <dt className="text-[11px] uppercase tracking-wide text-[color:var(--p-muted)]">{l.rotulo}</dt>
          <dd className="text-[color:var(--p-ink)]">{l.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

// Detalhes por item: Quick Info do curso (+ timetable) ou atributos da acomodação.
function DetalhesItemBloco({ d }: { d: DetalhesItem }) {
  const prog = d.programa;
  const acom = d.acomodacao;
  if (!prog && !acom) return null;
  return (
    <div className="mt-2">
      {prog ? (
        <>
          <QuickInfoGrid linhas={prog.quickInfo} />
          {prog.timetable.length > 0 ? (
            <div className="mt-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Grade de horários</p>
              <ul className="mt-1 space-y-1 text-sm text-[color:var(--p-ink)]">
                {prog.timetable.map((t, i) => (
                  <li key={i}>
                    <span className="text-[color:var(--p-muted)]">{t.dia}: </span>
                    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
                      {t.blocos.map((b, j) => {
                        const ehIntervalo = b.isIntervalo ?? b.descricao.toLowerCase().includes("intervalo");
                        const horario = b.inicio && b.fim ? `${b.inicio}–${b.fim}` : null;
                        return (
                          <span
                            key={j}
                            className={ehIntervalo ? "italic text-[color:var(--p-muted)]" : undefined}
                          >
                            {horario ? `${horario} ` : ""}
                            {b.descricao}
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
      {acom ? <QuickInfoGrid linhas={acom.linhas} /> : null}
    </div>
  );
}

// "Sobre a escola" — descrição (sanitizada), destaques, fotos/vídeo do campus.
function EscolaBloco({
  escola,
  contato,
}: {
  escola: EscolaItem;
  contato: PublicQuote["escolas"][string] | null;
}) {
  const website = contato?.website ?? null;
  const favicon = contato?.favicon ?? null;
  const social = contato?.social ?? [];
  return (
    <div className="mt-5 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Sobre a escola</h3>
      <p className="mt-1 flex items-center gap-2 text-[color:var(--p-ink)]">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={favicon}
            alt=""
            aria-hidden="true"
            width={16}
            height={16}
            loading="lazy"
            referrerPolicy="no-referrer"
            // Favicon quebrado some em vez de deixar o icone de imagem partida
            // ao lado do nome da escola numa proposta que vai para o cliente.
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
            className="h-4 w-4 shrink-0 rounded-sm object-contain"
          />
        ) : null}
        <span>
          {escola.nome ?? "Escola"}
          {escola.local ? <span className="text-[color:var(--p-muted)]"> · {escola.local}</span> : null}
        </span>
      </p>
      {website ? (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-1 inline-flex items-center gap-1 text-sm text-[color:var(--p-nav)] underline print:no-underline"
        >
          Site da escola
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
          </svg>
        </a>
      ) : null}
      {escola.descriptionHtml ? (
        <div
          className="mt-2 space-y-2 text-sm leading-relaxed text-[color:var(--p-ink)] [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: escola.descriptionHtml }}
        />
      ) : null}
      <BlocoBullets titulo="Destaques" itens={escola.highlights} />

      {escola.amenities.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Estrutura</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {escola.amenities.map((a, i) => (
              <span key={i} className="rounded-full border border-[color:var(--p-line)] px-2.5 py-0.5 text-xs text-[color:var(--p-ink)]">{a}</span>
            ))}
          </div>
        </div>
      ) : null}

      {escola.accreditations.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Acreditações</p>
          <p className="mt-1 text-sm text-[color:var(--p-ink)]">{escola.accreditations.join(" · ")}</p>
        </div>
      ) : null}

      {escola.nationalityMix.length > 0 ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Mix de nacionalidades</p>
          <ul className="mt-1 space-y-1">
            {escola.nationalityMix.map((n, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 text-[color:var(--p-ink)]">{n.pais}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--p-line)]">
                  <span className="block h-full rounded-full bg-[color:var(--p-cta)]" style={{ width: `${Math.min(100, Math.max(0, n.percentual))}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-xs text-[color:var(--p-muted)]">{Math.round(n.percentual)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {social.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {social.map((r) => (
            <a
              key={r.rede}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={`${escola.nome ?? "Escola"} no ${REDE_LABEL[r.rede]}`}
              aria-label={`${escola.nome ?? "Escola"} no ${REDE_LABEL[r.rede]}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--p-line)] text-[color:var(--p-ink)] transition hover:border-[color:var(--p-cta)] hover:text-[color:var(--p-cta)] print:hidden"
            >
              <IconeRede rede={r.rede} />
            </a>
          ))}
        </div>
      ) : null}

      <GaleriaMidia midias={escola.midias} />
    </div>
  );
}

// Ícones das redes, inline (sem biblioteca e sem requisição externa: são
// poucos e assim não dependem de CDN numa página pública).
function IconeRede({ rede }: { rede: Rede }) {
  const base = "h-4 w-4";
  switch (rede) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={base} aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={base} aria-hidden="true">
          <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v7h3v-7h3l1-3h-4v-2c0-.6.4-1 1-1z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={base} aria-hidden="true">
          <path d="M22 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.5a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.5a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12zM10 15V9l5.2 3L10 15z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={base} aria-hidden="true">
          <path d="M6.9 8.4H3.9V20h3V8.4zM5.4 3a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM20.1 20h-3v-6c0-1.5-.5-2.5-1.8-2.5-1 0-1.6.7-1.9 1.4-.1.2-.1.6-.1.9V20h-3V8.4h3v1.6c.4-.7 1.2-1.7 3-1.7 2.2 0 3.8 1.4 3.8 4.5V20z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={base} aria-hidden="true">
          <path d="M16.5 3c.4 1.9 1.6 3.3 3.5 3.6v2.9c-1.3.1-2.6-.3-3.7-1v5.8c0 3.4-2.6 5.7-5.7 5.7A5.6 5.6 0 0 1 5 14.5c0-3.1 2.6-5.6 5.9-5.3v3a2.6 2.6 0 0 0-3 2.4 2.6 2.6 0 0 0 5.1.2V3h3.5z" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={base} aria-hidden="true">
          <path d="M17.5 3h3l-6.6 7.5L21.8 21h-6l-4.3-5.6L6.5 21H3.4l7-8L2.6 3h6.1l3.9 5.2L17.5 3zm-1.1 16h1.7L7.7 4.8H5.9L16.4 19z" />
        </svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Aba OPTION N — detalhe completo: itens agrupados (Courses/Accommodations/
// Services) + Preco (subtotal, taxas linha a linha, descontos, total, entrada)
// + plano de pagamento + escolha.
// ---------------------------------------------------------------------------
function DetalheOpcao({
  token,
  op,
  fx,
  mes,
  hojeISO,
  escolasContato,
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
  mes: MesInicio | undefined;
  hojeISO: string;
  escolasContato: PublicQuote["escolas"];
  escolhida: boolean;
  desabilitado: boolean;
  emEscolha: boolean;
  enviando: boolean;
  erro: string | null;
  onQueroEscolher: () => void;
  onCancelarEscolha: () => void;
  onConfirmar: () => void;
}) {
  const totalNaMoeda = fmtMoeda(op.liquido, op.currency);
  const totalConvertido =
    op.liquidoConvertido != null ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency) : null;

  // Agrupa os itens por grupo, preservando a ordem de aparicao dos grupos.
  const grupos: { grupo: string; itens: OpcaoData["itens"] }[] = [];
  for (const it of op.itens) {
    let g = grupos.find((x) => x.grupo === it.grupo);
    if (!g) {
      g = { grupo: it.grupo, itens: [] };
      grupos.push(g);
    }
    g.itens.push(it);
  }

  const borda = escolhida
    ? "border-[color:var(--p-success)] ring-1 ring-[color:var(--p-success)]"
    : op.isRecommended
    ? "border-[color:var(--p-accent)] ring-1 ring-[color:var(--p-accent)]"
    : "border-[color:var(--p-line)]";

  return (
    <section className={`rounded-2xl border bg-[color:var(--p-surface)] p-5 ${borda}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="titulo-portal text-xl text-[color:var(--p-ink)]">{op.label || "Opção"}</h2>
          {op.isRecommended ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[color:var(--p-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--p-accent-ink)]">
              Recomendada
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <div className="titulo-portal text-2xl text-[color:var(--p-ink)]">{totalConvertido ?? totalNaMoeda}</div>
          {totalConvertido ? <div className="text-xs text-[color:var(--p-muted)]">{totalNaMoeda}</div> : null}
        </div>
      </div>

      {/* Simulacao de parcelas. Quando o consultor definiu um plano de
          pagamento para esta opcao, aquele plano e o combinado e aparece mais
          abaixo — a simulacao sairia contradizendo. */}
      {!op.planoPagamento || op.planoPagamento.parcelas.length === 0 ? (
        <ParcelaDaOpcao
          liquido={op.liquido}
          entrada={op.entrada}
          currency={op.currency}
          vet={op.vet}
          vetAt={op.vetAt}
          mes={mes}
          hojeISO={hojeISO}
        />
      ) : null}

      {/* Itens por grupo (Curso / Acomodação / Serviços) */}
      {grupos.map((g) => (
        <div key={g.grupo} className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">
            {GRUPO_LABEL[g.grupo] ?? g.grupo}
          </h3>
          <ul className="mt-2 space-y-2 text-sm">
            {g.itens.map((it, i) => (
              <li key={i}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[color:var(--p-ink)] opacity-90">
                    {it.nome}
                    {it.startDate ? (
                      <span className="text-[color:var(--p-muted)]">
                        {" "}· {fmtData(it.startDate)}
                        {it.endDate ? ` a ${fmtData(it.endDate)}` : ""}
                      </span>
                    ) : null}
                  </span>
                </div>
                <DetalhesItemBloco d={it.detalhes} />
                {it.ficha ? <FichaDetalhes ficha={it.ficha} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Sobre a escola — uma vez por campus da opção (deduplicado). */}
      {(() => {
        const vistos = new Set<string>();
        const escolas: EscolaItem[] = [];
        op.itens.forEach((it, idx) => {
          const e = it.detalhes.escola;
          if (!e) return;
          // Dedup por campus; escola anônima (sem id/nome) usa o índice para não colidir.
          const chave = e.campusId ?? e.nome ?? `__idx_${idx}`;
          if (vistos.has(chave)) return;
          vistos.add(chave);
          escolas.push(e);
        });
        return escolas.map((e, i) => (
          <EscolaBloco key={i} escola={e} contato={(e.campusId && escolasContato[e.campusId]) || null} />
        ));
      })()}

      {/* Detalhamento do preco — cada taxa embaixo do item que ela encarece,
          subtotal por bloco e total no fim. E como o cliente le a conta: "o
          curso custa X, e a matricula e desse curso". */}
      <DetalhamentoPreco op={op} fx={fx} grupos={grupos} hojeISO={hojeISO} escolasContato={escolasContato} />

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
          <p className="text-sm text-[color:var(--p-muted)] opacity-70">Não selecionada</p>
        ) : (
          <button
            onClick={onQueroEscolher}
            className="min-h-[44px] w-full rounded-xl bg-[color:var(--p-cta)] px-5 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] sm:w-auto"
          >
            Escolher esta opção
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = `/api/public/quotes/${token}/pdf?option=${op.index}`;
          }}
          className="mt-3 inline-flex min-h-[44px] items-center text-sm text-[color:var(--p-muted)] underline underline-offset-2 hover:text-[color:var(--p-ink)]"
        >
          Baixar PDF desta opção
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detalhamento do preco (o "Price Breakdown"): por bloco (Curso / Acomodacao /
// Servicos), cada item com as SUAS taxas logo abaixo e um subtotal do bloco.
// Descontos em destaque, total na moeda do cliente e plano de pagamento.
// ---------------------------------------------------------------------------
function LinhaPreco({
  rotulo,
  detalhe,
  valor,
  tom,
  forte,
}: {
  rotulo: string;
  detalhe?: string | null;
  valor: string;
  tom?: "normal" | "desconto";
  forte?: boolean;
}) {
  const cor = tom === "desconto" ? "text-[color:var(--p-success)]" : "text-[color:var(--p-ink)]";
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={`text-sm ${forte ? "font-semibold" : ""} text-[color:var(--p-ink)] opacity-90`}>
        {rotulo}
        {detalhe ? <span className="block text-[11px] text-[color:var(--p-muted)]">{detalhe}</span> : null}
      </span>
      <span className={`whitespace-nowrap text-sm tabular-nums ${forte ? "font-semibold" : ""} ${cor}`}>{valor}</span>
    </div>
  );
}

function DetalhamentoPreco({
  op,
  fx,
  grupos,
  hojeISO,
  escolasContato,
}: {
  op: OpcaoData;
  fx: PublicQuote["fx"];
  grupos: { grupo: string; itens: OpcaoData["itens"] }[];
  hojeISO: string;
  escolasContato: PublicQuote["escolas"];
}) {
  const totalNaMoeda = fmtMoeda(op.liquido, op.currency);
  const totalConvertido =
    op.liquidoConvertido != null ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency) : null;

  // Taxa de COTACAO INTEIRA nao e de item nenhum: no banco ela fica pendurada em
  // um quote_item qualquer (a coluna e obrigatoria), e mostra-la sob a acomodacao
  // faria o cliente perguntar exatamente o que esta tela quer evitar: "taxa de que?".
  const daCotacao = (t: OpcaoData["taxasDetalhadas"][number]) =>
    t.basis === "once_per_quote" || t.itemIndex == null || t.itemIndex >= op.itens.length;
  const taxasDoItem = (i: number) => op.taxasDetalhadas.filter((t) => !daCotacao(t) && t.itemIndex === i);
  const taxasSoltas = op.taxasDetalhadas.filter(daCotacao);

  // Moedas presentes na opcao inteira (itens + taxas + descontos) e o total de
  // cada uma — usados quando a opcao mistura moedas.
  const totalPorMoeda = new Map<string, number>();
  const somar = (m: string, v: number) => totalPorMoeda.set(m, (totalPorMoeda.get(m) ?? 0) + v);
  for (const it of op.itens) somar(it.currency, it.grossAmount);
  for (const t of op.taxasDetalhadas) somar(t.currency, t.amount);
  for (const d of op.descontosDetalhados) somar(d.currency, -d.amount);
  const moedasDaOpcao = new Set(totalPorMoeda.keys());

  // Subtotal so aparece quando o bloco inteiro esta numa moeda so: somar moedas
  // diferentes daria um numero que nao existe.
  function subtotalDoGrupo(itens: OpcaoData["itens"]): string | null {
    const moedas = new Set<string>();
    let soma = 0;
    for (const it of itens) {
      moedas.add(it.currency);
      soma += it.grossAmount;
      for (const t of taxasDoItem(op.itens.indexOf(it))) {
        moedas.add(t.currency);
        soma += t.amount;
      }
    }
    if (moedas.size !== 1) return null;
    return fmtMoeda(soma, [...moedas][0]);
  }

  return (
    <div className="mt-6 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] p-4">
      <h3 className="titulo-portal text-base text-[color:var(--p-ink)]">Detalhamento do preço</h3>

      {grupos.map((g, gi) => {
        const subtotal = subtotalDoGrupo(g.itens);
        return (
          <div key={g.grupo} className={gi === 0 ? "mt-3" : "mt-5"}>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">
              {GRUPO_LABEL[g.grupo] ?? g.grupo}
            </h4>
            <div className="mt-1 divide-y divide-[color:var(--p-line)]/60">
              {g.itens.map((it, i) => {
                const idx = op.itens.indexOf(it);
                const periodo = it.startDate
                  ? `${fmtData(it.startDate)}${it.endDate ? ` a ${fmtData(it.endDate)}` : ""}`
                  : null;
                const escola = it.detalhes.escola;
                // Nome da ESCOLA quando conhecido; o snapshot so guarda o nome da
                // unidade ("Vancouver"), que ao lado da cidade nao informa nada.
                const contato = escola?.campusId ? escolasContato[escola.campusId] : null;
                const ondeQuem = [contato?.nome ?? escola?.nome, escola?.local].filter(Boolean).join(" · ");
                return (
                  <div key={i} className="py-1.5">
                    <LinhaPreco
                      rotulo={it.nome}
                      detalhe={[ondeQuem || null, periodo].filter(Boolean).join(" · ") || null}
                      valor={fmtMoeda(it.grossAmount, it.currency)}
                    />
                    {taxasDoItem(idx).map((t, k) => (
                      <LinhaPreco
                        key={k}
                        rotulo={`${t.nome}${t.isRefundable === false ? " (não reembolsável)" : ""}`}
                        valor={fmtMoeda(t.amount, t.currency)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
            {subtotal ? (
              <div className="mt-1 border-t border-[color:var(--p-line)] pt-1">
                <LinhaPreco rotulo="Subtotal" valor={subtotal} forte />
              </div>
            ) : null}
          </div>
        );
      })}

      {taxasSoltas.length > 0 ? (
        <div className="mt-5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">
            Taxas da cotação
          </h4>
          <div className="mt-1">
            {taxasSoltas.map((t, k) => (
              <LinhaPreco
                key={k}
                rotulo={`${t.nome}${t.isRefundable === false ? " (não reembolsável)" : ""}`}
                valor={fmtMoeda(t.amount, t.currency)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {op.descontosDetalhados.length > 0 ? (
        <div className="mt-5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">
            {op.descontosDetalhados.some((d) => d.promocao) ? "Promoções e descontos" : "Descontos"}
          </h4>
          <div className="mt-1">
            {op.descontosDetalhados.map((d, i) => (
              <LinhaPreco
                key={i}
                rotulo={`${d.promocao ? "Promoção" : "Desconto"}: ${d.nome}`}
                detalhe={rotuloPrazo(d.validoAte, hojeISO).replace(/^ · /, "") || null}
                valor={`− ${fmtMoeda(d.amount, d.currency)}`}
                tom="desconto"
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Total. Se a opcao mistura moedas nao existe UM total: somar GBP com BRL
          daria um numero que nao e dinheiro nenhum. A emissao passou a barrar a
          mistura, mas cotacoes emitidas antes disso ainda abrem por aqui. */}
      {moedasDaOpcao.size > 1 ? (
        <div className="mt-5 border-t border-[color:var(--p-line)] pt-3">
          <p className="text-sm font-semibold text-[color:var(--p-ink)]">Total por moeda</p>
          {[...totalPorMoeda.entries()].map(([m, v]) => (
            <LinhaPreco key={m} rotulo={`Total em ${m}`} valor={fmtMoeda(v, m)} forte />
          ))}
          <p className="mt-1 text-[11px] text-[color:var(--p-muted)]">
            Os itens desta opção estão em moedas diferentes, por isso não há um valor único. Fale com
            seu consultor para consolidar.
          </p>
        </div>
      ) : (
        <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-[color:var(--p-line)] pt-3">
          <span className="titulo-portal text-base text-[color:var(--p-ink)]">Total</span>
          <span className="text-right">
            <span className="block titulo-portal text-xl tabular-nums text-[color:var(--p-ink)]">
              {totalConvertido ?? totalNaMoeda}
            </span>
            {totalConvertido ? (
              <span className="block text-xs tabular-nums text-[color:var(--p-muted)]">{totalNaMoeda}</span>
            ) : null}
          </span>
        </div>
      )}
      {op.depositAmount != null ? (
        <div className="mt-2">
          <LinhaPreco
            rotulo="Entrada"
            detalhe="valor a pagar para garantir a vaga"
            valor={fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}
            forte
          />
        </div>
      ) : null}

      {/* Plano de pagamento — linha do tempo, uma parcela por marco. */}
      {op.planoPagamento && op.planoPagamento.parcelas.length > 0 ? (
        <div className="mt-5 border-t border-[color:var(--p-line)] pt-4">
          <h4 className="titulo-portal text-base text-[color:var(--p-ink)]">
            Plano de pagamento{op.planoPagamento.method ? ` · ${op.planoPagamento.method.toUpperCase()}` : ""}
          </h4>
          <ol className="mt-3 border-l border-[color:var(--p-line)] pl-4">
            {op.planoPagamento.parcelas.map((p) => (
              <li key={p.sequence} className="relative pb-3 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[color:var(--p-muted)]"
                />
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm font-medium text-[color:var(--p-ink)]">
                    {p.description || `Parcela ${p.sequence}`}
                    <span className="block text-[11px] font-normal text-[color:var(--p-muted)]">{fmtData(p.dueDate)}</span>
                  </span>
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[color:var(--p-ink)]">
                    {fmtMoeda(p.amount, p.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {op.planoPagamento.notes ? (
            <p className="mt-2 text-[11px] text-[color:var(--p-muted)]">{op.planoPagamento.notes}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba ABOUT US — institucional da agencia + contato + consultor.
// ---------------------------------------------------------------------------
function AboutUs({ dados }: { dados: PublicQuote }) {
  const a = dados.aboutUs;
  const waDigits = (a.phone || "").replace(/\D/g, "");
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : null;
  const siteUrl = /^https?:\/\/[^\s]+$/i.test(a.website || "") ? a.website : null; // só http/https vira link
  const temContato = a.website || a.address || a.email;
  return (
    <section className="rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] p-5">
      <h2 className="titulo-portal text-xl text-[color:var(--p-ink)]">Sobre a {dados.brand}</h2>
      {a.html ? (
        <div
          className="mt-3 space-y-3 text-sm leading-relaxed text-[color:var(--p-ink)] [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: a.html }}
        />
      ) : (
        <p className="mt-3 text-sm text-[color:var(--p-muted)]">
          {dados.brand} acompanha você em cada etapa do seu intercâmbio.
        </p>
      )}

      {/* CTAs: falar com o Chat da Forio (chat) + WhatsApp */}
      {a.chatUrl || waUrl ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {a.chatUrl ? (
            <a
              href={a.chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-xl bg-[color:var(--p-cta)] px-5 py-3 text-sm font-medium text-[color:var(--p-cta-fg)]"
            >
              Falar com o Chat da Forio
            </a>
          ) : null}
          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-5 py-3 text-sm font-medium text-[color:var(--p-ink)]"
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}

      {dados.consultant ? (
        <div className="mt-5 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Seu consultor</p>
          <p className="mt-1 text-[color:var(--p-ink)]">{dados.consultant.nome ?? `Equipe ${dados.brand}`}</p>
          {dados.consultant.email ? (
            <a className="text-sm text-[color:var(--p-muted)] underline" href={`mailto:${dados.consultant.email}`}>
              {dados.consultant.email}
            </a>
          ) : null}
        </div>
      ) : null}

      {temContato ? (
        <dl className="mt-5 space-y-1 text-sm">
          {a.website ? (
            <div className="flex gap-2">
              <dt className="text-[color:var(--p-muted)]">Site</dt>
              <dd>
                {siteUrl ? (
                  <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-[color:var(--p-nav)] underline">{a.website}</a>
                ) : (
                  <span className="text-[color:var(--p-ink)]">{a.website}</span>
                )}
              </dd>
            </div>
          ) : null}
          {a.email ? (
            <div className="flex gap-2">
              <dt className="text-[color:var(--p-muted)]">E-mail</dt>
              <dd className="text-[color:var(--p-ink)]">{a.email}</dd>
            </div>
          ) : null}
          {a.address ? (
            <div className="flex gap-2">
              <dt className="text-[color:var(--p-muted)]">Endereço</dt>
              <dd className="text-[color:var(--p-ink)]">{a.address}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Aba NOTES — observacoes do consultor (HTML sanitizado no servidor).
// ---------------------------------------------------------------------------
const proseNotas =
  "space-y-3 text-sm leading-relaxed text-[color:var(--p-ink)] [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ul]:list-disc";

/**
 * Aba "Observações": a observação ORIGINAL (congelada na emissão, parte da
 * proposta enviada) e, abaixo, as atualizações publicadas depois — cada uma
 * datada, para o estudante ver o que mudou desde que recebeu o link.
 */
function Notes({
  html,
  notas,
}: {
  html: string | null;
  notas: PublicQuote["notas"];
}) {
  return (
    <section className="rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] p-5">
      <h2 className="titulo-portal text-xl text-[color:var(--p-ink)]">Observações</h2>

      {html ? <div className={`mt-3 ${proseNotas}`} dangerouslySetInnerHTML={{ __html: html }} /> : null}

      {notas.length > 0 ? (
        <div className={html ? "mt-5 border-t border-[color:var(--p-line)] pt-4" : "mt-3"}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">
            {notas.length === 1 ? "Atualização" : "Atualizações"}
          </h3>
          <ol className="mt-3 space-y-4">
            {notas.map((n) => (
              <li key={n.ref}>
                <p className="text-[11px] text-[color:var(--p-muted)]">{fmtDataHora(n.createdAt)}</p>
                <div
                  className={`mt-1 ${proseNotas}`}
                  dangerouslySetInnerHTML={{ __html: n.bodyHtml }}
                />
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function fmtDataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "";
  }
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
// titular recebe o codigo de acesso por e-mail.
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
    opcao.liquidoConvertido != null ? fmtMoeda(opcao.liquidoConvertido, fx.presentmentCurrency) : null;

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
        className="mt-4 min-h-[44px] w-full rounded-xl bg-[color:var(--p-cta)] px-5 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] disabled:opacity-50 sm:w-auto"
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
// enviado por e-mail.
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
        className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[color:var(--p-cta)] px-6 py-3 text-sm font-medium text-[color:var(--p-cta-fg)]"
      >
        Ir para a Área do Cliente
      </a>
      <p className="mt-6 text-[11px] text-[color:var(--p-muted)] opacity-70">{brand}</p>
    </div>
  );
}
