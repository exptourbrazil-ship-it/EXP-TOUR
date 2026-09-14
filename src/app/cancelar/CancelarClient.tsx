"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Cabecalho from "@/components/Cabecalho";
import BottomNav from "@/components/BottomNav";
import SuporteRodape from "@/components/SuporteRodape";
import { fmtBRL, fmtMoeda } from "@/lib/formato";
import {
  MOTIVOS_CANCELAMENTO,
  confirmacaoValorConfere,
  type MotivoCancelamento,
} from "@/lib/cancelamento-self";
import type { ConsequenciasCancelamento } from "@/lib/cancelamento-self-service";

type LinhaMemoria = { rotulo: string; valor: number; tipo: "moeda" | "moeda_brl" | "pct" | "num" | "info" };

// Passos do wizard (spec 1 §3 "Cancelamento deliberado — 6 passos"). O cliente
// escolhe o motivo, VÊ alternativas antes de decidir, VÊ as consequências (o que
// perde) e confirma NOMEANDO o valor retido. Nada de dinheiro/estado muda pela
// tela — o envio registra a solicitação + abre o E4 (equipe conduz o acerto).
type Passo = "motivo" | "alternativas" | "consequencias" | "confirmacao" | "enviado";

export default function CancelarClient({
  contratoId,
  nomeExibicao,
  inicial,
}: {
  contratoId: string;
  nomeExibicao: string | null;
  inicial: ConsequenciasCancelamento;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>("motivo");
  const [motivo, setMotivo] = useState<MotivoCancelamento | "">("");
  const [detalhe, setDetalhe] = useState("");
  const [valorDigitado, setValorDigitado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const moeda = inicial.moedaPrograma || "BRL";
  const memoria = (Array.isArray(inicial.memoria) ? inicial.memoria : []) as LinhaMemoria[];

  // Estados especiais: dentro dos 7 dias o caminho certo é o ARREPENDIMENTO
  // (devolução integral), não o cancelamento com retenção.
  const emArrependimento = inicial.arrependimento;
  const jaCancelado = inicial.jaCancelado;
  const semCalculo = !inicial.calculoDisponivel;

  function fmtLinha(l: LinhaMemoria): string {
    if (l.tipo === "moeda_brl") return fmtBRL(l.valor);
    if (l.tipo === "moeda") return fmtMoeda(l.valor, moeda);
    if (l.tipo === "pct") return `${(l.valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    if (l.tipo === "num") return l.valor.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
    return "";
  }

  // Confere localmente (mesma tolerância do servidor) só para habilitar o botão;
  // a decisão final é SEMPRE do servidor, que recalcula o retido.
  const valorConfere = confirmacaoValorConfere(valorDigitado, inicial.valorRetidoBRL);

  async function enviar() {
    setErro(null);
    setEnviando(true);
    try {
      const resp = await fetch("/api/cliente/cancelamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contratoId,
          motivo,
          motivoDetalhe: detalhe.trim() ? detalhe.trim() : null,
          valorCiente: valorDigitado,
        }),
      });
      const r = await resp.json();
      if (r.ok) {
        setPasso("enviado");
      } else if (r.codigo === "arrependimento") {
        setErro("Você ainda está no prazo de arrependimento (7 dias). Use a devolução integral — fale com a nossa equipe.");
      } else if (r.codigo === "valor") {
        setErro("O valor digitado não confere com o valor retido. Confira e tente de novo.");
      } else if (r.codigo === "ja_cancelado") {
        setErro("Este contrato já está cancelado.");
      } else {
        setErro(r.error || "Não foi possível registrar a solicitação agora. Tente novamente em instantes.");
      }
    } catch {
      setErro("Não foi possível registrar a solicitação agora. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  const passos: { chave: Passo; rotulo: string }[] = [
    { chave: "motivo", rotulo: "Motivo" },
    { chave: "alternativas", rotulo: "Alternativas" },
    { chave: "consequencias", rotulo: "Consequências" },
    { chave: "confirmacao", rotulo: "Confirmação" },
  ];
  const idxAtual = passos.findIndex((p) => p.chave === passo);

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28 lg:pb-10 lg:pl-60">
      <Cabecalho nome={nomeExibicao} subtitulo="Cancelamento" />

      <main className="mx-auto w-full max-w-md px-5 py-2 md:max-w-2xl md:px-8 lg:max-w-3xl">
        <h1 className="font-serif text-4xl text-brand md:text-5xl">Cancelar o programa</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Programa: <span className="font-medium text-brand">{inicial.programaNome}</span>. Antes de cancelar, veja as
          opções e o que o cancelamento implica. Esta tela não cancela nada sozinha — ela registra o seu pedido para a
          nossa equipe conduzir com você.
        </p>

        {/* Trilho de passos (some no estado enviado) */}
        {passo !== "enviado" && !jaCancelado ? (
          <ol className="mt-5 flex items-center gap-1 text-[11px] font-medium">
            {passos.map((p, i) => {
              const feito = i < idxAtual;
              const atual = i === idxAtual;
              return (
                <li key={p.chave} className="flex flex-1 items-center gap-1">
                  <span
                    className={
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] " +
                      (atual
                        ? "bg-brand text-brand-cream"
                        : feito
                          ? "bg-brand-gold/20 text-brand-golddark"
                          : "bg-neutral-200 text-neutral-500")
                    }
                  >
                    {i + 1}
                  </span>
                  <span className={"hidden sm:inline " + (atual ? "text-brand" : "text-neutral-500")}>{p.rotulo}</span>
                  {i < passos.length - 1 ? <span className="h-px flex-1 bg-neutral-200" /> : null}
                </li>
              );
            })}
          </ol>
        ) : null}

        {/* Caso já cancelado */}
        {jaCancelado ? (
          <section className="mt-5 rounded-2xl border border-brand/15 bg-white p-5 shadow-sm">
            <h2 className="font-serif text-lg text-brand">Este programa já está cancelado</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Não há nada a fazer aqui. Se precisar de informações sobre o acerto, fale com a nossa equipe.
            </p>
            <button
              onClick={() => router.push("/inicio")}
              className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream"
            >
              Voltar ao início
            </button>
          </section>
        ) : emArrependimento ? (
          // Dentro dos 7 dias: caminho é o arrependimento (devolução integral).
          <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <h2 className="font-serif text-lg text-emerald-900">Você ainda está no prazo de arrependimento</h2>
            <p className="mt-2 text-sm text-emerald-800">
              Nos primeiros 7 dias após a contratação você tem direito à <strong>devolução integral</strong> (art. 49 do
              Código de Defesa do Consumidor) — sem a retenção do cancelamento comum. Fale com a nossa equipe para
              conduzir a devolução.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => router.push("/inicio")}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
              >
                Voltar ao início
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* PASSO 1 — Motivo */}
            {passo === "motivo" ? (
              <section className="mt-5 rounded-2xl border border-brand/15 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-lg text-brand">Por que você quer cancelar?</h2>
                <p className="mt-1 text-sm text-neutral-600">Isso nos ajuda a entender e, quando possível, oferecer uma saída melhor.</p>
                <div className="mt-4 space-y-2">
                  {MOTIVOS_CANCELAMENTO.map((m) => (
                    <label
                      key={m.valor}
                      className={
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition " +
                        (motivo === m.valor ? "border-brand bg-brand-cream/60 text-brand" : "border-neutral-200 text-neutral-700 hover:bg-neutral-50")
                      }
                    >
                      <input
                        type="radio"
                        name="motivo"
                        value={m.valor}
                        checked={motivo === m.valor}
                        onChange={() => setMotivo(m.valor)}
                        className="accent-brand"
                      />
                      <span>{m.rotulo}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={detalhe}
                  onChange={(e) => setDetalhe(e.target.value.slice(0, 2000))}
                  placeholder="Quer contar mais? (opcional)"
                  rows={3}
                  className="mt-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setPasso("alternativas")}
                    disabled={!motivo}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-50"
                  >
                    Continuar
                  </button>
                </div>
              </section>
            ) : null}

            {/* PASSO 2 — Alternativas */}
            {passo === "alternativas" ? (
              <section className="mt-5 rounded-2xl border border-brand/15 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-lg text-brand">Antes de cancelar, veja estas opções</h2>
                <p className="mt-1 text-sm text-neutral-600">Muitas vezes há uma saída melhor do que perder o que já foi pago.</p>
                <div className="mt-4 space-y-3">
                  {inicial.alternativas.map((a) => (
                    <div key={a.chave} className="rounded-xl border border-brand-gold/30 bg-brand-cream/30 p-4">
                      <h3 className="text-sm font-semibold text-brand">{a.titulo}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{a.descricao}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => setPasso("motivo")}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-600"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => setPasso("consequencias")}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Ainda quero cancelar
                  </button>
                </div>
              </section>
            ) : null}

            {/* PASSO 3 — Consequências */}
            {passo === "consequencias" ? (
              <section className="mt-5 rounded-2xl border border-brand/15 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-lg text-brand">O que o cancelamento implica</h2>
                {semCalculo ? (
                  <p className="mt-2 text-sm text-amber-700">
                    Não conseguimos calcular os valores agora. Para cancelar com segurança, fale com a nossa equipe — ela
                    vai apresentar o acerto correto.
                  </p>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-amber-50 p-4">
                        <p className="text-xs text-amber-700">Valor retido (o que você perde)</p>
                        <p className="mt-1 font-serif text-2xl text-amber-900">{fmtBRL(inicial.valorRetidoBRL)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 p-4">
                        <p className="text-xs text-emerald-700">Estimativa de devolução</p>
                        <p className="mt-1 font-serif text-2xl text-emerald-900">{fmtBRL(inicial.reembolsoEstimadoBRL)}</p>
                      </div>
                    </div>
                    {memoria.length > 0 ? (
                      <div className="mt-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Como chegamos nesses números</p>
                        <ul className="mt-2 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                          {memoria.map((l, i) => (
                            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                              <span className={l.tipo === "info" ? "text-amber-700" : "text-neutral-600"}>{l.rotulo}</span>
                              {l.tipo !== "info" ? <span className="font-medium text-neutral-800">{fmtLinha(l)}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="mt-3 text-xs text-neutral-500">
                      Estes são valores estimados. O acerto final é conferido pela nossa equipe antes de qualquer
                      devolução.
                    </p>
                  </>
                )}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => setPasso("alternativas")}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-600"
                  >
                    Voltar
                  </button>
                  {semCalculo ? (
                    <button
                      onClick={() => router.push("/inicio")}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream"
                    >
                      Falar com a equipe
                    </button>
                  ) : (
                    <button
                      onClick={() => setPasso("confirmacao")}
                      className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      Entendi, quero cancelar
                    </button>
                  )}
                </div>
              </section>
            ) : null}

            {/* PASSO 4 — Confirmação por valor */}
            {passo === "confirmacao" ? (
              <section className="mt-5 rounded-2xl border border-brand/15 bg-white p-5 shadow-sm">
                <h2 className="font-serif text-lg text-brand">Confirme digitando o valor retido</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Para confirmar de forma consciente, digite o valor que ficará retido:{" "}
                  <span className="font-semibold text-amber-900">{fmtBRL(inicial.valorRetidoBRL)}</span>.
                </p>
                <input
                  inputMode="decimal"
                  value={valorDigitado}
                  onChange={(e) => setValorDigitado(e.target.value)}
                  placeholder="Ex.: 1.200,00"
                  className="mt-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
                {erro ? <p className="mt-3 text-sm text-amber-700">{erro}</p> : null}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    onClick={() => setPasso("consequencias")}
                    disabled={enviando}
                    className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-600 disabled:opacity-50"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={enviar}
                    disabled={enviando || !valorConfere}
                    className="rounded-xl bg-brand px-5 py-2 text-sm font-medium text-brand-cream disabled:opacity-50"
                  >
                    {enviando ? "Registrando..." : "Confirmar cancelamento"}
                  </button>
                </div>
              </section>
            ) : null}

            {/* PASSO 5 — Enviado */}
            {passo === "enviado" ? (
              <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <h2 className="font-serif text-lg text-emerald-900">Solicitação registrada</h2>
                <p className="mt-2 text-sm text-emerald-800">
                  Recebemos o seu pedido de cancelamento. Enquanto conduzimos o acerto, as cobranças ficam suspensas.
                  Nossa equipe vai falar com você para concluir a devolução — nada é cobrado ou devolvido
                  automaticamente por aqui.
                </p>
                <button
                  onClick={() => router.push("/inicio")}
                  className="mt-4 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
                >
                  Voltar ao início
                </button>
              </section>
            ) : null}
          </>
        )}

        <SuporteRodape contexto="Ficou em dúvida sobre o cancelamento? Fale com a gente antes de decidir." />
      </main>

      <BottomNav />
    </div>
  );
}
