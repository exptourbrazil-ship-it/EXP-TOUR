"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FICHA_TEXTO, type PapelSignatario } from "@/lib/ficha-matricula";
import type { FichaEstado } from "@/lib/ficha-matricula-service";

type Lang = "pt" | "en";

const UI = {
  voltar: { pt: "← Voltar aos documentos", en: "← Back to documents" },
  aposEntrada: {
    pt: "A ficha de matrícula fica disponível após o pagamento da Entrada.",
    en: "The enrollment form becomes available after the deposit is paid.",
  },
  assinada: { pt: "Ficha de matrícula assinada.", en: "Enrollment form signed." },
  piAtivo: {
    pt: "Processamento imediato autorizado.",
    en: "Immediate processing authorized.",
  },
  piInativo: {
    pt: "Sem autorização de processamento imediato (a remessa aguarda o prazo de arrependimento).",
    en: "No immediate-processing authorization (remittance waits for the withdrawal period).",
  },
  assinarComo: { pt: "Assinar como", en: "Sign as" },
  nome: { pt: "Nome de quem assina", en: "Signer's name" },
  assinar: { pt: "Assinar", en: "Sign" },
  assinando: { pt: "Assinando…", en: "Signing…" },
  faltaResponsavel: {
    pt: "Falta a assinatura do responsável para concluir.",
    en: "The guardian's signature is still required to complete.",
  },
  faltaParticipante: {
    pt: "Falta a assinatura do participante para concluir.",
    en: "The participant's signature is still required to complete.",
  },
  erro: { pt: "Não foi possível assinar. Tente novamente.", en: "Could not sign. Please try again." },
  participante: { pt: "Participante", en: "Participant" },
  programa: { pt: "Programa", en: "Program" },
} as const;

export default function FichaClient({ estado, contratoId }: { estado: FichaEstado; contratoId: string }) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("pt");
  const [papel, setPapel] = useState<PapelSignatario>(estado.papeisPendentes[0] ?? "participante");
  const [nome, setNome] = useState("");
  const [pi, setPi] = useState(false); // NAO pre-marcado (nota 339)
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const t = <T extends { pt: string; en: string }>(x: T) => x[lang];

  async function assinar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/ficha/${contratoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papel, nome: nome.trim() || null, processamentoImediato: pi }),
      });
      const j = await r.json();
      if (j.ok) router.refresh();
      else setErro(j.error || t(UI.erro));
    } catch {
      setErro(t(UI.erro));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-6">
      <div className="mx-auto w-full max-w-2xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <a href="/documentos" className="text-sm text-neutral-500 hover:text-neutral-800">
            {t(UI.voltar)}
          </a>
          <div className="inline-flex overflow-hidden rounded-full border border-neutral-300 text-xs">
            {(["pt", "en"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1 font-medium ${lang === l ? "bg-brand text-brand-cream" : "text-neutral-600"}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <article className="rounded-2xl bg-white p-8 shadow-sm">
          <header className="border-b border-neutral-200 pb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-gold">EXP Tour</p>
            <h1 className="mt-1 font-serif text-3xl text-brand">{t(FICHA_TEXTO.titulo)}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              {t(UI.programa)}: <span className="font-medium text-neutral-900">{estado.programaNome}</span>
              {estado.estudanteNome ? ` · ${t(UI.participante)}: ${estado.estudanteNome}` : ""}
            </p>
          </header>

          <p className="mt-4 text-sm leading-relaxed text-neutral-800">{t(FICHA_TEXTO.intro)}</p>

          {/* Gate: apos a Entrada */}
          {!estado.entradaPaga ? (
            <p className="mt-5 rounded-lg border border-brand-gold/40 bg-brand-gold/5 p-3 text-sm text-neutral-700">
              {t(UI.aposEntrada)}
            </p>
          ) : estado.status === "assinada" ? (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-800">✓ {t(UI.assinada)}</p>
              <p className="mt-1 text-xs text-neutral-600">
                {estado.processamentoImediato ? t(UI.piAtivo) : t(UI.piInativo)}
              </p>
            </div>
          ) : (
            <>
              {/* Assinatura pendente */}
              {estado.papeisPendentes.length > 1 && (
                <label className="mt-5 block text-sm">
                  <span className="text-neutral-600">{t(UI.assinarComo)}</span>
                  <select
                    value={papel}
                    onChange={(e) => setPapel(e.target.value as PapelSignatario)}
                    className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
                  >
                    {estado.papeisPendentes.map((p) => (
                      <option key={p} value={p}>
                        {t(FICHA_TEXTO.papel[p])}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {estado.papeisPendentes.length === 1 && (
                <p className="mt-5 text-sm text-neutral-700">
                  {t(UI.assinarComo)}: <strong>{t(FICHA_TEXTO.papel[estado.papeisPendentes[0]])}</strong>
                </p>
              )}

              <label className="mt-3 block text-sm">
                <span className="text-neutral-600">{t(UI.nome)}</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={200}
                  className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
                />
              </label>

              {/* Processamento imediato — NAO pre-marcado */}
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-neutral-200 p-3 text-sm">
                <input type="checkbox" checked={pi} onChange={(e) => setPi(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="text-neutral-800">{t(FICHA_TEXTO.processamentoImediato.rotulo)}</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    {t(FICHA_TEXTO.processamentoImediato.ajuda)}
                  </span>
                </span>
              </label>

              {estado.papeisAssinados.length > 0 && estado.papeisPendentes.includes("responsavel") && (
                <p className="mt-3 text-xs text-brand-golddark">{t(UI.faltaResponsavel)}</p>
              )}
              {estado.papeisAssinados.length > 0 && estado.papeisPendentes.includes("participante") && (
                <p className="mt-3 text-xs text-brand-golddark">{t(UI.faltaParticipante)}</p>
              )}

              <button
                onClick={assinar}
                disabled={enviando}
                className="mt-4 rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-brand-cream shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {enviando ? t(UI.assinando) : t(UI.assinar)}
              </button>
              {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
            </>
          )}
        </article>
      </div>
    </div>
  );
}
