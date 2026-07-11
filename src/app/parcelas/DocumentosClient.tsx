"use client";
import { createElement, useState } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO, labelDoTipoDocumento } from "@/lib/documentos";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

const STATUS_COR: Record<string, string> = {
  pendente: "#b45309",
  aprovado: "#15803d",
  rejeitado: "#b91c1c",
};

function StatusBadge(status: string) {
  const chave = status || "pendente";
  const label = STATUS_LABEL[chave] || STATUS_LABEL.pendente;
  const cor = STATUS_COR[chave] || STATUS_COR.pendente;
  return createElement(
    "span",
    { style: { fontSize: 11, fontWeight: 600, color: cor, border: `1px solid ${cor}`, borderRadius: 4, padding: "1px 6px", marginLeft: 8, whiteSpace: "nowrap" } },
    label
    );
}

export default function DocumentosClient({ documentos }: { documentos: any[] }) {
  const [abaAtiva, setAbaAtiva] = useState("estudante");
  const [documentosState, setDocumentosState] = useState(documentos || []);
  const [tipoUpload, setTipoUpload] = useState({} as Record<string, string>);
  const [enviando, setEnviando] = useState(null as string | null);
  const [mensagem, setMensagem] = useState({} as Record<string, string>);

const abas = CATEGORIAS_DOCUMENTO.map((cat) => {
  const tipos = TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor);
  const grupos = tipos
  .map((tipo) => ({ tipo: tipo.valor, itens: documentosState.filter((d) => d.tipo_documento === tipo.valor) }))
  .filter((g) => g.itens.length > 0);
  return { ...cat, tipos, grupos };
});

const abaSelecionada = abas.find((a) => a.valor === abaAtiva) || abas[0];

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
      setMensagem((m) => ({ ...m, [categoria]: `Erro: ${json.error || "falha desconhecida"}` }));
    } else {
      setDocumentosState((docs) => [...docs, json.documento]);
      setMensagem((m) => ({ ...m, [categoria]: "Documento enviado com sucesso! Ele ficara pendente de aprovacao." }));
    }
  } catch (err: any) {
    setMensagem((m) => ({ ...m, [categoria]: `Erro: ${err.message}` }));
  } finally {
    setEnviando(null);
  }
}

return createElement(
  "div",
  { style: { marginBottom: 32 } },
  createElement("h2", { style: { fontSize: 18, fontWeight: 600, marginBottom: 12 } }, "Documentos"),
  createElement(
    "div",
    { style: { display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #e5e5e5", overflowX: "auto" } },
    ...abas.map((aba) =>
      createElement(
        "button",
        {
          key: aba.valor,
          onClick: () => setAbaAtiva(aba.valor),
          style: {
            padding: "8px 10px",
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
            color: abaSelecionada.valor === aba.valor ? "#2563eb" : "#666",
            borderBottom: abaSelecionada.valor === aba.valor ? "2px solid #2563eb" : "2px solid transparent",
            background: "none",
            cursor: "pointer",
          },
        },
        aba.label
        )
                )
    ),
  createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 10 } },
    abaSelecionada.grupos.length === 0
    ? createElement("p", { style: { fontSize: 13, color: "#999" } }, "Nenhum documento enviado nesta categoria ainda.")
    : null,
    ...abaSelecionada.grupos.map((grupo: any) =>
      createElement(
        "div",
        { key: grupo.tipo },
        createElement("div", { style: { fontSize: 13, color: "#666", marginBottom: 4 } }, labelDoTipoDocumento(grupo.tipo)),
        ...grupo.itens.map((doc: any) =>
          createElement(
            "div",
            { key: doc.id, style: { display: "flex", alignItems: "center", marginBottom: 2 } },
            createElement(
              "a",
              {
                href: `/api/documentos/${doc.id}/download`,
                target: "_blank",
                rel: "noreferrer",
                style: { fontSize: 14, color: "#2563eb", textDecoration: "underline" },
              },
              doc.nome_arquivo
              ),
            StatusBadge(doc.status)
            )
                           )
        )
                                 ),
    createElement(
      "div",
      { style: { marginTop: 12, padding: 12, border: "1px dashed #ccc", borderRadius: 6 } },
      createElement("div", { style: { fontSize: 13, fontWeight: 500, marginBottom: 8 } }, "Enviar novo documento"),
      createElement(
        "select",
        {
          value: tipoUpload[abaSelecionada.valor] || abaSelecionada.tipos[0]?.valor,
          onChange: (e: any) => setTipoUpload((t) => ({ ...t, [abaSelecionada.valor]: e.target.value })),
          style: { display: "block", width: "100%", padding: 8, marginBottom: 8 },
        },
        ...abaSelecionada.tipos.map((t: any) => createElement("option", { key: t.valor, value: t.valor }, t.label))
        ),
      createElement("input", {
        type: "file",
        disabled: enviando === abaSelecionada.valor,
        onChange: (e: any) => enviarArquivo(abaSelecionada.valor, abaSelecionada.tipos, e),
        style: { display: "block", width: "100%" },
      }),
      enviando === abaSelecionada.valor ? createElement("p", { style: { fontSize: 12, color: "#666", marginTop: 6 } }, "Enviando...") : null,
      mensagem[abaSelecionada.valor] ? createElement("p", { style: { fontSize: 12, marginTop: 6 } }, mensagem[abaSelecionada.valor]) : null
      )
    )
  );
}
