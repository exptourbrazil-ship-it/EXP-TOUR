"use client";

import { useEffect, useState } from "react";

// Banner de Termo de Adesão pendente. Aparece em todas as telas do cliente
// (montado no Cabecalho) enquanto o titular não aceitou a versão VIGENTE do
// termo. Abre um modal com o TEXTO COMPLETO; o aceite só habilita depois de o
// cliente marcar "Li e aceito" (CDC art. 46). Some após aceitar. Se não houver
// termo vigente, ou já aceito, ou sem sessão de cliente, não renderiza nada.
type Termo = { id: string; versao: string; conteudo: string | null; storage_path: string | null };

export default function AceiteBanner() {
  const [termo, setTermo] = useState<Termo | null>(null);
  const [pendente, setPendente] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch("/api/aceite", { cache: "no-store" });
        if (!res.ok) return; // 401 (sem sessão) etc. — não mostra nada
        const json = await res.json();
        if (!ativo) return;
        if (json.ok && json.termo && !json.jaAceito) {
          setTermo(json.termo);
          setPendente(true);
        }
      } catch {
        /* silencioso: banner é acessório */
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
        setPendente(false);
        setAberto(false);
      } else {
        setErro(json.error || "Não foi possível registrar o aceite.");
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setEnviando(false);
    }
  }

  if (!pendente || !termo) return null;

  return (
    <>
      {/* Faixa de aviso */}
      <div className="bg-brand-gold/95 text-brand">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-2.5 md:px-8">
          <p className="text-sm font-medium">
            Você tem um Termo de Adesão pendente de aceite.
          </p>
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex-shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-cream transition hover:opacity-90"
          >
            Ler e aceitar
          </button>
        </div>
      </div>

      {/* Modal com o texto completo */}
      {aberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            <div className="border-b border-neutral-200 px-5 py-4">
              <h2 className="font-serif text-xl text-brand">Termo de Adesão</h2>
              <p className="text-xs text-neutral-500">Versão {termo.versao}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {termo.conteudo ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                  {termo.conteudo}
                </div>
              ) : termo.storage_path ? (
                <p className="text-sm text-neutral-600">
                  O texto deste termo está disponível como documento no seu cofre.
                </p>
              ) : (
                <p className="text-sm text-neutral-600">Termo indisponível.</p>
              )}
            </div>

            <div className="border-t border-neutral-200 px-5 py-4">
              {erro ? <p className="mb-2 text-sm text-red-700">{erro}</p> : null}
              <label className="flex items-start gap-2 text-sm text-brand">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(e) => setMarcado(e.target.checked)}
                  className="mt-0.5"
                />
                <span>Li e aceito o Termo de Adesão (versão {termo.versao}).</span>
              </label>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAberto(false)}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={aceitar}
                  disabled={!marcado || enviando}
                  className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-cream transition hover:opacity-90 disabled:opacity-50"
                >
                  {enviando ? "Registrando..." : "Aceitar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
