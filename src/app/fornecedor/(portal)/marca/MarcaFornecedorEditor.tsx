"use client";

// Marca do fornecedor (favicon + redes sociais) — mesmos dados de
// `supplier.favicon_url`/`supplier.social` que o admin edita em
// /admin/fornecedores/[id] (MarcaEditor.tsx), aqui editáveis pela própria
// escola via /api/fornecedor/marca (posse por sessao.supplierId, sem
// aprovação: é metadado de contato/branding). Estilo do portal do fornecedor
// (tokens --p-*), bilíngue via fornecedor-i18n.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REDES, type Rede } from "@/lib/redes-sociais";
import { textosMarcaFornecedor, redeLabelFornecedor } from "@/lib/fornecedor-i18n";

export type MarcaInicial = {
  faviconUrl: string | null;
  social: { rede: Rede; url: string }[];
};

const box: React.CSSProperties = { border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 16 };
const inp: React.CSSProperties = { width: "100%", border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff", color: "var(--p-ink)", boxSizing: "border-box", fontFamily: "var(--p-body)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--p-muted)", marginBottom: 4 };

export default function MarcaFornecedorEditor({ inicial, idioma }: { inicial: MarcaInicial; idioma?: string }) {
  const router = useRouter();
  const T = textosMarcaFornecedor(idioma);
  const REDE_LABEL = redeLabelFornecedor(idioma);

  const [favicon, setFavicon] = useState(inicial.faviconUrl ?? "");
  const [faviconFalhou, setFaviconFalhou] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const r of REDES) m[r] = inicial.social.find((s) => s.rede === r)?.url ?? "";
    return m;
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    setSalvo(false);
    try {
      const res = await fetch("/api/fornecedor/marca", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faviconUrl: favicon.trim(),
          social: REDES.map((rede) => ({ rede, url: urls[rede] ?? "" })).filter((r) => r.url.trim() !== ""),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || T.erroGenerico);
      if (json?.data?.faviconUrl !== undefined) {
        setFavicon(json.data.faviconUrl ?? "");
        setFaviconFalhou(false);
      }
      if (json?.data?.aviso) setAviso(json.data.aviso);
      setSalvo(true);
      router.refresh();
    } catch (e: any) {
      setErro(e?.message || T.erroGenerico);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={box}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 18, margin: 0 }}>{T.titulo}</h2>
          <p style={{ fontSize: 13, color: "var(--p-muted)", margin: "4px 0 0", maxWidth: 560 }}>{T.subtitulo}</p>
        </div>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          style={{ border: "none", background: "var(--p-cta)", color: "var(--p-cta-fg)", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: salvando ? 0.6 : 1, flexShrink: 0 }}
        >
          {salvando ? T.salvando : salvo ? T.salvo : T.salvar}
        </button>
      </div>

      {erro ? <p style={{ marginTop: 12, borderRadius: 10, border: "1px solid #fca5a5", background: "#fef2f2", padding: 10, fontSize: 13, color: "#991b1b" }}>{erro}</p> : null}
      {aviso ? <p style={{ marginTop: 12, borderRadius: 10, border: "1px solid var(--p-line)", background: "var(--p-page)", padding: 10, fontSize: 13, color: "var(--p-ink)" }}>{aviso}</p> : null}

      <div style={{ marginTop: 14 }}>
        <label style={lbl}>{T.icone}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {favicon.trim() && !faviconFalhou ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon.trim()}
              alt=""
              style={{ height: 20, width: 20, flexShrink: 0, borderRadius: 4, objectFit: "contain" }}
              onError={() => setFaviconFalhou(true)}
            />
          ) : null}
          <input
            type="url"
            value={favicon}
            onChange={(e) => { setFavicon(e.target.value); setFaviconFalhou(false); }}
            placeholder="https://www.suaescola.com/favicon.ico"
            style={inp}
          />
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {REDES.map((rede) => (
          <div key={rede}>
            <label style={lbl}>{REDE_LABEL[rede]}</label>
            <input
              type="url"
              value={urls[rede] ?? ""}
              onChange={(e) => setUrls((s) => ({ ...s, [rede]: e.target.value }))}
              placeholder={`https://${rede === "x" ? "x.com" : rede + ".com"}/perfil-da-escola`}
              style={inp}
            />
          </div>
        ))}
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: "var(--p-muted)" }}>{T.avisoValidacao}</p>
    </div>
  );
}
