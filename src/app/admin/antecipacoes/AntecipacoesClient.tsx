"use client";

import { useEffect, useState } from "react";
import type { ContratoOpcao } from "./page";
import { fmtData, fmtMoeda } from "@/lib/formato";

type Antecipacao = {
  id: string;
  documento: string;
  justificativa: string | null;
  valor: number;
  moeda: string;
  data_limite: string;
  comprovante_url: string | null;
  status: string;
  contrato?: { nome?: string | null; estudante_nome?: string | null; titular?: { nome_completo?: string | null } };
};

const STATUS_BADGE: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800",
  atendida: "bg-brand/10 text-brand",
  cancelada: "bg-neutral-100 text-neutral-500",
};

// Rotulo legivel do status, alinhado ao padrao de Financeiro/Quotes.
const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  atendida: "Atendida",
  cancelada: "Cancelada",
};

export default function AntecipacoesClient({ contratos }: { contratos: ContratoOpcao[] }) {
  const [lista, setLista] = useState<Antecipacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [agindoId, setAgindoId] = useState<string | null>(null);

  const [contratoId, setContratoId] = useState("");
  const [documento, setDocumento] = useState("");
  const [valor, setValor] = useState("");
  const [moeda, setMoeda] = useState("");
  const [dataLimite, setDataLimite] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [comprovanteUrl, setComprovanteUrl] = useState("");

  async function carregar() {
    try {
      const res = await fetch("/api/admin/antecipacoes", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao carregar.");
      else setLista(json.antecipacoes || []);
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/antecipacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, documento, valor, moeda, dataLimite, justificativa, comprovanteUrl }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao registrar.");
      } else {
        setDocumento("");
        setValor("");
        setDataLimite("");
        setJustificativa("");
        setComprovanteUrl("");
        await carregar();
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(id: string, status: string) {
    setAgindoId(id);
    setErro(null);
    try {
      const res = await fetch("/api/admin/antecipacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao atualizar.");
      else await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setAgindoId(null);
    }
  }

  const inputClasse = "mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Antecipações</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Registre uma antecipação exigida por visto ou fornecedor (Cláusula 7.5), com o documento,
          o valor, a data-limite do terceiro e o comprovante da exigência. O cliente vê na aba
          Financeiro.
        </p>
      </header>

      {erro ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
      ) : null}

      <form onSubmit={criar} className="mb-8 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-brand">Nova antecipação</h2>
        <label className="text-sm font-medium text-brand">
          Contrato
          <select
            value={contratoId}
            onChange={(e) => {
              setContratoId(e.target.value);
              const c = contratos.find((x) => x.id === e.target.value);
              if (c?.moeda) setMoeda(c.moeda);
            }}
            required
            className={inputClasse}
          >
            <option value="">Selecione…</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium text-brand">
          Documento que o pagamento viabiliza
          <input type="text" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Ex.: Carta de aceitação" required className={inputClasse} />
        </label>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium text-brand">
            Valor
            <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required className={inputClasse} />
          </label>
          <label className="text-sm font-medium text-brand">
            Moeda
            <input type="text" value={moeda} onChange={(e) => setMoeda(e.target.value.toUpperCase())} required className={inputClasse} />
          </label>
          <label className="text-sm font-medium text-brand">
            Data-limite do terceiro
            <input type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} required className={inputClasse} />
          </label>
        </div>

        <label className="mt-3 block text-sm font-medium text-brand">
          Justificativa / composição
          <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={2} className={inputClasse} />
        </label>
        <label className="mt-3 block text-sm font-medium text-brand">
          Comprovante da exigência (link)
          <input type="url" value={comprovanteUrl} onChange={(e) => setComprovanteUrl(e.target.value)} placeholder="https://…" className={inputClasse} />
        </label>

        <button type="submit" disabled={salvando} className="mt-4 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60">
          {salvando ? "Registrando…" : "Registrar antecipação"}
        </button>
      </form>

      <h2 className="mb-3 text-sm font-semibold text-brand">Antecipações registradas</h2>
      {carregando ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma antecipação registrada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((a) => {
            const cliente = a.contrato?.estudante_nome || a.contrato?.titular?.nome_completo || "(sem nome)";
            return (
              <li key={a.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-brand">{cliente}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE[a.status] || "bg-neutral-100 text-neutral-600"}`}>
                    {STATUS_LABEL[a.status] || a.status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-neutral-700">
                  {a.documento} · <strong>{fmtMoeda(Number(a.valor), a.moeda)}</strong> · até {fmtData(a.data_limite)}
                </div>
                {a.justificativa ? <div className="mt-0.5 text-xs text-neutral-500">{a.justificativa}</div> : null}
                {a.comprovante_url ? (
                  <a href={a.comprovante_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block text-xs text-brand-golddark hover:underline">
                    ver comprovante
                  </a>
                ) : null}
                {a.status === "pendente" ? (
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => mudarStatus(a.id, "atendida")} disabled={agindoId === a.id} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-60">
                      Marcar atendida
                    </button>
                    <button type="button" onClick={() => mudarStatus(a.id, "cancelada")} disabled={agindoId === a.id} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-cream/60 disabled:opacity-60">
                      Cancelar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
