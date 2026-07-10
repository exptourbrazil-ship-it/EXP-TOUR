"use client";
import { createElement, useState } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO, labelDoTipoDocumento } from "@/lib/documentos";

export default function DocumentosClient({ documentos }: { documentos: any[] }) {
  const [abaAtiva, setAbaAtiva] = useState("estudante");
  if (!documentos || documentos.length === 0) return null;

const abas = CATEGORIAS_DOCUMENTO.map((cat) => {
  const tipos = TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor).map((t) => t.valor);
  const grupos = tipos.map((tipo) => ({ tipo, itens: documentos.filter((d) => d.tipo_documento === tipo) })).filter((g) => g.itens.length > 0);
  return { ...cat, grupos };
}).filter((a) => a.grupos.length > 0);

if (abas.length === 0) return null;

const abaSelecionada = abas.find((a) => a.valor === abaAtiva) || abas[0];

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
                ),
    )
  ,
  createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 10 } },
    ...abaSelecionada.grupos.map((grupo) =>
      createElement(
        "div",
        { key: grupo.tipo },
        createElement("div", { style: { fontSize: 13, color: "#666", marginBottom: 4 } }, labelDoTipoDocumento(grupo.tipo)),
        ...grupo.itens.map((doc: any) =>
          createElement(
            "a",
            {
              key: doc.id,
              href: `/api/documentos/${doc.id}/download`,
              target: "_blank",
              rel: "noreferrer",
              style: { display: "block", fontSize: 14, color: "#2563eb", textDecoration: "underline", marginBottom: 2 },
            },
            doc.nome_arquivo
            )
                           )
        )
                                 )
    )
    );
}
