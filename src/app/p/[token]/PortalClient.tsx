"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuote } from "@/lib/quote-issue-service";

// Cliente do portal do estudante — apresentacao no formato Edvisor, em ABAS:
// Overview (opcoes lado a lado) · Option 1..N (detalhe de cada opcao: itens +
// Preco + plano de pagamento) · About Us (institucional da agencia) · Notes
// (observacoes do consultor). Registra comportamento (opened/option_viewed/
// downloaded/option_selected) e conduz a escolha em 2 etapas (irreversivel).
// NAO recalcula nada: os valores vieram congelados na emissao.
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

export default function PortalClient({ token, dados }: { token: string; dados: PublicQuote }) {
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
  const temNotes = !!dados.notesHtml;

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
            <button onClick={compartilhar} className="min-h-[40px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-3 py-2 text-sm text-[color:var(--p-ink)] hover:opacity-90">
              Compartilhar
            </button>
            <button onClick={imprimir} className="min-h-[40px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-3 py-2 text-sm text-[color:var(--p-ink)] hover:opacity-90">
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

      {/* Conteudo da aba */}
      <div className="mt-6">
        {aba === "overview" ? (
          <Overview
            dados={dados}
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
          <Notes html={dados.notesHtml!} />
        ) : (
          <DetalheOpcao
            token={token}
            op={dados.options[abaAtivaOpt!]}
            fx={fx}
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

      {/* Acoes globais */}
      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <button onClick={baixarPDF} className="min-h-[44px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-3 text-sm text-[color:var(--p-ink)] hover:opacity-90">
          Baixar PDF
        </button>
        <button onClick={compartilhar} className="min-h-[44px] rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-3 text-sm text-[color:var(--p-ink)] hover:opacity-90">
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
  selectedIndex,
  onVerDetalhes,
  onEscolher,
}: {
  dados: PublicQuote;
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
          fx.necessario && op.liquidoConvertido != null ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency) : null;
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
              {op.descontos > 0 ? (
                <li className="flex items-baseline justify-between gap-3 text-[color:var(--p-success)]">
                  <span>Descontos</span>
                  <span className="whitespace-nowrap">- {fmtMoeda(op.descontos, op.currency)}</span>
                </li>
              ) : null}
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
              {op.depositAmount != null ? (
                <p className="mt-1 text-right text-xs text-[color:var(--p-muted)]">
                  Entrada {fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)}
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              <button
                onClick={() => onVerDetalhes(op.index)}
                className="min-h-[44px] flex-1 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] px-4 py-2.5 text-sm text-[color:var(--p-ink)] hover:opacity-90"
              >
                Ver detalhes
              </button>
              {selectedIndex == null ? (
                <button
                  onClick={() => onEscolher(op.index)}
                  className="min-h-[44px] flex-1 rounded-xl bg-[color:var(--p-cta)] px-4 py-2.5 text-sm font-medium text-[color:var(--p-cta-fg)] hover:opacity-90"
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
function GaleriaMidia({ midias }: { midias: FichaItem["midias"] }) {
  if (midias.length === 0) return null;
  const imagens = midias.filter((m) => m.kind === "image");
  const outros = midias.filter((m) => m.kind !== "image");
  return (
    <div className="mt-3">
      {imagens.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {imagens.map((m, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={m.url}
              alt={m.caption ?? "Foto do programa"}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-28 w-full rounded-lg object-cover"
            />
          ))}
        </div>
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

// Disclosure com a ficha do produto (do snapshot). A descricao vem SANITIZADA do
// servidor; so ela usa dangerouslySetInnerHTML. Os bullets sao texto puro.
function FichaDetalhes({ ficha }: { ficha: FichaItem }) {
  const temAlgo =
    !!ficha.descriptionHtml ||
    ficha.highlights.length > 0 ||
    ficha.inclusions.length > 0 ||
    ficha.exclusions.length > 0 ||
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
          <dt className="text-[10px] uppercase tracking-wide text-[color:var(--p-muted)]">{l.rotulo}</dt>
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
              <ul className="mt-1 space-y-0.5 text-sm text-[color:var(--p-ink)]">
                {prog.timetable.map((t, i) => (
                  <li key={i}>
                    <span className="text-[color:var(--p-muted)]">{t.dia}: </span>
                    {t.blocos.join(" · ")}
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
function EscolaBloco({ escola }: { escola: EscolaItem }) {
  return (
    <div className="mt-5 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Sobre a escola</h3>
      <p className="mt-1 text-[color:var(--p-ink)]">
        {escola.nome ?? "Escola"}
        {escola.local ? <span className="text-[color:var(--p-muted)]"> · {escola.local}</span> : null}
      </p>
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

      <GaleriaMidia midias={escola.midias} />
    </div>
  );
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
  const totalNaMoeda = fmtMoeda(op.liquido, op.currency);
  const totalConvertido =
    fx.necessario && op.liquidoConvertido != null ? fmtMoeda(op.liquidoConvertido, fx.presentmentCurrency) : null;

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
                  <span className="whitespace-nowrap text-[color:var(--p-ink)]">{fmtMoeda(it.grossAmount, it.currency)}</span>
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
        return escolas.map((e, i) => <EscolaBloco key={i} escola={e} />);
      })()}

      {/* Preco */}
      <div className="mt-6 rounded-xl border border-[color:var(--p-line)] bg-[color:var(--p-page)] p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">Preço</h3>
        <dl className="mt-2 space-y-1 text-sm">
          <ResumoLinha rot="Subtotal" val={fmtMoeda(op.bruto, op.currency)} />
          {op.taxasDetalhadas.length > 0
            ? op.taxasDetalhadas.map((t, i) => (
                <ResumoLinha
                  key={i}
                  rot={`${t.nome}${t.isRefundable === false ? " (não reembolsável)" : ""}`}
                  val={fmtMoeda(t.amount, t.currency)}
                />
              ))
            : op.taxas > 0
            ? <ResumoLinha rot="Taxas" val={fmtMoeda(op.taxas, op.currency)} />
            : null}
          {op.descontos > 0 ? <ResumoLinha rot="Descontos" val={`- ${fmtMoeda(op.descontos, op.currency)}`} /> : null}
          <ResumoLinha rot="Total" val={totalNaMoeda} destaque />
          {totalConvertido ? <ResumoLinha rot={`Total em ${fx.presentmentCurrency}`} val={totalConvertido} /> : null}
          {op.depositAmount != null ? (
            <ResumoLinha rot="Entrada" val={fmtMoeda(op.depositAmount, op.depositCurrency ?? op.currency)} />
          ) : null}
        </dl>

        {/* Plano de pagamento */}
        {op.planoPagamento && op.planoPagamento.parcelas.length > 0 ? (
          <div className="mt-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--p-muted)]">
              Plano de pagamento{op.planoPagamento.method ? ` · ${op.planoPagamento.method.toUpperCase()}` : ""}
            </h4>
            <ul className="mt-2 space-y-1 text-sm">
              {op.planoPagamento.parcelas.map((p) => (
                <li key={p.sequence} className="flex items-baseline justify-between gap-3">
                  <span className="text-[color:var(--p-muted)]">
                    {p.description || `Parcela ${p.sequence}`} · {fmtData(p.dueDate)}
                  </span>
                  <span className="whitespace-nowrap text-[color:var(--p-ink)]">{fmtMoeda(p.amount, p.currency)}</span>
                </li>
              ))}
            </ul>
            {op.planoPagamento.notes ? (
              <p className="mt-2 text-[11px] text-[color:var(--p-muted)]">{op.planoPagamento.notes}</p>
            ) : null}
          </div>
        ) : null}
      </div>

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
            className="min-h-[44px] w-full rounded-xl bg-[color:var(--p-cta)] px-5 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] hover:opacity-90 sm:w-auto"
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
// Aba ABOUT US — institucional da agencia + contato + consultor.
// ---------------------------------------------------------------------------
function AboutUs({ dados }: { dados: PublicQuote }) {
  const a = dados.aboutUs;
  const temContato = a.website || a.address || a.email || a.phone;
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
              <dd className="text-[color:var(--p-ink)]">{a.website}</dd>
            </div>
          ) : null}
          {a.email ? (
            <div className="flex gap-2">
              <dt className="text-[color:var(--p-muted)]">E-mail</dt>
              <dd className="text-[color:var(--p-ink)]">{a.email}</dd>
            </div>
          ) : null}
          {a.phone ? (
            <div className="flex gap-2">
              <dt className="text-[color:var(--p-muted)]">Telefone</dt>
              <dd className="text-[color:var(--p-ink)]">{a.phone}</dd>
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
function Notes({ html }: { html: string }) {
  return (
    <section className="rounded-2xl border border-[color:var(--p-line)] bg-[color:var(--p-surface)] p-5">
      <h2 className="titulo-portal text-xl text-[color:var(--p-ink)]">Observações</h2>
      <div
        className="mt-3 space-y-3 text-sm leading-relaxed text-[color:var(--p-ink)] [&_a]:underline [&_li]:ml-4 [&_li]:list-disc [&_ol]:list-decimal [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
    fx.necessario && opcao.liquidoConvertido != null ? fmtMoeda(opcao.liquidoConvertido, fx.presentmentCurrency) : null;

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
        className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-[color:var(--p-cta)] px-6 py-3 text-sm font-medium text-[color:var(--p-cta-fg)] hover:opacity-90"
      >
        Ir para a Área do Cliente
      </a>
      <p className="mt-6 text-[11px] text-[color:var(--p-muted)] opacity-70">{brand}</p>
    </div>
  );
}
