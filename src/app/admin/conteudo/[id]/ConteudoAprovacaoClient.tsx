"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ações de aprovação/rejeição do conteúdo (Fase B1). POST /api/admin/content-submissions.
export default function ConteudoAprovacaoClient({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState("");
  // Elegibilidade: o servidor é a autoridade sobre remoção de regra bloqueante
  // (compara os conjuntos normalizados). Se a aprovação for recusada por isso,
  // revelamos o campo de justificativa para o admin poder reenviar — mesmo
  // padrão do ElegibilidadeEditor (edição direta do admin).
  const [exigeJustificativaElegibilidade, setExigeJustificativaElegibilidade] = useState(false);
  const [justificativaElegibilidade, setJustificativaElegibilidade] = useState("");

  async function agir(acao: "aprovar" | "rejeitar") {
    setBusy(true);
    setErro(null);
    try {
      const r = await fetch("/api/admin/content-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao,
          id,
          motivo: acao === "rejeitar" ? motivo.trim() : undefined,
          justificativaElegibilidade: acao === "aprovar" && exigeJustificativaElegibilidade ? justificativaElegibilidade.trim() : undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        if (j?.codigo === "justificativa_elegibilidade_obrigatoria") setExigeJustificativaElegibilidade(true);
        setErro(j?.erro || "Não foi possível concluir a ação.");
      } else router.push("/admin/conteudo");
    } catch {
      setErro("Falha de conexão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5">
      {erro ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p> : null}
      {exigeJustificativaElegibilidade ? (
        <div className="mb-3 rounded-lg border border-brand-gold/50 bg-brand-cream/40 p-3">
          <label className="mb-1 block text-xs font-semibold text-brand-golddark">
            Esta proposta remove uma regra de elegibilidade bloqueante. Justifique para aprovar (obrigatório, mín. 10 caracteres):
          </label>
          <textarea
            value={justificativaElegibilidade}
            onChange={(e) => setJustificativaElegibilidade(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Ex.: escola confirmou que o programa passou a aceitar esta nacionalidade."
          />
          <p className="mt-1 text-[11px] text-neutral-500">A justificativa fica registrada na trilha de auditoria.</p>
        </div>
      ) : null}
      {!rejeitando ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => agir("aprovar")}
            disabled={busy || (exigeJustificativaElegibilidade && justificativaElegibilidade.trim().length < 10)}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
          >
            {busy ? "…" : "Aprovar e publicar"}
          </button>
          <button
            type="button"
            onClick={() => setRejeitando(true)}
            disabled={busy}
            className="rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-cream/60 disabled:opacity-50"
          >
            Devolver para ajuste
          </button>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Motivo do ajuste (a escola verá)</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => agir("rejeitar")}
              disabled={busy || !motivo.trim()}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50"
            >
              {busy ? "…" : "Devolver"}
            </button>
            <button
              type="button"
              onClick={() => setRejeitando(false)}
              disabled={busy}
              className="rounded-xl px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
