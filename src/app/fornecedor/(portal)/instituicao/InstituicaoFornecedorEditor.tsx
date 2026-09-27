"use client";

// "Sobre a instituição" — about + contato principal + endereço da matriz de
// `supplier.about/contact_*/hq_*`, editáveis pela própria escola via
// /api/fornecedor/instituicao (posse por sessao.supplierId, sem aprovação:
// é metadado de apresentação/contato, não conteúdo comercial). Mesmo estilo
// do portal do fornecedor (tokens --p-*) e mesmo padrão de tela da "Marca".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { textosInstituicaoFornecedor } from "@/lib/fornecedor-i18n";

export type InstituicaoInicial = {
  about: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  hqAddress: string;
  hqCity: string;
  hqCountryCode: string;
};

const box: React.CSSProperties = { border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 16 };
const inp: React.CSSProperties = { width: "100%", border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff", color: "var(--p-ink)", boxSizing: "border-box", fontFamily: "var(--p-body)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--p-muted)", marginBottom: 4 };
const secao: React.CSSProperties = { fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 14, margin: "18px 0 8px" };

export default function InstituicaoFornecedorEditor({ inicial, idioma }: { inicial: InstituicaoInicial; idioma?: string }) {
  const router = useRouter();
  const T = textosInstituicaoFornecedor(idioma);

  const [about, setAbout] = useState(inicial.about);
  const [contactName, setContactName] = useState(inicial.contactName);
  const [contactEmail, setContactEmail] = useState(inicial.contactEmail);
  const [contactPhone, setContactPhone] = useState(inicial.contactPhone);
  const [hqAddress, setHqAddress] = useState(inicial.hqAddress);
  const [hqCity, setHqCity] = useState(inicial.hqCity);
  const [hqCountryCode, setHqCountryCode] = useState(inicial.hqCountryCode);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    try {
      const res = await fetch("/api/fornecedor/instituicao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          about: about.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          hqAddress: hqAddress.trim(),
          hqCity: hqCity.trim(),
          hqCountryCode: hqCountryCode.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || T.erroGenerico);
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

      <div style={{ marginTop: 14 }}>
        <label style={lbl}>{T.about}</label>
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder={T.aboutPlaceholder}
          rows={5}
          maxLength={2000}
          style={{ ...inp, resize: "vertical" }}
        />
      </div>

      <h3 style={secao}>{T.contato}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={lbl}>{T.contactName}</label>
          <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={200} style={inp} />
        </div>
        <div>
          <label style={lbl}>{T.contactEmail}</label>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={200} style={inp} />
        </div>
        <div>
          <label style={lbl}>{T.contactPhone}</label>
          <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={200} style={inp} />
        </div>
      </div>

      <h3 style={secao}>{T.endereco}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
        <div>
          <label style={lbl}>{T.hqAddress}</label>
          <input type="text" value={hqAddress} onChange={(e) => setHqAddress(e.target.value)} maxLength={200} style={inp} />
        </div>
        <div>
          <label style={lbl}>{T.hqCity}</label>
          <input type="text" value={hqCity} onChange={(e) => setHqCity(e.target.value)} maxLength={200} style={inp} />
        </div>
        <div>
          <label style={lbl}>{T.hqCountryCode}</label>
          <input
            type="text"
            value={hqCountryCode}
            onChange={(e) => setHqCountryCode(e.target.value.toUpperCase())}
            maxLength={2}
            style={inp}
          />
        </div>
      </div>
    </div>
  );
}
