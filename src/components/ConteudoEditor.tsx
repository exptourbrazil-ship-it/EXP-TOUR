"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONTENT_LOCALES, type Falha } from "@/lib/produto-conteudo";

// Editor do CONTEUDO editorial (por locale) + MIDIA de um produto. Client
// component: monta os conjuntos e faz PUT /api/admin/produtos/[id]/conteudo
// (substitui tudo). Abas por locale (pt-BR/en/es); listas de bullets como texto
// (uma por linha). Midia por URL. Validacao real no servidor; falhas destacadas.

const LOCALE_LABEL: Record<string, string> = { "pt-BR": "Português", en: "English", es: "Español" };
const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

type ConteudoForm = { description_html: string; highlights: string; inclusions: string; exclusions: string; is_machine_translated: boolean };
type MidiaForm = { url: string; kind: string; caption: string };

function conteudoVazio(): ConteudoForm {
  return { description_html: "", highlights: "", inclusions: "", exclusions: "", is_machine_translated: false };
}

function paraForm(c: any): ConteudoForm {
  const lista = (v: any) => (Array.isArray(v) ? v.join("\n") : "");
  return {
    description_html: c?.description_html ?? "",
    highlights: lista(c?.highlights),
    inclusions: lista(c?.inclusions),
    exclusions: lista(c?.exclusions),
    is_machine_translated: !!c?.is_machine_translated,
  };
}

export default function ConteudoEditor({
  productId,
  inicialContent,
  inicialMedia,
}: {
  productId: string;
  inicialContent: any[];
  inicialMedia: any[];
}) {
  const router = useRouter();

  // Um formulario por locale suportado (preenche do inicial quando existir).
  const [porLocale, setPorLocale] = useState<Record<string, ConteudoForm>>(() => {
    const base: Record<string, ConteudoForm> = {};
    for (const l of CONTENT_LOCALES) {
      const existente = (inicialContent ?? []).find((c) => c.locale === l);
      base[l] = existente ? paraForm(existente) : conteudoVazio();
    }
    return base;
  });
  const [aba, setAba] = useState<string>(CONTENT_LOCALES[0]);
  const [midias, setMidias] = useState<MidiaForm[]>(
    (inicialMedia ?? []).map((m) => ({ url: m.url ?? "", kind: m.kind ?? "", caption: m.caption ?? "" })),
  );

  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);

  const setLocale = (l: string, patch: Partial<ConteudoForm>) => setPorLocale((s) => ({ ...s, [l]: { ...s[l], ...patch } }));
  const temFalhaMidia = (i: number) => falhas.find((f) => f.campo.startsWith(`media[${i}]`))?.erro;

  async function salvar() {
    setSalvando(true);
    setOk(false);
    setErroGeral(null);
    setFalhas([]);
    const content = CONTENT_LOCALES.map((l) => ({ locale: l, ...porLocale[l] }));
    const media = midias.map((m, i) => ({ url: m.url, kind: m.kind || undefined, caption: m.caption || undefined, sort: i }));
    try {
      const resp = await fetch(`/api/admin/produtos/${productId}/conteudo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, media }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        if (Array.isArray(json.falhas) && json.falhas.length) setFalhas(json.falhas);
        setErroGeral(json?.error?.message ?? "Não foi possível salvar o conteúdo.");
      } else {
        setOk(true);
        router.refresh();
      }
    } catch {
      setErroGeral("Falha de rede ao salvar.");
    }
    setSalvando(false);
  }

  const c = porLocale[aba];

  return (
    <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
      <legend className="px-1 font-serif text-base text-brand">Conteúdo e mídia</legend>
      <p className="mb-3 text-xs text-neutral-500">Descrição e listas por idioma (uma por linha) + imagens/vídeos por URL. É o que aparece na ficha do produto no portal.</p>

      {erroGeral ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroGeral}</div> : null}
      {ok ? <div className="mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Conteúdo salvo.</div> : null}

      {/* Abas por locale */}
      <div className="mb-3 flex gap-1">
        {CONTENT_LOCALES.map((l) => (
          <button key={l} type="button" onClick={() => setAba(l)} className={`rounded-lg px-3 py-1 text-xs font-medium ${aba === l ? "bg-brand text-brand-cream" : "border border-neutral-300 bg-white text-brand"}`}>
            {LOCALE_LABEL[l] ?? l}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-600">Descrição (HTML permitido)</label>
          <textarea value={c.description_html} onChange={(e) => setLocale(aba, { description_html: e.target.value })} rows={4} className={inp} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Destaques (um por linha)</label>
            <textarea value={c.highlights} onChange={(e) => setLocale(aba, { highlights: e.target.value })} rows={4} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Inclui (um por linha)</label>
            <textarea value={c.inclusions} onChange={(e) => setLocale(aba, { inclusions: e.target.value })} rows={4} className={inp} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Não inclui (um por linha)</label>
            <textarea value={c.exclusions} onChange={(e) => setLocale(aba, { exclusions: e.target.value })} rows={4} className={inp} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={c.is_machine_translated} onChange={(e) => setLocale(aba, { is_machine_translated: e.target.checked })} /> Tradução automática (revisar)
        </label>
      </div>

      {/* Midia */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-brand">Mídia</span>
          <button type="button" onClick={() => setMidias((a) => [...a, { url: "", kind: "image", caption: "" }])} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-brand">+ Adicionar mídia</button>
        </div>
        {midias.length === 0 ? (
          <p className="text-xs text-neutral-500">Nenhuma mídia. As imagens são referenciadas por URL (a ordem segue a lista).</p>
        ) : (
          <div className="space-y-2">
            {midias.map((m, i) => (
              <div key={i}>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={m.url} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className={`${inp} flex-1`} placeholder="https://…" />
                  <select value={m.kind} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className={`${inp} w-28`}>
                    <option value="image">imagem</option>
                    <option value="video">vídeo</option>
                    <option value="document">documento</option>
                  </select>
                  <input value={m.caption} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} className={`${inp} w-40`} placeholder="legenda" />
                  <button type="button" onClick={() => setMidias((a) => a.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remover</button>
                </div>
                {temFalhaMidia(i) ? <p className="mt-1 text-xs text-red-600">{temFalhaMidia(i)}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <button type="button" onClick={salvar} disabled={salvando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60">
          {salvando ? "Salvando…" : "Salvar conteúdo e mídia"}
        </button>
      </div>
    </fieldset>
  );
}
