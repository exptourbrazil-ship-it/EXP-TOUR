"use client";

import { useEffect, useState } from "react";
import { fmtData, fmtMoeda } from "@/lib/formato";

type Proposta = {
  id: string;
  token: string;
  status: string;
  nome_completo: string | null;
  cpf: string | null;
  programa_nome: string | null;
  estudante_nome: string | null;
  moeda: string | null;
  custo_programa: number | null;
  validade: string | null;
  contrato_id: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  rascunho: "bg-neutral-100 text-neutral-600",
  enviada: "bg-amber-100 text-amber-800",
  aceita: "bg-brand/10 text-brand",
  expirada: "bg-red-100 text-red-700",
  cancelada: "bg-neutral-100 text-neutral-500",
};

const VAZIO = {
  nomeCompleto: "",
  cpf: "",
  email: "",
  telefone: "",
  programaNome: "",
  estudanteNome: "",
  paisDestino: "",
  moeda: "",
  custoPrograma: "",
  dataInicio: "",
};

export default function PropostasClient() {
  const [lista, setLista] = useState<Proposta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [agindoId, setAgindoId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VAZIO });
  const [copiado, setCopiado] = useState<string | null>(null);

  function linkDe(token: string) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/proposta/${token}`;
  }

  async function carregar() {
    try {
      const res = await fetch("/api/admin/propostas", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao carregar.");
      else setLista(json.propostas || []);
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const set = (campo: keyof typeof VAZIO) => (e: any) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/propostas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao criar.");
      } else {
        setForm({ ...VAZIO });
        await carregar();
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar(id: string) {
    setAgindoId(id);
    setErro(null);
    try {
      const res = await fetch("/api/admin/propostas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "cancelada" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao cancelar.");
      else await carregar();
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setAgindoId(null);
    }
  }

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(linkDe(token));
      setCopiado(token);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      /* ignore */
    }
  }

  const inputClasse = "mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Propostas</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Crie a proposta do programa e compartilhe o link. O cliente confere sem compromisso e
          assina eletronicamente (as telas do link e da assinatura entram nas próximas fases).
        </p>
      </header>

      {erro ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p> : null}

      <form onSubmit={criar} className="mb-8 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-brand">Nova proposta</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-brand">Nome do contratante<input type="text" value={form.nomeCompleto} onChange={set("nomeCompleto")} required className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">CPF<input type="text" value={form.cpf} onChange={set("cpf")} required className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">E-mail<input type="email" value={form.email} onChange={set("email")} className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">Telefone/WhatsApp<input type="text" value={form.telefone} onChange={set("telefone")} className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">Programa<input type="text" value={form.programaNome} onChange={set("programaNome")} placeholder="Ex.: Inglês 24 semanas — ILAC" className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">Estudante<input type="text" value={form.estudanteNome} onChange={set("estudanteNome")} className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">Destino<input type="text" value={form.paisDestino} onChange={set("paisDestino")} placeholder="canada / eua / ..." className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">Data de início<input type="date" value={form.dataInicio} onChange={set("dataInicio")} className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">Moeda de referência<input type="text" value={form.moeda} onChange={(e) => setForm((f) => ({ ...f, moeda: e.target.value.toUpperCase() }))} required placeholder="CAD / USD / ..." className={inputClasse} /></label>
          <label className="text-sm font-medium text-brand">Custo do programa (na moeda)<input type="number" step="0.01" value={form.custoPrograma} onChange={set("custoPrograma")} required className={inputClasse} /></label>
        </div>
        <button type="submit" disabled={salvando} className="mt-4 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60">
          {salvando ? "Criando…" : "Criar proposta"}
        </button>
      </form>

      <h2 className="mb-3 text-sm font-semibold text-brand">Propostas</h2>
      {carregando ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma proposta ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((p) => (
            <li key={p.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-brand">{p.nome_completo || "(sem nome)"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE[p.status] || "bg-neutral-100 text-neutral-600"}`}>
                  {p.status}
                </span>
              </div>
              <div className="mt-0.5 text-sm text-neutral-600">
                {p.programa_nome || "—"}
                {p.custo_programa != null ? <span className="text-neutral-500"> · {fmtMoeda(Number(p.custo_programa), p.moeda || "?")}</span> : null}
              </div>
              <div className="mt-0.5 text-xs text-neutral-400">
                {p.cpf ? `CPF ${p.cpf} · ` : ""}validade {p.validade ? fmtData(p.validade) : "—"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.status !== "cancelada" ? (
                  <button type="button" onClick={() => copiar(p.token)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand-cream/60">
                    {copiado === p.token ? "Link copiado!" : "Copiar link"}
                  </button>
                ) : null}
                {p.status === "enviada" ? (
                  <button type="button" onClick={() => cancelar(p.id)} disabled={agindoId === p.id} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60">
                    Cancelar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
