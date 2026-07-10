"use client";
import { useState, createElement } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO } from "@/lib/documentos";

export default function AdminDocumentosPage() {
  const [senha, setSenha] = useState("");
  const [cpf, setCpf] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState(TIPOS_DOCUMENTO[0].valor);
  const [arquivo, setArquivo] = useState(null as File | null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null as string | null);

async function handleSubmit(e: any) {
  e.preventDefault();
  if (!arquivo) { setResultado("Selecione um arquivo."); return; }
  setCarregando(true); setResultado(null);
  try {
    const formData = new FormData();
    formData.append("cpf", cpf);
    formData.append("tipoDocumento", tipoDocumento);
    formData.append("arquivo", arquivo);
    const res = await fetch("/api/admin/documentos", { method: "POST", headers: { Authorization: `Bearer ${senha}` }, body: formData });
    const json = await res.json();
    if (!res.ok) { setResultado(`Erro: ${json.error || "falha desconhecida"}`); }
    else { setResultado("Documento enviado com sucesso!"); }
  } catch (err: any) {
    setResultado(`Erro: ${err.message}`);
  } finally {
    setCarregando(false);
  }
}

return createElement(
  "main",
  { style: { maxWidth: 480, margin: "60px auto", padding: 24, fontFamily: "sans-serif" } },
  createElement("h1", { style: { fontSize: 20, marginBottom: 8 } }, "Adicionar documento do cliente"),
  createElement("p", { style: { fontSize: 14, color: "#555", marginBottom: 24 } }, "Envie documentos adicionais (ou financeiros) que nao vieram automaticamente do Zoho."),
  createElement(
    "form",
    { onSubmit: handleSubmit, style: { display: "flex", flexDirection: "column", gap: 12 } },
    createElement("label", null, "Senha de acesso",
                  createElement("input", { type: "password", value: senha, onChange: (e: any) => setSenha(e.target.value), required: true, style: { display: "block", width: "100%", padding: 8, marginTop: 4 } })
                  ), 
    createElement("label", null, "CPF do titular (somente numeros)",
                  createElement("input", { type: "text", value: cpf, onChange: (e: any) => setCpf(e.target.value), required: true, style: { display: "block", width: "100%", padding: 8, marginTop: 4 } })
                  ),
    createElement("label", null, "Tipo de documento",
                  createElement(
                    "select",
                    { value: tipoDocumento, onChange: (e: any) => setTipoDocumento(e.target.value), style: { display: "block", width: "100%", padding: 8, marginTop: 4 } },
                    ...CATEGORIAS_DOCUMENTO.map((cat) =>
                      createElement(
                        "optgroup",
                        { key: cat.valor, label: cat.label },
                        ...TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor).map((t) =>
                          createElement("option", { key: t.valor, value: t.valor }, t.label)
                                                                                        )
                        )
                                                )
                    )
                  ),
    createElement("label", null, "Arquivo",
                  createElement("input", { type: "file", onChange: (e: any) => setArquivo(e.target.files?.[0] || null), required: true, style: { display: "block", width: "100%", marginTop: 4 } })
                  ),
    createElement("button", { type: "submit", disabled: carregando, style: { padding: 10, marginTop: 8 } }, carregando ? "Enviando..." : "Enviar documento")
  ),
  resultado ? createElement("p", { style: { marginTop: 16, fontSize: 14, whiteSpace: "pre-wrap" } }, resultado) : null
  );
}
