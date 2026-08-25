"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Card da Area do Cliente: proposta de ACERTO aguardando aceite eletronico
// (Fatia B). Mostra a memoria de calculo, o valor a devolver e o texto do termo;
// o cliente aceita com um clique. O aceite (prova: hash/ip/ua) e registrado no
// servidor, que revalida posse e estado. NAO move dinheiro.

type Proposta = {
  id: string;
  moeda: string | null;
  saldoDevolverCliente: number | null;
  memoria: { rotulo: string; valor: number; tipo: string }[] | null;
  termoConteudo: string | null;
};

function fmtMoeda(valor: number, moeda: string): string {
  const n = (Number(valor) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const cod = (moeda || "").toUpperCase();
  return `${cod === "BRL" || cod === "" ? "R$" : cod} ${n}`;
}

export default function AcertoPropostaClient({ proposta }: { proposta: Proposta }) {
  const router = useRouter();
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aceito, setAceito] = useState(false);
  const [verTermo, setVerTermo] = useState(false);
  const moeda = proposta.moeda || "BRL";

  async function aceitar() {
    setErro(null);
    setAceitando(true);
    try {
      const res = await fetch("/api/acerto/aceitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acertoId: proposta.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Não foi possível registrar o aceite.");
        return;
      }
      setAceito(true);
      router.refresh();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setAceitando(false);
    }
  }

  return (
    <div className="mx-auto mb-6 max-w-3xl rounded-2xl border border-[#c9a35e]/40 bg-[#fdf8ef] p-5">
      <h2 className="mb-1 font-serif text-xl text-[#042f1b]">Proposta de acerto</h2>
      <p className="mb-3 text-sm text-[#042f1b]/80">
        Preparamos o acerto do seu programa. Revise os valores abaixo e, se estiver de acordo,
        confirme o aceite. O reembolso é processado após a confirmação — nada é debitado de você aqui.
      </p>

      {proposta.memoria && proposta.memoria.length > 0 ? (
        <table className="w-full text-sm">
          <tbody>
            {proposta.memoria.map((l, i) => (
              <tr key={i} className="border-b border-[#c9a35e]/20 last:border-0">
                <td className="py-1 text-[#042f1b]/70">{l.rotulo}</td>
                <td
                  className={
                    "py-1 text-right font-medium " +
                    (l.tipo === "credito"
                      ? "text-emerald-700"
                      : l.tipo === "debito"
                      ? "text-amber-700"
                      : "text-[#042f1b]")
                  }
                >
                  {fmtMoeda(Number(l.valor), moeda)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm text-[#042f1b]/80">Valor a devolver a você</span>
        <span className="text-lg font-semibold text-emerald-700">
          {fmtMoeda(Number(proposta.saldoDevolverCliente || 0), moeda)}
        </span>
      </div>

      {proposta.termoConteudo ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setVerTermo((v) => !v)}
            className="text-xs text-[#042f1b] underline underline-offset-2"
          >
            {verTermo ? "Ocultar o termo" : "Ver o termo de acerto"}
          </button>
          {verTermo ? (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[#c9a35e]/30 bg-white p-3 text-xs text-[#042f1b]">
              {proposta.termoConteudo}
            </pre>
          ) : null}
        </div>
      ) : null}

      {aceito ? (
        <p className="mt-4 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800">
          ✓ Aceite registrado. Nossa equipe dará sequência ao reembolso.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={aceitar}
            disabled={aceitando}
            className="rounded-lg bg-[#042f1b] px-5 py-2.5 text-sm font-medium text-[#c9a35e] hover:opacity-90 disabled:opacity-50"
          >
            {aceitando ? "Registrando…" : "Aceitar o acerto"}
          </button>
          {erro ? <span className="text-xs text-amber-700">{erro}</span> : null}
        </div>
      )}
    </div>
  );
}
