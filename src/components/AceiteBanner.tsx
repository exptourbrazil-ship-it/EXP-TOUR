"use client";

import { useEffect, useState } from "react";
import { fmtData } from "@/lib/formato";

// Banner do Termo de Adesão nas telas do cliente (montado no Cabecalho).
// Dois estados:
//  1. PENDENTE  -> faixa "Termo pendente" + modal com o texto completo; o
//     aceite só habilita após marcar "Li e aceito" (CDC art. 46).
//  2. ACEITO e dentro dos 7 dias -> faixa informando o direito de
//     arrependimento (CDC art. 49) com a opção de exercê-lo.
// Sem termo vigente / fora do prazo / já arrependido / sem sessão -> nada.
type Dados = {
  termo: { id: string; versao: string; conteudo: string | null; storage_path: string | null } | null;
  jaAceito: boolean;
  aceiteEm: string | null;
  arrependido: boolean;
  arrependimentoAte: string | null;
  podeArrepender: boolean;
};

export default function AceiteBanner() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmarArr, setConfirmarArr] = useState(false);
  const [arrependendo, setArrependendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch("/api/aceite", { cache: "no-store" });
        if (!res.ok) return; // 401 (sem sessão) etc.
        const json = await res.json();
        if (ativo && json.ok && json.termo) setDados(json);
      } catch {
        /* silencioso */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function aceitar() {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/aceite", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setAberto(false);
        setDados((d) =>
          d
            ? {
                ...d,
                jaAceito: true,
                aceiteEm: json.aceiteEm ?? null,
                arrependimentoAte: json.arrependimentoAte ?? null,
                podeArrepender: true,
                arrependido: false,
              }
            : d
        );
      } else {
        setErro(json.error || "Não foi possível registrar o aceite.");
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setEnviando(false);
    }
  }

  async function arrepender() {
    setArrependendo(true);
    setErro(null);
    try {
      const res = await fetch("/api/aceite/arrependimento", { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) {
        setConfirmarArr(false);
        setDados((d) => (d ? { ...d, podeArrepender: false, arrependido: true } : d));
      } else {
        setErro(json.error || "Não foi possível registrar o arrependimento.");
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setArrependendo(false);
    }
  }

  if (!dados || !dados.termo) return null;
  const termo = dados.termo;
  const pendente = !dados.jaAceito;
  const janelaArr = dados.jaAceito && dados.podeArrepender;
  if (!pendente && !janelaArr) return null;

  return (
    <>
      {pendente ? (
        <div className="bg-brand-gold/95 text-brand">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-2.5 md:px-8">
            <p className="text-sm font-medium">Você tem um Termo de Adesão pendente de aceite.</p>
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="flex-shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-cream transition hover:opacity-90"
            >
              Ler e aceitar
            </button>
          </div>
        </div>
      ) : (
        <div className="border-b border-neutral-200 bg-brand-cream/70 text-brand">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-2 md:px-8">
            <p className="text-xs">
              Termo de Adesão aceito
              {dados.aceiteEm ? ` em ${fmtData(dados.aceiteEm)}` : ""}. Você pode se arrepender
              {dados.arrependimentoAte ? ` até ${fmtData(dados.arrependimentoAte)}` : " em 7 dias"} (CDC art. 49).
            </p>
            <button
              type="button"
              onClick={() => setConfirmarArr(true)}
              className="flex-shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-white"
            >
              Exercer arrependimento
            </button>
          </div>
        </div>
      )}

      {/* Modal de leitura + aceite */}
      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h2 className="font-serif text-xl text-brand">Termo de Adesão</h2>
              <p className="text-xs text-neutral-500">Versão {termo.versao}</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {termo.conteudo ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{termo.conteudo}</div>
              ) : (
                <p className="text-sm text-neutral-600">Termo indisponível.</p>
              )}
            </div>
            <div className="border-t border-neutral-200 px-5 py-4">
              <p className="mb-2 rounded-lg bg-brand-cream/60 px-3 py-2 text-xs text-brand">
                Após aceitar, você tem <strong>7 dias</strong> para se arrepender (CDC art. 49), pela
                própria Área do Cliente.
              </p>
              {erro ? <p className="mb-2 text-sm text-red-700">{erro}</p> : null}
              <label className="flex items-start gap-2 text-sm text-brand">
                <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-0.5" />
                <span>Li e aceito o Termo de Adesão (versão {termo.versao}).</span>
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setAberto(false)} className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60">
                  Fechar
                </button>
                <button type="button" onClick={aceitar} disabled={!marcado || enviando} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-cream transition hover:opacity-90 disabled:opacity-50">
                  {enviando ? "Registrando..." : "Aceitar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirmação de arrependimento */}
      {confirmarArr ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="font-serif text-xl text-brand">Exercer arrependimento</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Isto registra a sua desistência do Termo de Adesão dentro do prazo de 7 dias. Nossa
              equipe será avisada para tratar o contrato e a cobrança. Deseja continuar?
            </p>
            {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmarArr(false)} className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60">
                Cancelar
              </button>
              <button type="button" onClick={arrepender} disabled={arrependendo} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
                {arrependendo ? "Registrando..." : "Confirmar arrependimento"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
