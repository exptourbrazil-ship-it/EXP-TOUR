"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { TitularDataInicioAdmin } from "./page";
import { normalizarBusca } from "@/lib/clientes";
import { resumoDatasInicio } from "@/lib/data-inicio";

// Editor admin da data de inicio do curso de um titular (titulares.data_inicio),
// inclusive de clientes sem contrato. Carrega no servidor; aqui o admin busca o
// titular, define a data e salva (POST em /api/admin/data-inicio, gated por
// casos.gerir). A UI espelha o RBAC: sem casos.gerir, so leitura.
export default function DataInicioClient({
  titulares,
  podeGerir,
}: {
  titulares: TitularDataInicioAdmin[];
  podeGerir: boolean;
}) {
  const [lista, setLista] = useState<TitularDataInicioAdmin[]>(titulares);
  const [busca, setBusca] = useState("");
  const [titularId, setTitularId] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  // Resumo derivado da lista (recomputa apos salvar/limpar), nao um prop fixo.
  const resumo = useMemo(() => resumoDatasInicio(lista), [lista]);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return lista;
    return lista.filter((t) => normalizarBusca([t.nome_completo, t.email].filter(Boolean).join(" ")).includes(termo));
  }, [lista, busca]);

  const selecionado = lista.find((t) => t.id === titularId) || null;

  function selecionarTitular(id: string) {
    setTitularId(id);
    setResultado(null);
    const t = lista.find((x) => x.id === id);
    setDataInicio(t?.data_inicio || "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!podeGerir || !titularId) return;
    setSalvando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/admin/data-inicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titularId, dataInicio }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setResultado({ ok: false, texto: json.erro || "Falha ao salvar." });
      } else {
        setResultado({ ok: true, texto: dataInicio ? "Data salva." : "Data limpa." });
        setLista((ls) => ls.map((t) => (t.id === titularId ? { ...t, data_inicio: dataInicio || null } : t)));
      }
    } catch (err: any) {
      setResultado({ ok: false, texto: err?.message || "Erro de rede." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">Painel</p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Data de início</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Define manualmente a data de início do curso de um titular — inclusive de clientes sem
          contrato. A aba Início usa a data do contrato quando existe e, caso contrário, esta.
        </p>
      </header>

      {/* Indicadores */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <CardIndicador titulo="Titulares" valor={String(resumo.total)} legenda="no total" />
        <CardIndicador titulo="Com data" valor={String(resumo.comData)} legenda="data definida" />
        <CardIndicador
          titulo="Sem data"
          valor={String(resumo.semData)}
          legenda="pendente"
          tom={resumo.semData > 0 ? "atencao" : undefined}
        />
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600">
          Nenhum titular encontrado.
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-500">Buscar (nome ou e-mail)</span>
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Ex.: Maria…"
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-neutral-500">Titular ({filtrados.length})</span>
              <select
                value={titularId}
                onChange={(e) => selecionarTitular(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione…</option>
                {filtrados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome_completo || "(sem nome)"}
                    {t.email ? " — " + t.email : ""}
                    {t.data_inicio ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selecionado ? (
            <form onSubmit={handleSubmit} className="mt-5 border-t border-neutral-100 pt-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-neutral-600">
                  <span className="font-medium text-brand">{selecionado.nome_completo || "(sem nome)"}</span>
                  {selecionado.email ? <span className="text-neutral-400"> · {selecionado.email}</span> : null}
                </div>
                <Link
                  href={`/admin/clientes/${selecionado.id}`}
                  className="text-xs font-medium text-brand-golddark hover:underline"
                >
                  Abrir Caso 360 →
                </Link>
              </div>

              <label className="flex max-w-xs flex-col gap-1">
                <span className="text-xs font-medium text-neutral-500">Data de início</span>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  disabled={!podeGerir}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-50 disabled:text-neutral-500"
                />
              </label>
              <p className="mt-1 text-xs text-neutral-400">Deixe em branco e salve para limpar a data.</p>

              {podeGerir ? (
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={salvando}
                    className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-50"
                  >
                    {salvando ? "Salvando…" : "Salvar data de início"}
                  </button>
                  {resultado ? (
                    <span className={`text-xs ${resultado.ok ? "text-emerald-700" : "text-red-600"}`}>
                      {resultado.texto}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="mt-5 text-xs text-neutral-500">
                  Seu papel não pode editar a data de início (somente leitura).
                </p>
              )}
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CardIndicador({
  titulo,
  valor,
  legenda,
  tom,
}: {
  titulo: string;
  valor: string;
  legenda?: string;
  tom?: "atencao";
}) {
  const corValor = tom === "atencao" ? "text-brand-golddark" : "text-brand";
  const corBorda = tom === "atencao" ? "border-brand-gold/40" : "border-neutral-200";
  return (
    <div className={`rounded-2xl border bg-white p-4 ${corBorda}`}>
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-2 font-serif text-xl ${corValor}`}>{valor}</p>
      <p className="mt-1 text-xs text-neutral-400">{legenda ?? " "}</p>
    </div>
  );
}
