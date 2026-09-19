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
  /** Quantas ainda faltam depois deste lote (o servidor reconta). */
  pendentes_restantes: number | null;
  erros: string[];
};

// Cada chamada copia um lote (teto do servidor). Como uma escola grande tem mais
// fotos que o lote, o botao repete ate zerar — o operador clicava uma vez, via
// "30 foto(s) copiada(s)" e ia embora achando que a escola estava completa.
// Teto por clique. Fica ABAIXO do teto de lotes por admin na rota (20 em 10 min):
// um clique nao pode consumir o orcamento a ponto de o proximo parar no meio.
const MAX_LOTES_SEGUIDOS = 8;

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

    let fotos = 0;
    let capas = 0;
    let falhas = 0;
    let faltam: number | null = null;
    let interrompida: string | null = null;

    try {
      for (let lote = 0; lote < MAX_LOTES_SEGUIDOS; lote++) {
        const resp = await fetch(`/api/admin/suppliers/${supplierId}/midia`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          setErro(json?.error?.message ?? "Não foi possível copiar as fotos agora.");
          if (fotos > 0) setMsg(`${fotos} foto(s) copiada(s) antes da interrupção.`);
          router.refresh();
          return;
        }
        const r = (json?.data ?? json) as Resultado;
        fotos += r.internalizadas;
        capas += r.capas_atualizadas;
        falhas += r.falhas;
        faltam = r.pendentes_restantes;
        interrompida = r.interrompida;
        setMsg(`${fotos} foto(s) copiada(s)${faltam ? ` · ${faltam} restante(s)…` : "…"}`);

        // Para quando zerou, quando o servidor nao soube dizer, ou quando o lote
        // nao andou (so sobraram fotos que falham) — senao seria laco infinito.
        if (faltam === null || faltam === 0 || r.internalizadas === 0) break;
      }

      // interrompida = falha NOSSA (Storage/banco), nao das URLs: precisa aparecer
      // como erro, senao o operador le "0 foto(s) copiada(s)" em verde e abre chamado.
      if (interrompida) setErro(`A cópia parou por um problema no portal: ${interrompida}`);
      const partes = [`${fotos} foto(s) copiada(s)`];
      if (capas > 0) partes.push(`${capas} capa(s) atualizada(s)`);
      if (falhas > 0) partes.push(`${falhas} sem sucesso`);
      if (faltam && faltam > 0) partes.push(`${faltam} ainda pendente(s)`);
      setMsg(partes.join(" · "));
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
            {rodando ? "Copiando…" : `Copiar ${pendentes} foto(s) para o portal`}
          </button>
        ) : null}
      </div>
      {msg ? <p className="mt-2 text-sm text-emerald-700">{msg}</p> : null}
      {erro ? <p className="mt-2 text-sm text-red-700">{erro}</p> : null}
      {msg && pendentes > 0 ? (
        <p className="mt-1 text-xs text-neutral-500">
          Ainda faltam fotos: clique de novo para continuar de onde parou.
        </p>
      ) : null}
    </div>
  );
}
