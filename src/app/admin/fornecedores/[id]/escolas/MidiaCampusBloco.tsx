"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Resultado = {
  candidatas: number;
  internalizadas: number;
  capas_atualizadas: number;
  falhas: number;
  adiadas: number;
  interrompida: string | null;
  erros: string[];
};

// Bloco da aba "Meus Campi": fotos dos campi ainda hospedadas no site da escola.
// O portal so exibe imagens do nosso Storage (politica de seguranca do navegador),
// entao enquanto a foto esta fora ela NAO aparece no orcamento. O botao copia um
// lote por clique (mesmo servico do cron diario).
export default function MidiaCampusBloco({
  supplierId,
  pendentes,
  esgotadas,
}: {
  supplierId: string;
  pendentes: number;
  esgotadas: number;
}) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (pendentes === 0 && esgotadas === 0 && !msg) return null;

  async function copiar() {
    setRodando(true);
    setErro(null);
    setMsg(null);
    try {
      const resp = await fetch(`/api/admin/suppliers/${supplierId}/midia`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        setErro(json?.error?.message ?? "Não foi possível copiar as fotos agora.");
        return;
      }
      const r = (json?.data ?? json) as Resultado;
      const partes = [`${r.internalizadas} foto(s) copiada(s)`];
      if (r.capas_atualizadas > 0) partes.push(`${r.capas_atualizadas} capa(s) atualizada(s)`);
      if (r.falhas > 0) partes.push(`${r.falhas} sem sucesso`);
      if (r.adiadas > 0) partes.push(`${r.adiadas} para o próximo lote`);
      setMsg(`${partes.join(" · ")}${r.interrompida ? ` — interrompido: ${r.interrompida}` : ""}`);
      router.refresh();
    } catch {
      setErro("Falha de rede ao copiar as fotos.");
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-brand-gold/40 bg-brand-cream/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-neutral-700">
          <p className="font-medium text-brand">Fotos hospedadas fora do portal</p>
          <p className="mt-0.5 text-neutral-600">
            {pendentes > 0 ? (
              <>
                {pendentes} foto(s) destes campi ainda estão no site da escola e, por isso,{" "}
                <strong>não aparecem na cotação</strong>. Copie para o nosso Storage.
              </>
            ) : (
              <>Todas as fotos que podiam ser copiadas já estão no portal.</>
            )}
            {esgotadas > 0 ? (
              <> {esgotadas} foto(s) falharam 5 vezes e saíram da fila (o motivo fica gravado na foto).</>
            ) : null}
          </p>
        </div>
        {pendentes > 0 ? (
          <button
            type="button"
            onClick={copiar}
            disabled={rodando}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream disabled:opacity-60"
          >
            {rodando ? "Copiando…" : "Copiar fotos para o portal"}
          </button>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
      {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
      {msg && pendentes > 0 ? (
        <p className="mt-1 text-xs text-neutral-500">
          Cada clique copia até 30 fotos. Clique de novo para seguir com as que faltam.
        </p>
      ) : null}
    </div>
  );
}
