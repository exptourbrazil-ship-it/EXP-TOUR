"use client";

import { useState } from "react";
import Link from "next/link";

// Ferramenta de forca maior coletiva (E8). Fluxo em dois passos com trava de
// seguranca: PRE-VISUALIZAR (conta os afetados) antes de APLICAR; mudar o filtro
// invalida o preview e exige pre-visualizar de novo. Vermelho e permitido no
// admin (acao de alto impacto).

type Resultado = {
  afetados: number;
  abertas: number;
  jaAbertas: number;
  avisos: number;
  erros: number;
  truncado: boolean;
};

export default function ForcaMaiorClient({ destinos }: { destinos: string[] }) {
  const [destino, setDestino] = useState(destinos[0] || "");
  const [inicioDe, setInicioDe] = useState("");
  const [inicioAte, setInicioAte] = useState("");
  const [motivo, setMotivo] = useState("");

  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewChave, setPreviewChave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<null | "preview" | "aplicar">(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const chaveAtual = JSON.stringify({ destino, inicioDe, inicioAte });
  const previewValido = previewChave === chaveAtual && previewCount !== null;

  function invalidarPreview() {
    setPreviewCount(null);
    setPreviewChave(null);
    setResultado(null);
  }

  async function preVisualizar() {
    setErro(null);
    setResultado(null);
    setOcupado("preview");
    try {
      const res = await fetch("/api/admin/forca-maior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino, inicioDe: inicioDe || null, inicioAte: inicioAte || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Falha ao pré-visualizar.");
        return;
      }
      setPreviewCount(data.afetados);
      setPreviewChave(chaveAtual);
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  async function aplicar() {
    setErro(null);
    if (!previewValido) {
      setErro("Pré-visualize antes de aplicar.");
      return;
    }
    if (!motivo.trim()) {
      setErro("Informe a justificativa.");
      return;
    }
    setOcupado("aplicar");
    try {
      const res = await fetch("/api/admin/forca-maior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destino,
          inicioDe: inicioDe || null,
          inicioAte: inicioAte || null,
          motivo: motivo.trim(),
          confirmar: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setErro(data?.error || "Falha ao aplicar.");
        return;
      }
      setResultado({
        afetados: data.afetados,
        abertas: data.abertas,
        jaAbertas: data.jaAbertas,
        avisos: data.avisos,
        erros: data.erros,
        truncado: data.truncado,
      });
      invalidarPreview();
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link href="/admin" className="text-sm text-brand-golddark hover:underline">
          ← Voltar para o painel
        </Link>
      </div>

      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">
          Ação em lote · só Gestor
        </p>
        <h1 className="mt-1 font-serif text-3xl text-brand">Força maior coletiva</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Aplica em lote a pausa de cobrança (processo E8) e a comunicação padronizada aos clientes
          de um destino (e período, se informado). Não adia nem cancela — cada caso segue depois
          para adiar ou cancelar conforme a escolha do cliente.
        </p>
      </header>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-neutral-500">Destino</span>
            {destinos.length > 0 ? (
              <select
                value={destino}
                onChange={(e) => {
                  setDestino(e.target.value);
                  invalidarPreview();
                }}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              >
                {destinos.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={destino}
                onChange={(e) => {
                  setDestino(e.target.value);
                  invalidarPreview();
                }}
                placeholder="slug do destino (ex.: canada)"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              />
            )}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-neutral-500">Início de (opcional)</span>
              <input
                type="date"
                value={inicioDe}
                onChange={(e) => {
                  setInicioDe(e.target.value);
                  invalidarPreview();
                }}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-500">Início até (opcional)</span>
              <input
                type="date"
                value={inicioAte}
                onChange={(e) => {
                  setInicioAte(e.target.value);
                  invalidarPreview();
                }}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={preVisualizar}
            disabled={ocupado !== null || !destino}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-brand hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ocupado === "preview" ? "Calculando…" : "Pré-visualizar"}
          </button>
          {previewValido ? (
            <span className="text-sm text-neutral-700">
              <strong className={previewCount ? "text-red-700" : ""}>{previewCount}</strong> contrato(s)
              ativo(s) serão afetados.
            </span>
          ) : null}
        </div>

        {/* Aplicar: so libera apos um preview valido do filtro atual */}
        {previewValido && (previewCount ?? 0) > 0 ? (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              Aplicar força maior a {previewCount} contrato(s)
            </p>
            <p className="mt-1 text-xs text-red-700">
              Isto abre o E8 (pausa a cobrança) e envia a comunicação padronizada a cada titular.
              Ação registrada na trilha. Requer justificativa.
            </p>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Justificativa (ex.: fronteira fechada no destino a partir de …)"
              className="mt-2 w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={aplicar}
              disabled={ocupado !== null || !motivo.trim()}
              className="mt-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ocupado === "aplicar" ? "Aplicando…" : "Aplicar força maior"}
            </button>
          </div>
        ) : null}

        {erro ? <p className="mt-3 text-sm text-red-600">{erro}</p> : null}

        {resultado ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Força maior aplicada.</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              <li>Contratos processados: {resultado.afetados}</li>
              <li>E8 abertas agora: {resultado.abertas}</li>
              <li>Já estavam em E8: {resultado.jaAbertas}</li>
              <li>Comunicações enviadas: {resultado.avisos}</li>
              {resultado.erros > 0 ? <li className="text-red-700">Erros: {resultado.erros}</li> : null}
              {resultado.truncado ? (
                <li className="text-brand-golddark">
                  Coorte maior que o teto por execução — aplique de novo para o restante.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
