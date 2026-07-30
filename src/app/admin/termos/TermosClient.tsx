"use client";

import { useEffect, useState } from "react";
import { fmtData } from "@/lib/formato";

type Termo = {
  id: string;
  versao: string;
  hash: string;
  ativo: boolean;
  vigente_desde: string;
  criado_em: string;
};

export default function TermosClient() {
  const [termos, setTermos] = useState<Termo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [versao, setVersao] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [agindoId, setAgindoId] = useState<string | null>(null);

  async function carregar() {
    try {
      const res = await fetch("/api/admin/termos", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) setErro(json.erro || "Falha ao carregar.");
      else setTermos(json.termos || []);
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
      const res = await fetch("/api/admin/termos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versao, conteudo }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao salvar.");
      } else {
        setVersao("");
        setConteudo("");
        await carregar(); // recarrega para refletir a nova vigente + desativadas
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(id: string, ativo: boolean) {
    setAgindoId(id);
    setErro(null);
    try {
      const res = await fetch("/api/admin/termos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ativo }),
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

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Termo de Adesão</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Cadastre as versões do Termo. Apenas uma fica <strong>vigente</strong> por vez — é a que o
          cliente aceita na área do cliente. O texto e as cláusulas devem vir do jurídico.
        </p>
      </header>

      {erro ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
      ) : null}

      {/* Nova versão */}
      <form onSubmit={criar} className="mb-8 rounded-2xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-brand">Nova versão</h2>
        <label className="text-sm font-medium text-brand">
          Identificador da versão
          <input
            type="text"
            value={versao}
            onChange={(e) => setVersao(e.target.value)}
            placeholder="ex.: 2026-01"
            required
            className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-brand">
          Conteúdo do termo (texto do jurídico)
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            rows={10}
            required
            className="mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 font-mono text-xs"
          />
        </label>
        <button
          type="submit"
          disabled={salvando}
          className="mt-3 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? "Salvando..." : "Salvar e tornar vigente"}
        </button>
      </form>

      {/* Versões existentes */}
      <h2 className="mb-3 text-sm font-semibold text-brand">Versões</h2>
      {carregando ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : termos.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma versão cadastrada ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {termos.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-brand">{t.versao}</span>
                  {t.ativo ? (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                      vigente
                    </span>
                  ) : (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                      inativa
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-neutral-400" title={t.hash}>
                  hash {t.hash.slice(0, 12)}… · {fmtData(t.criado_em)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => alternar(t.id, !t.ativo)}
                disabled={agindoId === t.id}
                className="flex-shrink-0 rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60 disabled:opacity-60"
              >
                {agindoId === t.id ? "…" : t.ativo ? "Desativar" : "Tornar vigente"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
