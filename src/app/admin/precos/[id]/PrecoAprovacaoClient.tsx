"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Aprovar (publica -> materializa) ou rejeitar (pede ajuste) um price list.
export default function PrecoAprovacaoClient({ id }: { id: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null as string | null);
  const [ok, setOk] = useState(null as string | null);
  const [formRejeicao, setFormRejeicao] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function chamar(acao: "aprovar" | "rejeitar") {
    setOcupado(true);
    setErro(null);
    setOk(null);
    try {
      const res = await fetch("/api/admin/price-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "rejeitar" ? { acao, id, motivo } : { acao, id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha na operação.");
        return;
      }
      if (acao === "aprovar") {
        const r = json.resumo;
        setOk(`Publicado: ${r?.produtos ?? 0} produto(s), ${r?.faixas ?? 0} faixa(s), ${r?.taxas ?? 0} taxa(s).`);
      } else {
        setOk("Devolvido para ajuste.");
      }
      setTimeout(() => router.push("/admin/precos"), 900);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  function confirmarAprovar() {
    if (confirm("Aprovar e PUBLICAR estes preços no catálogo? Isso substitui o price list anterior da escola.")) {
      chamar("aprovar");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4">
      {erro ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{erro}</div> : null}
      {ok ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">{ok}</div> : null}

      {!formRejeicao ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={confirmarAprovar}
            disabled={ocupado}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {ocupado ? "Publicando…" : "Aprovar e publicar"}
          </button>
          <button
            type="button"
            onClick={() => { setErro(null); setFormRejeicao(true); }}
            disabled={ocupado}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-60"
          >
            Devolver para ajuste
          </button>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-medium text-neutral-600">Motivo do ajuste (vai para a escola)</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm"
            placeholder="Ex.: faltou a taxa de matrícula; a moeda está errada…"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => chamar("rejeitar")}
              disabled={ocupado || !motivo.trim()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Enviar devolução
            </button>
            <button type="button" onClick={() => setFormRejeicao(false)} disabled={ocupado} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-600">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
