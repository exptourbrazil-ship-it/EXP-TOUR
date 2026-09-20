"use client";

// Favicon e redes sociais da escola — os dois aparecem na PROPOSTA do
// estudante: o favicon ao lado do nome da escola, as redes como ícones
// clicáveis. Por isso o servidor recusa endereço que não seja da rede
// indicada; aqui a mensagem só repete o motivo.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REDES, REDE_LABEL, type Rede } from "@/lib/redes-sociais";

export type MarcaInicial = {
  faviconUrl: string | null;
  social: { rede: Rede; url: string }[];
};

export default function MarcaEditor({
  supplierId,
  inicial,
}: {
  supplierId: string;
  inicial: MarcaInicial;
}) {
  const router = useRouter();
  const [favicon, setFavicon] = useState(inicial.faviconUrl ?? "");
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of REDES) m[r] = inicial.social.find((s) => s.rede === r)?.url ?? "";
    return m;
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      const res = await fetch(`/api/admin/fornecedores/${supplierId}/marca`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faviconUrl: favicon.trim(),
          social: REDES.map((rede) => ({ rede, url: urls[rede] ?? "" })).filter((r) => r.url.trim() !== ""),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || "Falha ao salvar.");
      setSalvo(true);
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-lg text-brand">Marca e redes sociais</h3>
          <p className="text-xs text-neutral-500">
            Aparecem na proposta do estudante: o ícone do site ao lado do nome da escola e as redes
            como ícones clicáveis. Deixe em branco o que a escola não tiver.
          </p>
        </div>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
        >
          {salvando ? "Salvando…" : salvo ? "Salvo ✓" : "Salvar"}
        </button>
      </div>

      {erro ? (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
      ) : null}

      <label className="mt-4 block text-sm font-medium text-brand">
        Ícone do site (favicon)
        <div className="mt-1 flex items-center gap-2">
          {favicon.trim() ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon.trim()}
              alt=""
              className="h-5 w-5 shrink-0 rounded-sm object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          ) : null}
          <input
            type="url"
            value={favicon}
            onChange={(e) => setFavicon(e.target.value)}
            placeholder="https://www.escola.com/favicon.ico"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {REDES.map((rede) => (
          <label key={rede} className="block text-sm font-medium text-brand">
            {REDE_LABEL[rede]}
            <input
              type="url"
              value={urls[rede] ?? ""}
              onChange={(e) => setUrls((s) => ({ ...s, [rede]: e.target.value }))}
              placeholder={`https://${rede === "x" ? "x.com" : rede + ".com"}/perfil-da-escola`}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-neutral-500">
        O endereço precisa ser do próprio site da rede — um link do Instagram no campo do Facebook é
        recusado, para o ícone não levar o estudante a outro lugar.
      </p>
    </div>
  );
}
