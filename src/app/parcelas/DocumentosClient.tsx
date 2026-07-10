"use client";
import { createElement } from "react";

const LABELS_DOCUMENTO: Record<string, string> = { carta_aceite: "Carta de Aceite da Escola", coe: "COE", passagem_aerea: "Passagem Aerea", carta_acomodacao: "Carta de Acomodacao", visto: "Visto", eta: "eTA e similares", seguro_saude: "Seguro Saude", carta_transfer: "Carta de Transfer", outro: "Outro" };

const ORDEM_DOCUMENTOS = ["carta_aceite", "coe", "passagem_aerea", "carta_acomodacao", "visto", "eta", "seguro_saude", "carta_transfer", "outro"];

export default function DocumentosClient({ documentos }: { documentos: any[] }) { if (!documentos || documentos.length === 0) return null; const porTipo = ORDEM_DOCUMENTOS.map((tipo) => ({ tipo, itens: documentos.filter((d) => d.tipo_documento === tipo) })).filter((g) => g.itens.length > 0); if (porTipo.length === 0) return null; return createElement("div", { style: { marginBottom: 32 } }, createElement("h2", { style: { fontSize: 18, fontWeight: 600, marginBottom: 12 } }, "Documentos"), createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, porTipo.map((grupo) => createElement("div", { key: grupo.tipo }, createElement("div", { style: { fontSize: 13, color: "#666", marginBottom: 4 } }, LABELS_DOCUMENTO[grupo.tipo] || grupo.tipo), grupo.itens.map((doc: any) => createElement("a", { key: doc.id, href: `/api/documentos/${doc.id}/download`, target: "_blank", rel: "noreferrer", style: { display: "block", fontSize: 14, color: "#2563eb", textDecoration: "underline", marginBottom: 2 } }, doc.nome_arquivo)))))); }
