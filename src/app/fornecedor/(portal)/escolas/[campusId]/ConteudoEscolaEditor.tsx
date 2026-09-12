"use client";

import { useEffect, useState } from "react";

// Editor do conteúdo de uma escola (Fase B2). Carrega/cria o rascunho via
// /api/fornecedor/campus-conteudo (acao "iniciar"), edita conteúdo por locale +
// mídia + amenities/acreditações/mix de nacionalidades, e salva/envia. Só
// editável enquanto "draft". Estilo do portal do fornecedor (tokens --p-*).

const LOCALES = ["pt-BR", "en", "es"] as const;
const LOCALE_LABEL: Record<string, string> = { "pt-BR": "Português", en: "English", es: "Español" };
const STATUS_LABEL: Record<string, { texto: string; cor: string }> = {
  draft: { texto: "Rascunho", cor: "var(--p-accent-ink)" },
  pending_admin: { texto: "Aguardando EXP Tour", cor: "#1d4ed8" },
  approved: { texto: "Publicado", cor: "var(--p-success-ink)" },
  rejected: { texto: "Devolvido", cor: "#b91c1c" },
};

type ConteudoForm = { description_html: string; highlights: string; highlights_footer: string; is_machine_translated: boolean };
type MidiaForm = { url: string; kind: string; caption: string };
type NacForm = { pais: string; percentual: string };

const box: React.CSSProperties = { border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 16 };
const inp: React.CSSProperties = { width: "100%", border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff", color: "var(--p-ink)", boxSizing: "border-box", fontFamily: "var(--p-body)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--p-muted)", marginBottom: 4 };

const arr = (v: unknown): string => (Array.isArray(v) ? v.join("\n") : "");
const vazio = (): ConteudoForm => ({ description_html: "", highlights: "", highlights_footer: "", is_machine_translated: false });

export default function ConteudoEscolaEditor({ campusId }: { campusId: string }) {
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("draft");
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<string>("pt-BR");

  const [porLocale, setPorLocale] = useState<Record<string, ConteudoForm>>(() => {
    const b: Record<string, ConteudoForm> = {};
    for (const l of LOCALES) b[l] = vazio();
    return b;
  });
  const [midias, setMidias] = useState<MidiaForm[]>([]);
  const [amenities, setAmenities] = useState("");
  const [accreditations, setAccreditations] = useState("");
  const [nacs, setNacs] = useState<NacForm[]>([]);

  const editavel = status === "draft";

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/fornecedor/campus-conteudo", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "iniciar", campusId }),
        });
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok || !j.ok) setErro(j?.erro || "Não foi possível abrir o conteúdo.");
        else hidratar(j.detalhe);
      } catch {
        if (vivo) setErro("Falha de conexão.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campusId]);

  function hidratar(det: any) {
    setId(det.id); setStatus(det.status); setRejectReason(det.rejectReason ?? null);
    const p = det.payload ?? {};
    const base: Record<string, ConteudoForm> = {};
    for (const l of LOCALES) {
      const c = (p.content ?? []).find((x: any) => x.locale === l);
      base[l] = c
        ? { description_html: c.description_html ?? "", highlights: arr(c.highlights), highlights_footer: c.highlights_footer ?? "", is_machine_translated: !!c.is_machine_translated }
        : vazio();
    }
    setPorLocale(base);
    setMidias((p.media ?? []).map((m: any) => ({ url: m.url ?? "", kind: m.kind ?? "photo", caption: m.caption ?? "" })));
    setAmenities(arr(p.amenities));
    setAccreditations(arr(p.accreditations));
    setNacs((p.nationalityMix ?? []).map((n: any) => ({ pais: n.pais ?? "", percentual: n.percentual != null ? String(n.percentual) : "" })));
  }

  function montarPayload() {
    return {
      content: LOCALES.map((l) => ({ locale: l, ...porLocale[l] })),
      media: midias.map((m, i) => ({ url: m.url, kind: m.kind || undefined, caption: m.caption || undefined, sort: i })),
      amenities, accreditations,
      nationalityMix: nacs.filter((n) => n.pais.trim()).map((n) => ({ pais: n.pais.trim(), percentual: Number(n.percentual) || 0 })),
    };
  }

  async function salvar(): Promise<boolean> {
    if (!id) return false;
    setSalvando(true); setErro(null); setOkMsg(null);
    try {
      const r = await fetch("/api/fornecedor/campus-conteudo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar", id, payload: montarPayload() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErro(j?.erro || "Não foi possível salvar."); return false; }
      setOkMsg("Rascunho salvo."); return true;
    } catch { setErro("Falha de conexão."); return false; }
    finally { setSalvando(false); }
  }

  async function enviar() {
    if (!id) return;
    const salvou = await salvar();
    if (!salvou) return;
    if (!confirm("Enviar este conteúdo para a EXP Tour aprovar? Você não poderá editar enquanto estiver em análise.")) return;
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/fornecedor/campus-conteudo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "aprovar", id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setErro(j?.erro || "Não foi possível enviar.");
      else { setStatus("pending_admin"); setOkMsg("Enviado para a EXP Tour."); }
    } catch { setErro("Falha de conexão."); }
    finally { setSalvando(false); }
  }

  if (carregando) return <p style={{ color: "var(--p-muted)", fontSize: 14 }}>Carregando…</p>;
  if (erro && !id) return <p style={{ color: "#b91c1c", fontSize: 14 }}>{erro}</p>;

  const st = STATUS_LABEL[status] || { texto: status, cor: "var(--p-muted)" };
  const c = porLocale[aba];
  const setLoc = (patch: Partial<ConteudoForm>) => setPorLocale((s) => ({ ...s, [aba]: { ...s[aba], ...patch } }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--p-muted)" }}>Status:</span>
        <span style={{ fontWeight: 700, color: st.cor, fontSize: 14 }}>{st.texto}</span>
      </div>
      {!editavel ? (
        <div style={{ ...box, background: "var(--p-page)", fontSize: 13, color: "var(--p-ink)" }}>
          {status === "pending_admin" ? "Este conteúdo está em análise pela EXP Tour."
            : status === "approved" ? "Este conteúdo já está publicado. Para alterá-lo, fale com a EXP Tour."
            : "Este conteúdo não está editável."}
        </div>
      ) : null}
      {status === "rejected" && rejectReason ? (
        <div style={{ ...box, borderColor: "#fca5a5", background: "#fef2f2", fontSize: 13, color: "#991b1b" }}>
          <strong>Devolvido pela EXP Tour:</strong> {rejectReason}
        </div>
      ) : null}
      {erro ? <div style={{ ...box, borderColor: "#fca5a5", background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>{erro}</div> : null}
      {okMsg ? <div style={{ ...box, borderColor: "#86efac", background: "#f0fdf4", color: "var(--p-success-ink)", fontSize: 14 }}>{okMsg}</div> : null}

      {/* Sobre a escola por locale */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>Sobre a escola</legend>
        <div style={{ display: "flex", gap: 6, margin: "6px 0 12px" }}>
          {LOCALES.map((l) => (
            <button key={l} type="button" onClick={() => setAba(l)}
              style={{ borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: "1px solid var(--p-line)", background: aba === l ? "var(--p-cta)" : "#fff", color: aba === l ? "var(--p-cta-fg)" : "var(--p-ink)" }}>
              {LOCALE_LABEL[l]}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>Descrição (HTML simples)</label>
          <textarea value={c.description_html} onChange={(e) => setLoc({ description_html: e.target.value })} rows={5} style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lbl}>Destaques (um por linha)</label><textarea value={c.highlights} onChange={(e) => setLoc({ highlights: e.target.value })} rows={4} style={inp} /></div>
          <div><label style={lbl}>Rodapé dos destaques</label><textarea value={c.highlights_footer} onChange={(e) => setLoc({ highlights_footer: e.target.value })} rows={4} style={inp} /></div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "var(--p-ink)" }}>
          <input type="checkbox" checked={c.is_machine_translated} onChange={(e) => setLoc({ is_machine_translated: e.target.checked })} /> Tradução automática (revisar)
        </label>
      </fieldset>

      {/* Estrutura / acreditações */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>Estrutura e acreditações</legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lbl}>Estrutura / amenities (um por linha)</label><textarea value={amenities} onChange={(e) => setAmenities(e.target.value)} rows={4} style={inp} placeholder="Wi-Fi&#10;Cafeteria&#10;Sala de informática" /></div>
          <div><label style={lbl}>Acreditações (uma por linha)</label><textarea value={accreditations} onChange={(e) => setAccreditations(e.target.value)} rows={4} style={inp} placeholder="IALC&#10;Languages Canada" /></div>
        </div>
      </fieldset>

      {/* Mix de nacionalidades */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>Mix de nacionalidades</legend>
        {nacs.length === 0 ? <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 10px" }}>Nenhuma nacionalidade informada.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {nacs.map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={n.pais} onChange={(e) => setNacs((a) => a.map((x, j) => (j === i ? { ...x, pais: e.target.value } : x)))} placeholder="País" style={{ ...inp, flex: 1 }} />
                <input value={n.percentual} onChange={(e) => setNacs((a) => a.map((x, j) => (j === i ? { ...x, percentual: e.target.value } : x)))} inputMode="decimal" placeholder="%" style={{ ...inp, width: 90 }} />
                <button type="button" onClick={() => setNacs((a) => a.filter((_, j) => j !== i))} style={{ color: "#b91c1c", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Remover</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setNacs((a) => [...a, { pais: "", percentual: "" }])}
          style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "var(--p-ink)", cursor: "pointer" }}>
          + Adicionar nacionalidade
        </button>
      </fieldset>

      {/* Mídia */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>Fotos, vídeos e brochuras</legend>
        {midias.length === 0 ? <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 10px" }}>Nenhuma mídia. Referencie por URL.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {midias.map((m, i) => (
              <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <input value={m.url} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" style={{ ...inp, flex: 1, minWidth: 180 }} />
                <select value={m.kind} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} style={{ ...inp, width: 120 }}>
                  <option value="photo">foto</option>
                  <option value="video">vídeo</option>
                  <option value="brochure">brochura</option>
                </select>
                <input value={m.caption} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} placeholder="legenda" style={{ ...inp, width: 160 }} />
                <button type="button" onClick={() => setMidias((a) => a.filter((_, j) => j !== i))} style={{ color: "#b91c1c", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Remover</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setMidias((a) => [...a, { url: "", kind: "photo", caption: "" }])}
          style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "var(--p-ink)", cursor: "pointer" }}>
          + Adicionar mídia
        </button>
      </fieldset>

      {editavel ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={salvar} disabled={salvando}
            style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "var(--p-ink)", cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
            {salvando ? "Salvando…" : "Salvar rascunho"}
          </button>
          <button type="button" onClick={enviar} disabled={salvando}
            style={{ border: "none", background: "var(--p-cta)", color: "var(--p-cta-fg)", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
            Enviar para a EXP Tour
          </button>
        </div>
      ) : null}
    </div>
  );
}
