"use client";
import { createElement, useState } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO, labelDoTipoDocumento } from "@/lib/documentos";

// Paleta da marca EXP Tour
const VERDE = "#042f1b";
const OURO = "#c9a35e";
const CREME = "#f5ead9";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Em análise",
  aprovado: "Aprovado",
  rejeitado: "Reenviar",
};

const STATUS_COR: Record<string, { texto: string; fundo: string }> = {
  pendente: { texto: "#92600a", fundo: "#fdf3d7" },
  aprovado: { texto: "#15803d", fundo: "#e4f5ea" },
  rejeitado: { texto: "#b91c1c", fundo: "#fbe6e6" },
};

function StatusBadge(status: string) {
  const chave = status || "pendente";
  const label = STATUS_LABEL[chave] || STATUS_LABEL.pendente;
  const cor = STATUS_COR[chave] || STATUS_COR.pendente;
  return createElement(
    "span",
    { style: { fontSize: 11, fontWeight: 600, color: cor.texto, background: cor.fundo, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap" } },
    label
  );
}

// Ícone de documento (SVG inline) usado em cada linha, no estilo do mockup.
function IconeArquivo() {
  return createElement(
    "div",
    { style: { flex: "0 0 auto", width: 40, height: 40, borderRadius: 10, background: CREME, display: "flex", alignItems: "center", justifyContent: "center" } },
    createElement(
      "svg",
      { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: VERDE, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
      createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
      createElement("polyline", { points: "14 2 14 8 20 8" })
    )
  );
}

export default function DocumentosClient({ documentos }: { documentos: any[] }) {
  const [documentosState, setDocumentosState] = useState(documentos || []);
  const [tipoUpload, setTipoUpload] = useState({} as Record<string, string>);
  const [enviando, setEnviando] = useState(null as string | null);
  const [mensagem, setMensagem] = useState({} as Record<string, string>);

  const secoes = CATEGORIAS_DOCUMENTO.map((cat) => {
    const tipos = TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor);
    const grupos = tipos
      .map((tipo) => ({ tipo: tipo.valor, itens: documentosState.filter((d) => d.tipo_documento === tipo.valor) }))
      .filter((g) => g.itens.length > 0);
    return { ...cat, tipos, grupos };
  });

  // Cliente só envia documentos do estudante. Escola/financeiro são inseridos pelo admin.
  function podeEnviar(categoria: string) {
    return categoria === "estudante";
  }

  async function enviarArquivo(categoria: string, tipos: any[], e: any) {
    const arquivo: File | null = e.target.files?.[0] || null;
    e.target.value = "";
    if (!arquivo) return;
    const tipoDocumento = tipoUpload[categoria] || tipos[0]?.valor;
    if (!tipoDocumento) return;

    setEnviando(categoria);
    setMensagem((m) => ({ ...m, [categoria]: "" }));
    try {
      const formData = new FormData();
      formData.append("tipoDocumento", tipoDocumento);
      formData.append("arquivo", arquivo);
      const res = await fetch("/api/documentos/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setMensagem((m) => ({ ...m, [categoria]: `Erro: ${json.error || "falha ao enviar"}` }));
      } else {
        setDocumentosState((ds) => [...ds, json.documento]);
        setMensagem((m) => ({ ...m, [categoria]: "Documento enviado com sucesso." }));
      }
    } catch (err: any) {
      setMensagem((m) => ({ ...m, [categoria]: `Erro: ${err.message}` }));
    } finally {
      setEnviando(null);
    }
  }

  function linhaDocumento(doc: any) {
    return createElement(
      "div",
      { key: doc.id, style: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #eee" } },
      IconeArquivo(),
      createElement(
        "div",
        { style: { flex: 1, minWidth: 0 } },
        createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "#1a1a1a" } }, labelDoTipoDocumento(doc.tipo_documento)),
        createElement("div", { style: { fontSize: 12, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, doc.nome_arquivo)
      ),
      StatusBadge(doc.status),
      createElement(
        "a",
        { href: `/api/documentos/${doc.id}/download`, target: "_blank", rel: "noreferrer", style: { fontSize: 13, fontWeight: 600, color: OURO, textDecoration: "none", whiteSpace: "nowrap" } },
        "Baixar"
      )
    );
  }

  function caixaUpload(secao: any) {
    return createElement(
      "div",
      { style: { marginTop: 16, padding: 14, borderRadius: 12, background: "#fafafa", border: "1px dashed #d8d8d8" } },
      createElement("div", { style: { fontSize: 13, fontWeight: 600, color: VERDE, marginBottom: 10 } }, "Enviar novo documento"),
      createElement(
        "select",
        {
          value: tipoUpload[secao.valor] || secao.tipos[0]?.valor,
          onChange: (e: any) => setTipoUpload((t) => ({ ...t, [secao.valor]: e.target.value })),
          style: { display: "block", width: "100%", padding: 10, marginBottom: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 13, background: "#fff" },
        },
        ...secao.tipos.map((t: any) => createElement("option", { key: t.valor, value: t.valor }, t.label))
      ),
      createElement("input", {
        type: "file",
        disabled: enviando === secao.valor,
        onChange: (e: any) => enviarArquivo(secao.valor, secao.tipos, e),
        style: { display: "block", width: "100%", fontSize: 13 },
      }),
      enviando === secao.valor ? createElement("p", { style: { fontSize: 12, color: "#666", marginTop: 8 } }, "Enviando...") : null,
      mensagem[secao.valor] ? createElement("p", { style: { fontSize: 12, marginTop: 8, color: VERDE } }, mensagem[secao.valor]) : null
    );
  }

  function cardSecao(secao: any) {
    const vazia = secao.grupos.length === 0;
    const subtitulo = secao.valor === "estudante"
      ? "Documentos que você envia para a EXP Tour"
      : secao.valor === "escola"
      ? "Documentos emitidos pela escola ou pela EXP Tour"
      : "Documentos financeiros do seu programa";
    return createElement(
      "div",
      { key: secao.valor, style: { background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" } },
      createElement("h2", { style: { fontFamily: "Bellefair, serif", fontSize: 20, color: VERDE, margin: 0 } }, secao.label),
      createElement("p", { style: { fontSize: 12, color: "#999", margin: "4px 0 4px" } }, subtitulo),
      vazia
        ? createElement("p", { style: { fontSize: 13, color: "#aaa", padding: "16px 0 4px" } }, "Nenhum documento por aqui ainda.")
        : createElement("div", null, ...secao.grupos.flatMap((g: any) => g.itens.map((doc: any) => linhaDocumento(doc)))),
      podeEnviar(secao.valor) ? caixaUpload(secao) : null
    );
  }

  return createElement(
    "div",
    { style: { marginBottom: 32 } },
    ...secoes.map((secao) => cardSecao(secao))
  );
}
