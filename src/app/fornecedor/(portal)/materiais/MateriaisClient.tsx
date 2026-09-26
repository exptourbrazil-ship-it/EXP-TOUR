"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  TIPOS_MATERIAL,
  TIPO_MATERIAL_LABEL,
  IDIOMAS_MATERIAL,
  PERMISSOES_MATERIAL,
  PERMISSAO_LABEL,
  type TipoMaterial,
  type PermissaoMaterial,
} from "@/lib/material-helpers";
import { t } from "@/lib/fornecedor-i18n";

type Material = {
  id: string;
  tipo: string;
  titulo: string;
  idioma: string;
  programa: string | null;
  validade: string | null;
  permissao: string;
  nomeArquivo: string | null;
  linkUrl: string | null;
  temArquivo: boolean;
  criadoEm: string | null;
  status: string; // pendente | aprovado | rejeitado (F2: o admin publica)
  motivoRejeicao: string | null;
};

const IDIOMA_LABEL: Record<string, string> = { en: "EN", pt: "PT", es: "ES" };
const HOJE_ISO = new Date().toISOString().slice(0, 10);

const card: React.CSSProperties = { border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16 };
const inputCls: React.CSSProperties = { width: "100%", borderRadius: 8, border: "1px solid var(--p-line)", padding: "7px 9px", fontSize: 14, marginTop: 3 };
const labelCls: React.CSSProperties = { fontSize: 12, color: "var(--p-accent-ink)", fontWeight: 600 };

export default function MateriaisClient({ materiais, language }: { materiais: Material[]; language: string }) {
  const T = t(language, {
    pt: {
      abaArquivo: "Arquivo (PDF/imagem)",
      abaLink: "Link (vídeo/URL)",
      titulo: "Título",
      tituloPlaceholder: "Ex.: Brochura General English 2026",
      tipo: "Tipo",
      idioma: "Idioma",
      permissaoUso: "Permissão de uso",
      validade: "Validade (opcional)",
      programaRelacionado: "Programa relacionado (opcional)",
      programaPlaceholder: "Ex.: General English",
      arquivoLabel: "Arquivo (PDF, JPG, PNG, WEBP — até 10 MB)",
      linkLabel: "Link (YouTube/Vimeo ou outra URL)",
      linkPlaceholder: "https://…",
      avisoAprovacao: "Novos materiais (e edições) entram como",
      avisoAprovacaoDestaque: "aguardando aprovação",
      avisoAprovacaoFim: "e só ficam visíveis ao cliente depois que a equipe publicar.",
      escolhaArquivo: "Escolha um arquivo (PDF ou imagem).",
      falhaSalvar: "Falha ao salvar.",
      erroRede: "Erro de rede. Tente novamente.",
      salvando: "Salvando…",
      adicionarMaterial: "Adicionar material",
      confirmarArquivar: "Arquivar este material? Ele sai da biblioteca.",
      nenhumMaterial: "Nenhum material ainda.",
      statusPendente: "aguardando aprovação",
      statusRejeitado: "recusado",
      vencido: "vencido",
      motivoRecusa: "Motivo da recusa:",
      ajusteEnvie: "ajuste e envie novamente.",
      validadeSeparador: "validade",
      expostoCliente: "exposto ao cliente",
      usoInterno: "uso interno",
      baixar: "Baixar",
      abrirLink: "Abrir link",
      arquivar: "Arquivar",
    },
    en: {
      abaArquivo: "File (PDF/image)",
      abaLink: "Link (video/URL)",
      titulo: "Title",
      tituloPlaceholder: "E.g.: General English 2026 Brochure",
      tipo: "Type",
      idioma: "Language",
      permissaoUso: "Usage permission",
      validade: "Expiry date (optional)",
      programaRelacionado: "Related program (optional)",
      programaPlaceholder: "E.g.: General English",
      arquivoLabel: "File (PDF, JPG, PNG, WEBP — up to 10 MB)",
      linkLabel: "Link (YouTube/Vimeo or another URL)",
      linkPlaceholder: "https://…",
      avisoAprovacao: "New materials (and edits) start out as",
      avisoAprovacaoDestaque: "awaiting approval",
      avisoAprovacaoFim: "and only become visible to the client once our team publishes them.",
      escolhaArquivo: "Choose a file (PDF or image).",
      falhaSalvar: "Failed to save.",
      erroRede: "Connection error. Please try again.",
      salvando: "Saving…",
      adicionarMaterial: "Add material",
      confirmarArquivar: "Archive this material? It will leave the library.",
      nenhumMaterial: "No materials yet.",
      statusPendente: "awaiting approval",
      statusRejeitado: "returned",
      vencido: "expired",
      motivoRecusa: "Reason for return:",
      ajusteEnvie: "make adjustments and resubmit.",
      validadeSeparador: "expires",
      expostoCliente: "visible to client",
      usoInterno: "internal use",
      baixar: "Download",
      abrirLink: "Open link",
      arquivar: "Archive",
    },
  });

  // Status de aprovacao (F2). 'aprovado' = publicado (sem badge).
  const STATUS_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
    pendente: { label: T.statusPendente, bg: "#fef3c7", fg: "#92400e" },
    rejeitado: { label: T.statusRejeitado, bg: "#fde8e8", fg: "#b91c1c" },
  };

  const router = useRouter();
  const [modo, setModo] = useState<"arquivo" | "link">("arquivo");
  const [tipo, setTipo] = useState<TipoMaterial>("brochura");
  const [titulo, setTitulo] = useState("");
  const [idioma, setIdioma] = useState("en");
  const [permissao, setPermissao] = useState<PermissaoMaterial>("interno");
  const [programa, setPrograma] = useState("");
  const [validade, setValidade] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [arquivo, setArquivo] = useState(null as File | null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null as string | null);

  function limpar() {
    setTitulo(""); setPrograma(""); setValidade(""); setLinkUrl(""); setArquivo(null);
  }

  async function adicionar() {
    setOcupado(true);
    setErro(null);
    try {
      let res: Response;
      const meta = { tipo, titulo, idioma, permissao, programa, validade };
      if (modo === "arquivo") {
        if (!arquivo) { setErro(T.escolhaArquivo); return; }
        const fd = new FormData();
        Object.entries(meta).forEach(([k, v]) => fd.set(k, v));
        fd.set("arquivo", arquivo);
        res = await fetch("/api/fornecedor/materiais", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/fornecedor/materiais", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "criar_link", ...meta, linkUrl }),
        });
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) { setErro(json.erro || T.falhaSalvar); return; }
      limpar();
      router.refresh();
    } catch {
      setErro(T.erroRede);
    } finally {
      setOcupado(false);
    }
  }

  async function arquivar(id: string) {
    if (!confirm(T.confirmarArquivar)) return;
    const res = await fetch("/api/fornecedor/materiais", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "arquivar", id }),
    });
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {/* Adicionar */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["arquivo", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              style={{
                borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: modo === m ? "1px solid var(--p-cta)" : "1px solid var(--p-line)",
                background: modo === m ? "var(--p-cta)" : "#fff", color: modo === m ? "var(--p-cta-fg)" : "var(--p-accent-ink)",
              }}
            >
              {m === "arquivo" ? T.abaArquivo : T.abaLink}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelCls}>{T.titulo}</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} style={inputCls} placeholder={T.tituloPlaceholder} />
          </div>
          <div>
            <label style={labelCls}>{T.tipo}</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMaterial)} style={inputCls}>
              {TIPOS_MATERIAL.map((t) => <option key={t} value={t}>{TIPO_MATERIAL_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelCls}>{T.idioma}</label>
            <select value={idioma} onChange={(e) => setIdioma(e.target.value)} style={inputCls}>
              {IDIOMAS_MATERIAL.map((i) => <option key={i} value={i}>{IDIOMA_LABEL[i]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelCls}>{T.permissaoUso}</label>
            <select value={permissao} onChange={(e) => setPermissao(e.target.value as PermissaoMaterial)} style={inputCls}>
              {PERMISSOES_MATERIAL.map((p) => <option key={p} value={p}>{PERMISSAO_LABEL[p]}</option>)}
            </select>
          </div>
          <div>
            <label style={labelCls}>{T.validade}</label>
            <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} style={inputCls} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelCls}>{T.programaRelacionado}</label>
            <input value={programa} onChange={(e) => setPrograma(e.target.value)} style={inputCls} placeholder={T.programaPlaceholder} />
          </div>
          {modo === "arquivo" ? (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelCls}>{T.arquivoLabel}</label>
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} style={{ marginTop: 4, fontSize: 13 }} />
            </div>
          ) : (
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelCls}>{T.linkLabel}</label>
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} style={inputCls} placeholder={T.linkPlaceholder} />
            </div>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "var(--p-muted)" }}>
          {T.avisoAprovacao} <strong>{T.avisoAprovacaoDestaque}</strong> {T.avisoAprovacaoFim}
        </div>
        {erro ? <div style={{ marginTop: 10, color: "#b91c1c", fontSize: 13 }}>{erro}</div> : null}
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={adicionar}
            disabled={ocupado}
            style={{ borderRadius: 8, background: "var(--p-cta)", color: "var(--p-cta-fg)", border: "none", padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: ocupado ? 0.6 : 1 }}
          >
            {ocupado ? T.salvando : T.adicionarMaterial}
          </button>
        </div>
      </div>

      {/* Lista */}
      {materiais.length === 0 ? (
        <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.nenhumMaterial}</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {materiais.map((m) => (
            <div key={m.id} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "var(--p-ink)" }}>
                  {m.titulo}
                  {m.status && STATUS_BADGE[m.status] ? (
                    <span style={{ marginLeft: 8, background: STATUS_BADGE[m.status].bg, color: STATUS_BADGE[m.status].fg, borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 600 }}>
                      {STATUS_BADGE[m.status].label}
                    </span>
                  ) : null}
                  {m.validade && m.validade < HOJE_ISO ? (
                    <span style={{ marginLeft: 8, background: "#fde8e8", color: "#b91c1c", borderRadius: 4, padding: "1px 6px", fontSize: 11, fontWeight: 600 }}>{T.vencido}</span>
                  ) : null}
                </div>
                {m.status === "rejeitado" && m.motivoRejeicao ? (
                  <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>
                    <strong>{T.motivoRecusa}</strong> {m.motivoRejeicao} — {T.ajusteEnvie}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 2 }}>
                  {TIPO_MATERIAL_LABEL[m.tipo as TipoMaterial] || m.tipo} · {IDIOMA_LABEL[m.idioma] || m.idioma}
                  {m.programa ? ` · ${m.programa}` : ""}
                  {m.validade ? ` · ${T.validadeSeparador} ${m.validade}` : ""}
                  {" · "}
                  <span style={{ color: m.permissao === "cliente" ? "var(--p-success-ink)" : "var(--p-accent-ink)" }}>
                    {m.permissao === "cliente" ? T.expostoCliente : T.usoInterno}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                {m.temArquivo ? (
                  <a href={`/api/fornecedor/materiais/${m.id}/download`} style={{ color: "#1d4ed8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>{T.baixar}</a>
                ) : m.linkUrl ? (
                  <a href={m.linkUrl} target="_blank" rel="noreferrer noopener" style={{ color: "#1d4ed8", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>{T.abrirLink}</a>
                ) : null}
                <button type="button" onClick={() => arquivar(m.id)} style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 13, cursor: "pointer" }}>{T.arquivar}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
