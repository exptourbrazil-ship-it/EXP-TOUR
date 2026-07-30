"use client";

import { useState } from "react";
import type { ContratoOpcao } from "./page";
import { fmtMoeda } from "@/lib/formato";

type Item = {
  id: string;
  fornecedor: string;
  natureza: string | null;
  valor: number | null;
  moeda: string | null;
  prazo: string | null;
  evento: string | null;
  documento_viabiliza: string | null;
  consequencia_atraso: string | null;
  politica_cancelamento: string | null;
  fonte: string | null;
};

const VAZIO = {
  fornecedor: "",
  natureza: "",
  valor: "",
  moeda: "",
  prazo: "",
  evento: "",
  documentoViabiliza: "",
  consequenciaAtraso: "",
  politicaCancelamento: "",
  fonte: "",
};

export default function AnexoIIIClient({ contratos }: { contratos: ContratoOpcao[] }) {
  const [contratoId, setContratoId] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VAZIO });

  async function carregar(id: string) {
    if (!id) {
      setItens([]);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/admin/anexo-iii?contratoId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao carregar.");
      else setItens(json.itens || []);
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  function selecionar(id: string) {
    setContratoId(id);
    const c = contratos.find((x) => x.id === id);
    setForm((f) => ({ ...f, moeda: c?.moeda || "" }));
    carregar(id);
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/anexo-iii", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId, ...form }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao salvar.");
      } else {
        setForm((f) => ({ ...VAZIO, moeda: f.moeda }));
        await carregar(contratoId);
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    setRemovendoId(id);
    setErro(null);
    try {
      const res = await fetch(`/api/admin/anexo-iii?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao remover.");
      else await carregar(contratoId);
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setRemovendoId(null);
    }
  }

  const inputClasse = "mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";
  const set = (campo: keyof typeof VAZIO) => (e: any) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Anexo III — Política de Pagamento dos Fornecedores</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Monte, por contrato, os prazos e condições de pagamento exigidos pelos fornecedores
          (Cláusula 7.5.2). O cliente vê na aba Financeiro. Requisito migratório entra como um item
          com fornecedor "Requisito migratório (destino)".
        </p>
      </header>

      <label className="text-sm font-medium text-brand">
        Contrato
        <select value={contratoId} onChange={(e) => selecionar(e.target.value)} className={inputClasse}>
          <option value="">Selecione…</option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </label>

      {erro ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p> : null}

      {contratoId ? (
        <>
          <form onSubmit={adicionar} className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-brand">Novo item</h2>
            <label className="block text-sm font-medium text-brand">
              Fornecedor
              <input type="text" value={form.fornecedor} onChange={set("fornecedor")} required placeholder="Ex.: ILAC Vancouver" className={inputClasse} />
            </label>
            <label className="mt-3 block text-sm font-medium text-brand">
              Natureza do serviço
              <input type="text" value={form.natureza} onChange={set("natureza")} placeholder="Ex.: Curso de inglês" className={inputClasse} />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm font-medium text-brand">Valor exigido<input type="number" step="0.01" value={form.valor} onChange={set("valor")} className={inputClasse} /></label>
              <label className="text-sm font-medium text-brand">Moeda<input type="text" value={form.moeda} onChange={(e) => setForm((f) => ({ ...f, moeda: e.target.value.toUpperCase() }))} className={inputClasse} /></label>
              <label className="text-sm font-medium text-brand">Prazo do fornecedor<input type="text" value={form.prazo} onChange={set("prazo")} placeholder="Ex.: 30 dias antes" className={inputClasse} /></label>
            </div>
            <label className="mt-3 block text-sm font-medium text-brand">
              Evento que dispara a exigência
              <input type="text" value={form.evento} onChange={set("evento")} placeholder="Ex.: emissão da carta de aceitação" className={inputClasse} />
            </label>
            <label className="mt-3 block text-sm font-medium text-brand">
              Documento que o pagamento viabiliza
              <input type="text" value={form.documentoViabiliza} onChange={set("documentoViabiliza")} className={inputClasse} />
            </label>
            <label className="mt-3 block text-sm font-medium text-brand">
              Consequência do atraso (segundo o fornecedor)
              <input type="text" value={form.consequenciaAtraso} onChange={set("consequenciaAtraso")} className={inputClasse} />
            </label>
            <label className="mt-3 block text-sm font-medium text-brand">
              Política de cancelamento/reembolso do fornecedor
              <textarea value={form.politicaCancelamento} onChange={set("politicaCancelamento")} rows={2} className={inputClasse} />
            </label>
            <label className="mt-3 block text-sm font-medium text-brand">
              Fonte e data da informação
              <input type="text" value={form.fonte} onChange={set("fonte")} placeholder="Ex.: invoice de 12/2026" className={inputClasse} />
            </label>
            <button type="submit" disabled={salvando} className="mt-4 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60">
              {salvando ? "Salvando…" : "Adicionar item"}
            </button>
          </form>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-brand">Itens do contrato</h2>
          {carregando ? (
            <p className="text-sm text-neutral-500">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-neutral-500">Nenhum item ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {itens.map((it) => (
                <li key={it.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-brand">
                        {it.fornecedor}
                        {it.valor != null ? <span className="text-neutral-500"> · {fmtMoeda(Number(it.valor), it.moeda || "?")}</span> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {[it.natureza, it.evento, it.prazo].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {it.documento_viabiliza ? <div className="text-xs text-neutral-400">Viabiliza: {it.documento_viabiliza}</div> : null}
                    </div>
                    <button type="button" onClick={() => remover(it.id)} disabled={removendoId === it.id} className="flex-shrink-0 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60">
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
