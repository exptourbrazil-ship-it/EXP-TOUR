"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AjusteSazonalLinha } from "@/lib/sazonal-admin-service";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const KIND_LABEL: Record<string, string> = {
  high_season: "Alta temporada",
  low_season: "Baixa temporada",
  other: "Outro ajuste",
};

function periodo(a: AjusteSazonalLinha): string {
  const p = (m: number, d: number, y: number | null) => `${d}/${MESES[m - 1]}${y ? `/${y}` : ""}`;
  return `${p(a.fromMonth, a.fromDay, a.fromYear)} a ${p(a.toMonth, a.toDay, a.toYear)}`;
}

function faixa(a: AjusteSazonalLinha): string {
  if (a.minWeeks == null && a.maxWeeks == null) return "qualquer duração";
  if (a.minWeeks != null && a.maxWeeks != null) return `${a.minWeeks} a ${a.maxWeeks} semanas`;
  if (a.minWeeks != null) return `a partir de ${a.minWeeks} semanas`;
  return `até ${a.maxWeeks} semanas`;
}

const VAZIO = {
  id: "" as string,
  name: "Alta temporada",
  kind: "high_season",
  amountPerWeek: "",
  currency: "",
  fromDay: "", fromMonth: "", fromYear: "",
  toDay: "", toMonth: "", toYear: "",
  minWeeks: "", maxWeeks: "",
};

/**
 * Ajuste sazonal (alta/baixa temporada) da acomodação, dentro de Preços & Taxas.
 * O valor é POR SEMANA e entra na cotação como LINHA SEPARADA, proporcional às
 * noites que caírem no período. Sem ano = vale todo ano, como as escolas publicam.
 */
export default function SecaoSazonal({
  productId,
  supplierId,
  moedaPadrao,
  ajustes,
}: {
  productId: string;
  supplierId?: string;
  moedaPadrao: string;
  ajustes: AjusteSazonalLinha[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<typeof VAZIO | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Record<string, string>>({});

  const abrirNovo = () => {
    setErro(null); setFalhas({});
    setForm({ ...VAZIO, currency: moedaPadrao });
  };
  const abrirEdicao = (a: AjusteSazonalLinha) => {
    setErro(null); setFalhas({});
    setForm({
      id: a.id,
      name: a.name,
      kind: a.kind,
      amountPerWeek: String(a.amountPerWeek),
      currency: a.currency,
      fromDay: String(a.fromDay), fromMonth: String(a.fromMonth), fromYear: a.fromYear ? String(a.fromYear) : "",
      toDay: String(a.toDay), toMonth: String(a.toMonth), toYear: a.toYear ? String(a.toYear) : "",
      minWeeks: a.minWeeks != null ? String(a.minWeeks) : "",
      maxWeeks: a.maxWeeks != null ? String(a.maxWeeks) : "",
    });
  };

  async function enviar(corpo: Record<string, unknown>) {
    setSalvando(true); setErro(null); setFalhas({});
    try {
      const resp = await fetch("/api/admin/catalog/seasonal-adjustments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...corpo, productId, ...(supplierId ? { supplierId } : {}) }),
      });
      const json = await resp.json().catch(() => null);
      if (!resp.ok) {
        setErro(json?.error?.message ?? "Não foi possível salvar.");
        const mapa: Record<string, string> = {};
        for (const f of json?.falhas ?? []) mapa[f.campo] = f.erro;
        setFalhas(mapa);
        return false;
      }
      setForm(null);
      router.refresh();
      return true;
    } catch {
      setErro("Falha de rede ao salvar.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  const salvar = () => {
    if (!form) return;
    void enviar({
      acao: "salvar",
      ...(form.id ? { id: form.id } : {}),
      name: form.name,
      kind: form.kind,
      amountPerWeek: form.amountPerWeek,
      currency: form.currency,
      fromMonth: form.fromMonth, fromDay: form.fromDay, fromYear: form.fromYear,
      toMonth: form.toMonth, toDay: form.toDay, toYear: form.toYear,
      minWeeks: form.minWeeks, maxWeeks: form.maxWeeks,
    });
  };

  const arquivar = (a: AjusteSazonalLinha) => {
    if (!confirm(`Parar de cobrar "${a.name}" (${periodo(a)})? As cotações já emitidas não mudam.`)) return;
    void enviar({ acao: "arquivar", id: a.id });
  };

  const campo = (nome: string) => (falhas[nome] ? "border-red-400" : "border-neutral-300");

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-lg text-brand">Alta e baixa temporada</h2>
          <p className="text-xs text-neutral-500">
            Valor por semana que a escola soma (ou desconta) quando a estadia cai no período. Entra na
            cotação como linha separada, proporcional às noites.
          </p>
        </div>
        {/* O botao CONTINUA visivel com o formulario aberto: e ele que mostra, pelo
            realce, qual acao abriu a janela — e clicar de novo fecha. */}
        <button
          type="button"
          onClick={() => (form ? setForm(null) : abrirNovo())}
          aria-expanded={form !== null}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream"
        >
          {form ? "Fechar" : "+ Novo ajuste"}
        </button>
      </div>

      {ajustes.some((a) => a.sourceText?.startsWith("ESTIMATIVA")) ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Os ajustes marcados como <strong>estimado</strong> têm o período projetado a partir do calendário
          do ano anterior, porque a escola ainda não publicou o novo. O valor por semana é o que ela
          praticava; as datas precisam ser conferidas antes de fechar uma venda de alta temporada.
        </p>
      ) : null}

      {ajustes.some((a) => a.doCampus) ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Os ajustes marcados como <strong>todo o campus</strong> valem para todas as acomodações desta
          escola e já são cobrados aqui. Criar outro no mesmo período faria o aluno pagar os dois.
        </p>
      ) : null}

      {ajustes.length === 0 && !form ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
          Nenhum ajuste de temporada. Sem isso, uma estadia de verão é cotada pelo preço de baixa estação.
        </p>
      ) : null}

      {ajustes.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Ajuste</th>
                <th className="px-4 py-2">Período</th>
                <th className="px-4 py-2">Duração</th>
                <th className="px-4 py-2 text-right">Por semana</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {ajustes.map((a) => (
                <tr key={a.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">
                    <span className="font-medium text-brand">{a.name}</span>
                    {a.doCampus ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-800">
                        todo o campus
                      </span>
                    ) : null}
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-neutral-500">
                      {KIND_LABEL[a.kind] ?? a.kind}
                    </span>
                    {a.sourceText?.startsWith("ESTIMATIVA") ? (
                      // Periodo projetado por nos, nao publicado pela escola: precisa
                      // saltar aos olhos de quem cota, senao vira preco inventado.
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-800">
                        estimado
                      </span>
                    ) : null}
                    {a.sourceText ? (
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {a.sourceText.startsWith("ESTIMATIVA") ? "Origem: " : "Como a escola publicou: "}
                        {a.sourceText.replace(/^ESTIMATIVA \(a confirmar com a escola\): /, "")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">
                    {periodo(a)}
                    {a.fromYear || a.toYear ? null : <span className="ml-1 text-xs text-neutral-400">(todo ano)</span>}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{faixa(a)}</td>
                  <td className={`px-4 py-2 text-right font-medium tabular-nums ${a.amountPerWeek < 0 ? "text-emerald-700" : "text-brand"}`}>
                    {a.amountPerWeek > 0 ? "+" : "−"}
                    {Math.abs(a.amountPerWeek).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {a.currency}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {a.doCampus ? (
                      // Ajuste do campus e cobrado nesta acomodacao, mas pertence a
                      // escola: editar aqui mudaria o preco de todas as outras.
                      <span className="text-xs text-neutral-400">cadastrado na escola</span>
                    ) : (
                      <>
                        <button type="button" onClick={() => abrirEdicao(a)} className="font-medium text-brand-golddark hover:underline">
                          Editar
                        </button>
                        <button type="button" onClick={() => arquivar(a)} className="ml-3 text-neutral-500 hover:underline">
                          Remover
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {form ? (
        <div className="mt-4 rounded-xl border border-brand-gold/40 bg-brand-cream/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-neutral-600">Nome na cotação</span>
              <input
                id="sazonal-nome" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`w-full rounded-lg border ${campo("name")} px-3 py-2`}
                placeholder="Alta temporada"
              />
              {falhas.name ? <span className="mt-1 block text-xs text-red-700">{falhas.name}</span> : null}
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-neutral-600">Tipo</span>
              <select
                id="sazonal-tipo" value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className={`w-full rounded-lg border ${campo("kind")} px-3 py-2`}
              >
                <option value="high_season">Alta temporada (soma)</option>
                <option value="low_season">Baixa temporada (desconta)</option>
                <option value="other">Outro ajuste</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-neutral-600">
                Valor por semana {form.kind === "low_season" ? "(negativo, ex.: -30)" : ""}
              </span>
              <div className="flex gap-2">
                <input
                  id="sazonal-valor" value={form.amountPerWeek} inputMode="decimal"
                  onChange={(e) => setForm({ ...form, amountPerWeek: e.target.value })}
                  className={`w-full rounded-lg border ${campo("amountPerWeek")} px-3 py-2 tabular-nums`}
                  placeholder="40"
                />
                <input
                  id="sazonal-moeda" value={form.currency} maxLength={3}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  className={`w-20 rounded-lg border ${campo("currency")} px-3 py-2 uppercase`}
                  placeholder="EUR"
                />
              </div>
              {falhas.amountPerWeek ? <span className="mt-1 block text-xs text-red-700">{falhas.amountPerWeek}</span> : null}
              {falhas.currency ? <span className="mt-1 block text-xs text-red-700">{falhas.currency}</span> : null}
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-neutral-600">Vale para estadias de (opcional)</span>
              <div className="flex items-center gap-2">
                <input
                  id="sazonal-min" value={form.minWeeks} inputMode="numeric"
                  onChange={(e) => setForm({ ...form, minWeeks: e.target.value })}
                  className={`w-24 rounded-lg border ${campo("minWeeks")} px-3 py-2 tabular-nums`} placeholder="1"
                />
                <span className="text-neutral-500">a</span>
                <input
                  id="sazonal-max" value={form.maxWeeks} inputMode="numeric"
                  onChange={(e) => setForm({ ...form, maxWeeks: e.target.value })}
                  className={`w-24 rounded-lg border ${campo("maxWeeks")} px-3 py-2 tabular-nums`} placeholder="52"
                />
                <span className="text-neutral-500">semanas</span>
              </div>
              {falhas.maxWeeks ? <span className="mt-1 block text-xs text-red-700">{falhas.maxWeeks}</span> : null}
              {falhas.minWeeks ? <span className="mt-1 block text-xs text-red-700">{falhas.minWeeks}</span> : null}
            </label>

            <fieldset className="text-sm sm:col-span-2">
              <legend className="mb-1 text-neutral-600">
                Período — deixe o ano em branco para valer todo ano
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-neutral-500">de</span>
                <input id="sazonal-fd" value={form.fromDay} inputMode="numeric" onChange={(e) => setForm({ ...form, fromDay: e.target.value })}
                  className={`w-16 rounded-lg border ${campo("fromDay")} px-2 py-2 text-center tabular-nums`} placeholder="dia" />
                <select id="sazonal-fm" value={form.fromMonth} onChange={(e) => setForm({ ...form, fromMonth: e.target.value })}
                  className={`rounded-lg border ${campo("fromMonth")} px-2 py-2`}>
                  <option value="">mês</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <input id="sazonal-fy" value={form.fromYear} inputMode="numeric" onChange={(e) => setForm({ ...form, fromYear: e.target.value })}
                  className={`w-20 rounded-lg border ${campo("fromYear")} px-2 py-2 text-center tabular-nums`} placeholder="ano" />
                <span className="text-neutral-500">até</span>
                <input id="sazonal-td" value={form.toDay} inputMode="numeric" onChange={(e) => setForm({ ...form, toDay: e.target.value })}
                  className={`w-16 rounded-lg border ${campo("toDay")} px-2 py-2 text-center tabular-nums`} placeholder="dia" />
                <select id="sazonal-tm" value={form.toMonth} onChange={(e) => setForm({ ...form, toMonth: e.target.value })}
                  className={`rounded-lg border ${campo("toMonth")} px-2 py-2`}>
                  <option value="">mês</option>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <input id="sazonal-ty" value={form.toYear} inputMode="numeric" onChange={(e) => setForm({ ...form, toYear: e.target.value })}
                  className={`w-20 rounded-lg border ${campo("toYear")} px-2 py-2 text-center tabular-nums`} placeholder="ano" />
              </div>
              {["fromDay", "fromMonth", "fromYear", "toDay", "toMonth", "toYear"].map((k) =>
                falhas[k] ? <span key={k} className="mt-1 block text-xs text-red-700">{falhas[k]}</span> : null,
              )}
            </fieldset>
          </div>

          {erro ? <p className="mt-3 text-sm text-red-700">{erro}</p> : null}

          <div className="mt-4 flex gap-2">
            <button type="button" onClick={salvar} disabled={salvando}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-cream disabled:opacity-60">
              {salvando ? "Salvando…" : "Salvar ajuste"}
            </button>
            <button type="button" onClick={() => setForm(null)} disabled={salvando}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700">
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
