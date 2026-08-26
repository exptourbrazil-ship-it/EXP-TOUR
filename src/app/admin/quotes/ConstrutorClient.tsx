"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtMoeda } from "@/lib/formato";

export type ItemView = {
  id: string;
  group: string;
  name: string;
  quantity: number;
  unit: string;
  grossAmount: number;
  currency: string;
};
export type OptionView = { id: string; label: string; items: ItemView[] };
export type QuoteHeader = {
  id: string;
  reference: string;
  status: string;
  presentmentCurrency: string;
  studentName: string;
  publicToken: string | null;
  tokenRevoked: boolean;
  validUntil: string | null;
};

type SearchResult = {
  id: string;
  name: string;
  kind: string;
  campusId: string;
  visibility: string;
};

// Prévia retornada por /api/admin/catalog/price (subconjunto de PricedItem).
type Preview = {
  grossAmount: number;
  netAmount: number;
  averageUnitPrice: number;
  currency: string;
  deliveredQuantity: number;
  endDate: string;
  fees: { name: string; amount: number; currency: string }[];
  discounts: { name: string; amount: number; appliesTo: string }[];
  warnings: string[];
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  issued: "Emitida",
  viewed: "Visualizada",
  option_selected: "Opção escolhida",
  expired: "Expirada",
  cancelled: "Cancelada",
  converted: "Convertida",
};

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message || "Falha na operação.");
  }
  return json.data;
}

function totaisPorMoeda(items: ItemView[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const it of items) acc[it.currency] = (acc[it.currency] ?? 0) + it.grossAmount;
  return acc;
}

export default function ConstrutorClient({
  header,
  initialOptions,
}: {
  header: QuoteHeader;
  initialOptions: OptionView[];
}) {
  const router = useRouter();
  const options = initialOptions; // fonte = servidor; router.refresh() recarrega
  // So faz sentido emitir uma cotacao que tenha ao menos uma opcao com item.
  const temItens = options.some((o) => o.items.length > 0);
  const isDraft = header.status === "draft";

  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Painel de busca/adicao de item.
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<SearchResult[]>([]);
  const [produto, setProduto] = useState<SearchResult | null>(null);
  const [itemForm, setItemForm] = useState({ startDate: "", quantity: "1", unit: "week" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);

  function resetPanel() {
    setAddingTo(null);
    setKeyword("");
    setResultados([]);
    setProduto(null);
    setItemForm({ startDate: "", quantity: "1", unit: "week" });
    setPreview(null);
  }

  async function comBusy(fn: () => Promise<void>) {
    setBusy(true);
    setErro(null);
    try {
      await fn();
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setBusy(false);
    }
  }

  const addOption = (copyFromOptionId?: string) =>
    comBusy(async () => {
      await postJson(`/api/admin/quotes/${header.id}/options`, { copyFromOptionId });
      router.refresh();
    });

  const recalcular = () =>
    comBusy(async () => {
      await postJson(`/api/admin/quotes/${header.id}/recalculate`, {});
      router.refresh();
    });

  const emitir = () =>
    comBusy(async () => {
      await postJson(`/api/admin/quotes/${header.id}/issue`, {});
      router.refresh();
    });

  const reemitir = () =>
    comBusy(async () => {
      if (typeof window !== "undefined" && !window.confirm("Reemitir gera um NOVO link e invalida o anterior. Continuar?")) {
        return;
      }
      await postJson(`/api/admin/quotes/${header.id}/reissue`, {});
      router.refresh();
    });

  const revogar = () =>
    comBusy(async () => {
      if (typeof window !== "undefined" && !window.confirm("Revogar desativa o link do estudante. Continuar?")) {
        return;
      }
      await postJson(`/api/admin/quotes/${header.id}/revoke-token`, {});
      router.refresh();
    });

  const linkPublico =
    header.publicToken && typeof window !== "undefined"
      ? `${window.location.origin}/p/${header.publicToken}`
      : header.publicToken
        ? `/p/${header.publicToken}`
        : null;

  const copiarLink = async () => {
    if (!linkPublico) return;
    try {
      await navigator.clipboard.writeText(linkPublico);
      setErro(null);
      alert("Link copiado.");
    } catch {
      setErro("Nao foi possivel copiar o link.");
    }
  };

  async function buscar() {
    setBuscando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("keyword", keyword.trim());
      params.set("limit", "20");
      const res = await fetch(`/api/admin/catalog/search?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "Falha na busca.");
      setResultados(json.data || []);
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setBuscando(false);
    }
  }

  async function prever() {
    if (!produto) return;
    setPrevLoading(true);
    setErro(null);
    setPreview(null);
    try {
      const data = await postJson("/api/admin/catalog/price", {
        productId: produto.id,
        startDate: itemForm.startDate,
        quantity: Number(itemForm.quantity),
        unit: itemForm.unit,
      });
      setPreview(data as Preview);
    } catch (e: any) {
      setErro(e?.message || "Falha ao calcular prévia.");
    } finally {
      setPrevLoading(false);
    }
  }

  const adicionarItem = () =>
    comBusy(async () => {
      if (!produto || !addingTo) return;
      await postJson(`/api/admin/quotes/${header.id}/items`, {
        optionId: addingTo,
        productId: produto.id,
        startDate: itemForm.startDate,
        quantity: Number(itemForm.quantity),
        unit: itemForm.unit,
      });
      resetPanel();
      router.refresh();
    });

  const inputClasse =
    "mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4">
        <Link href="/admin/quotes" className="text-xs text-brand-golddark hover:underline">
          ← Voltar para cotações
        </Link>
      </div>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">
            Construtor de cotação
          </p>
          <h1 className="mt-1 font-serif text-3xl text-brand">#{header.reference}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {header.studentName}
            <span className="mx-2 text-neutral-300">•</span>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">
              {STATUS_LABEL[header.status] || header.status}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={recalcular}
            disabled={busy || !isDraft}
            className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-cream/60 disabled:opacity-50"
            title={isDraft ? "" : "Só é possível recalcular em rascunho"}
          >
            {busy ? "…" : "Recalcular"}
          </button>
          <button
            type="button"
            onClick={() => addOption()}
            disabled={busy || !isDraft}
            className="rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-50"
          >
            Adicionar opção
          </button>
          {isDraft ? (
            <button
              type="button"
              onClick={emitir}
              disabled={busy || !temItens}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              title={temItens ? "Congela o câmbio e gera o link do estudante" : "Adicione ao menos uma opção com item antes de emitir"}
            >
              {busy ? "…" : "Emitir"}
            </button>
          ) : header.status === "expired" || header.status === "cancelled" ? null : (
            <button
              type="button"
              onClick={reemitir}
              disabled={busy}
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-cream/60 disabled:opacity-50"
              title="Recongela o câmbio e gera um novo link"
            >
              Reemitir
            </button>
          )}
        </div>
      </header>

      {header.publicToken && !header.tokenRevoked ? (
        <div className="mb-4 rounded-xl border border-brand/20 bg-brand-cream/50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-golddark">
            Link do estudante
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-white px-2 py-1 text-xs text-neutral-700">
              {linkPublico}
            </code>
            <button
              type="button"
              onClick={copiarLink}
              className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-brand hover:bg-white"
            >
              Copiar
            </button>
            <a
              href={linkPublico ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-neutral-300 px-3 py-1 text-xs font-medium text-brand hover:bg-white"
            >
              Abrir
            </a>
            <button
              type="button"
              onClick={revogar}
              disabled={busy}
              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Revogar
            </button>
          </div>
          {header.validUntil ? (
            <p className="mt-1 text-[11px] text-neutral-500">Válida até {header.validUntil}.</p>
          ) : null}
        </div>
      ) : header.publicToken && header.tokenRevoked ? (
        <p className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
          O link do estudante foi revogado. Use “Reemitir” para gerar um novo.
        </p>
      ) : null}

      {!isDraft ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Esta cotação não está em rascunho: alterações exigem reemissão (Marco 5).
        </p>
      ) : null}

      {erro ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {erro}
        </p>
      ) : null}

      {options.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nenhuma opção ainda. Use “Adicionar opção” para começar.
        </p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {options.map((opt) => {
            const totais = totaisPorMoeda(opt.items);
            return (
              <section
                key={opt.id}
                className="w-80 flex-shrink-0 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="font-serif text-xl text-brand">{opt.label}</h2>
                  <button
                    type="button"
                    onClick={() => addOption(opt.id)}
                    disabled={busy || !isDraft}
                    className="rounded-lg border border-neutral-300 px-2 py-1 text-[11px] font-medium text-brand transition hover:bg-brand-cream/60 disabled:opacity-50"
                  >
                    Duplicar
                  </button>
                </div>

                {opt.items.length === 0 ? (
                  <p className="text-xs text-neutral-400">Sem itens.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {opt.items.map((it) => (
                      <li key={it.id} className="rounded-lg border border-neutral-100 bg-brand-cream/20 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-brand">{it.name}</span>
                          <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                            {it.group}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {it.quantity} {it.unit} ·{" "}
                          <span className="font-medium text-brand">
                            {fmtMoeda(it.grossAmount, it.currency)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 border-t border-neutral-100 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-golddark">
                    Total da opção
                  </p>
                  {Object.keys(totais).length === 0 ? (
                    <p className="font-serif text-lg text-brand">—</p>
                  ) : (
                    Object.entries(totais).map(([moeda, valor]) => (
                      <p key={moeda} className="font-serif text-lg text-brand">
                        {fmtMoeda(valor, moeda)}
                      </p>
                    ))
                  )}
                  <p className="mt-1 text-[11px] text-neutral-400">
                    Valor em BRL é congelado na emissão (câmbio no Marco 5).
                  </p>
                </div>

                {isDraft ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetPanel();
                      setAddingTo(opt.id);
                    }}
                    className="mt-3 w-full rounded-lg border border-brand-gold/50 px-3 py-2 text-sm font-medium text-brand-golddark transition hover:bg-brand-cream/60"
                  >
                    + Adicionar item
                  </button>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {/* Painel lateral de busca + prévia + adicionar */}
      {addingTo ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={resetPanel}>
          <div
            className="h-full w-full max-w-md animate-fade-in-up overflow-y-auto bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-serif text-2xl text-brand">Adicionar item</h3>
              <button
                type="button"
                onClick={resetPanel}
                className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
              >
                Fechar
              </button>
            </div>

            {/* Busca */}
            <div className="mb-4 flex gap-2">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") buscar();
                }}
                placeholder="Buscar produto por nome…"
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={buscar}
                disabled={buscando}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-cream transition hover:opacity-90 disabled:opacity-60"
              >
                {buscando ? "…" : "Buscar"}
              </button>
            </div>

            {!produto ? (
              <ul className="flex flex-col gap-1">
                {resultados.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setProduto(r);
                        setPreview(null);
                      }}
                      className="w-full rounded-lg border border-neutral-200 p-2 text-left transition hover:border-brand-gold/60 hover:bg-brand-cream/40"
                    >
                      <span className="text-sm font-medium text-brand">{r.name}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-neutral-400">
                        {r.kind}
                      </span>
                    </button>
                  </li>
                ))}
                {resultados.length === 0 && !buscando ? (
                  <p className="text-xs text-neutral-400">Nenhum resultado. Faça uma busca.</p>
                ) : null}
              </ul>
            ) : (
              <div>
                <div className="mb-3 rounded-lg bg-brand-cream/40 p-2">
                  <span className="text-sm font-medium text-brand">{produto.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setProduto(null);
                      setPreview(null);
                    }}
                    className="ml-2 text-[11px] text-brand-golddark hover:underline"
                  >
                    trocar
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="text-sm font-medium text-brand">
                    Início
                    <input
                      type="date"
                      value={itemForm.startDate}
                      onChange={(e) => setItemForm((f) => ({ ...f, startDate: e.target.value }))}
                      className={inputClasse}
                    />
                  </label>
                  <label className="text-sm font-medium text-brand">
                    Quantidade
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={itemForm.quantity}
                      onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
                      className={inputClasse}
                    />
                  </label>
                  <label className="text-sm font-medium text-brand">
                    Unidade
                    <select
                      value={itemForm.unit}
                      onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                      className={inputClasse}
                    >
                      <option value="week">Semana(s)</option>
                      <option value="month">Mês/Meses</option>
                      <option value="day">Dia(s)</option>
                      <option value="unit">Unidade(s)</option>
                    </select>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={prever}
                  disabled={prevLoading || !itemForm.startDate}
                  className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand-cream/60 disabled:opacity-50"
                >
                  {prevLoading ? "Calculando…" : "Calcular prévia"}
                </button>

                {preview ? (
                  <div className="mt-4 rounded-xl border border-neutral-200 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Bruto</span>
                      <span className="font-medium text-brand">
                        {fmtMoeda(preview.grossAmount, preview.currency)}
                      </span>
                    </div>
                    {preview.fees.map((f, i) => (
                      <div key={`f${i}`} className="flex justify-between text-neutral-500">
                        <span>+ {f.name}</span>
                        <span>{fmtMoeda(f.amount, f.currency)}</span>
                      </div>
                    ))}
                    {preview.discounts.map((d, i) => (
                      <div key={`d${i}`} className="flex justify-between text-brand-golddark">
                        <span>− {d.name}</span>
                        <span>{fmtMoeda(d.amount, preview.currency)}</span>
                      </div>
                    ))}
                    <div className="mt-1 flex justify-between border-t border-neutral-100 pt-1">
                      <span className="font-semibold text-brand">Líquido</span>
                      <span className="font-serif text-lg text-brand">
                        {fmtMoeda(preview.netAmount, preview.currency)}
                      </span>
                    </div>
                    {preview.warnings.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1">
                        {preview.warnings.map((w, i) => (
                          <li
                            key={`w${i}`}
                            className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
                          >
                            {w}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <button
                      type="button"
                      onClick={adicionarItem}
                      disabled={busy}
                      className="mt-3 w-full rounded-lg bg-brand-gold px-3 py-2 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60"
                    >
                      {busy ? "Adicionando…" : "Adicionar à opção"}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
