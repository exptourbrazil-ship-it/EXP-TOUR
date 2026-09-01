"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Cabecalho from "@/components/Cabecalho";
import BottomNav from "@/components/BottomNav";
import SuporteRodape from "@/components/SuporteRodape";
import type { TipoConsentimento, EstadoConsentimento } from "@/lib/consentimento";

export default function PrivacidadeClient({
  nomeExibicao,
  catalogo,
  estado,
  politicaUrl,
}: {
  nomeExibicao: string | null;
  catalogo: TipoConsentimento[];
  estado: EstadoConsentimento[];
  politicaUrl: string | null;
}) {
  const router = useRouter();
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const estadoPorTipo = new Map(estado.map((e) => [e.tipo, e]));

  async function alternar(tipo: string, concedido: boolean) {
    setErro(null);
    setAviso(null);
    setProcessando(tipo);
    try {
      const resp = await fetch("/api/consentimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, concedido }),
      });
      const r = await resp.json();
      if (r.ok) {
        setAviso(concedido ? "Consentimento registrado." : "Consentimento revogado.");
        router.refresh();
      } else {
        setErro("Não foi possível registrar sua escolha. Tente novamente.");
      }
    } catch {
      setErro("Não foi possível registrar sua escolha. Tente novamente.");
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream/40 pb-28 lg:pb-10 lg:pl-60">
      <Cabecalho nome={nomeExibicao} subtitulo="Privacidade" />

      <main className="mx-auto w-full max-w-md px-5 py-2 md:max-w-2xl md:px-8 lg:max-w-5xl">
        <h1 className="font-serif text-4xl text-brand md:text-5xl">Privacidade e consentimentos</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Você decide como seus dados são usados. Cada autorização é específica e pode ser concedida ou revogada a
          qualquer momento. O uso de imagem é opcional e não é condição para a contratação.
        </p>
        {politicaUrl ? (
          <p className="mt-1 text-sm text-neutral-600">
            Leia a{" "}
            <a href={politicaUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-golddark underline">
              Política de Privacidade
            </a>
            .
          </p>
        ) : null}

        {aviso ? <p className="mt-3 text-sm text-emerald-700">{aviso}</p> : null}
        {erro ? <p className="mt-3 text-sm text-amber-700">{erro}</p> : null}

        <div className="mt-5 space-y-3">
          {catalogo.map((t) => {
            const est = estadoPorTipo.get(t.chave);
            const vigente = !!est?.vigente;
            const concedidoVersaoAntiga = !!est?.concedido && !vigente;
            return (
              <section key={t.chave} className="rounded-2xl border border-brand/15 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-lg text-brand">
                      {t.rotulo}
                      {t.sensivel ? <span className="ml-2 align-middle rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">dado sensível</span> : null}
                      {t.facultativo ? <span className="ml-2 align-middle rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">opcional</span> : null}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-600">{t.descricao}</p>
                    <p className="mt-2 text-xs">
                      {vigente ? (
                        <span className="text-emerald-700">Autorizado{est?.em ? ` em ${new Date(est.em).toLocaleDateString("pt-BR")}` : ""}</span>
                      ) : concedidoVersaoAntiga ? (
                        <span className="text-amber-700">O texto foi atualizado — confirme novamente.</span>
                      ) : (
                        <span className="text-neutral-400">Não autorizado</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {vigente ? (
                    <button
                      onClick={() => alternar(t.chave, false)}
                      disabled={processando === t.chave}
                      className="rounded-xl border border-neutral-300 px-4 py-2 text-sm text-neutral-600 disabled:opacity-50"
                    >
                      {processando === t.chave ? "..." : "Revogar"}
                    </button>
                  ) : (
                    <button
                      onClick={() => alternar(t.chave, true)}
                      disabled={processando === t.chave}
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-50"
                    >
                      {processando === t.chave ? "..." : concedidoVersaoAntiga ? "Confirmar novamente" : "Autorizar"}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <SuporteRodape contexto="Dúvidas sobre o uso dos seus dados? Fale com a gente." />
      </main>

      <BottomNav />
    </div>
  );
}
