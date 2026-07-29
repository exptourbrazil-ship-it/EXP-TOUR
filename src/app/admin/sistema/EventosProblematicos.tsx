"use client";

import { useEffect, useState } from "react";
import { fmtData } from "@/lib/formato";

// Lista os eventos do barramento com status 'erro' ou 'pendente' (os que
// precisam de atencao) e permite reprocessar os de pagamento do Mercado Pago.
// Carrega ao montar. Reusa GET /api/admin/events e POST
// /api/admin/events/reprocessar (que ja existiam, sem UI ate agora).
type Evento = {
  id: string;
  source: string;
  event_type: string;
  external_id: string | null;
  status: string;
  tentativas: number;
  erro: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  erro: "bg-red-100 text-red-700",
  pendente: "bg-amber-100 text-amber-800",
  processado: "bg-brand/10 text-brand",
  ignorado: "bg-neutral-100 text-neutral-600",
};

async function buscar(status: string): Promise<Evento[]> {
  const res = await fetch(`/api/admin/events?status=${status}&limite=200`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || !json.ok) throw new Error(json.erro || "Falha ao listar eventos.");
  return json.events || [];
}

export default function EventosProblematicos() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [reprocessandoId, setReprocessandoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [comErro, pendentes] = await Promise.all([buscar("erro"), buscar("pendente")]);
        if (!ativo) return;
        const juntos = [...comErro, ...pendentes].sort((a, b) =>
          a.created_at < b.created_at ? 1 : -1
        );
        setEventos(juntos);
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro de rede.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function reprocessar(ev: Evento) {
    setReprocessandoId(ev.id);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/admin/events/reprocessar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: ev.id }),
      });
      const json = await res.json();
      const novoStatus = json?.resultado?.status as string | undefined;
      if (res.ok && (novoStatus === "processado" || novoStatus === "ignorado")) {
        // Resolvido: sai da lista de problematicos.
        setEventos((lista) => lista.filter((x) => x.id !== ev.id));
        setAviso(`Evento ${novoStatus === "processado" ? "processado" : "ignorado"} com sucesso.`);
      } else {
        // Continua com erro: atualiza a mensagem para dar contexto.
        const msg = json?.resultado?.erro || json?.erro || "Ainda com erro após reprocessar.";
        setEventos((lista) =>
          lista.map((x) => (x.id === ev.id ? { ...x, status: "erro", erro: msg } : x))
        );
        setErro(msg);
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setReprocessandoId(null);
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-serif text-2xl text-brand">Eventos a resolver</h2>
        {!carregando ? (
          <span className="rounded-full bg-brand-cream px-2.5 py-0.5 text-xs font-medium text-brand">
            {eventos.length}
          </span>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Webhooks com status <strong>erro</strong> ou <strong>pendente</strong>. Pagamentos do
        Mercado Pago podem ser reprocessados (a operação é idempotente).
      </p>

      {aviso ? (
        <p className="mb-3 rounded-xl border border-brand/20 bg-brand-cream/50 p-3 text-sm text-brand">{aviso}</p>
      ) : null}
      {erro ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
      ) : null}

      {carregando ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : eventos.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">Nenhum evento com erro ou pendente. 🎉</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {eventos.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      STATUS_BADGE[ev.status] || "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {ev.status}
                  </span>
                  <span className="text-sm font-medium text-brand">
                    {ev.source} · {ev.event_type}
                  </span>
                  <span className="text-xs text-neutral-400">{ev.tentativas} tentativa(s)</span>
                </div>
                {ev.external_id ? (
                  <div className="mt-1 text-xs text-neutral-500">id externo: {ev.external_id}</div>
                ) : null}
                {ev.erro ? (
                  <div className="mt-1 break-words text-xs text-red-600">{ev.erro}</div>
                ) : null}
                <div className="mt-0.5 text-xs text-neutral-400">Recebido em {fmtData(ev.created_at)}</div>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                {ev.source === "mercadopago" ? (
                  <button
                    type="button"
                    onClick={() => reprocessar(ev)}
                    disabled={reprocessandoId === ev.id}
                    className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-60"
                  >
                    {reprocessandoId === ev.id ? "Reprocessando…" : "Reprocessar"}
                  </button>
                ) : (
                  <span className="text-xs text-neutral-400">reprocesso manual indisponível</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
