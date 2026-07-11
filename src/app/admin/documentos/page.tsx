"use client";
import { useState, createElement } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO } from "@/lib/documentos";

const STATUS_OPCOES = ["pendente", "aprovado", "rejeitado"];

export default function AdminDocumentosPage() {
  const [senha, setSenha] = useState("");
  const [cpf, setCpf] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState(TIPOS_DOCUMENTO[0].valor);
  const [arquivo, setArquivo] = useState(null as File | null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null as string | null);

const [cpfBusca, setCpfBusca] = useState("");
  const [documentos, setDocumentos] = useState([] as any[]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState(null as string | null);
  const [atualizandoId, setAtualizandoId] = useState(null as string | null);

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

async function buscarDocumentos(e: any) {
  e.preventDefault();
  setBuscando(true); setErroBusca(null); setDocumentos([]);
  try {
    const res = await fetch(`/api/admin/documentos/listar?cpf=${encodeURIComponent(cpfBusca)}`, { headers: { Authorization: `Bearer ${senha}` } });
    const json = await res.json();
    if (!res.ok) { setErroBusca(json.error || "falha desconhecida"); }
    else { setDocumentos(json.documentos || []); }
  } catch (err: any) {
    setErroBusca(err.message);
  } finally {
    setBuscando(false);
  }
}

async function alterarStatus(id: string, status: string) {
  setAtualizandoId(id);
  try {
    const res = await fetch("/api/admin/documentos/status", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${senha}` }, body: JSON.stringify({ id, status }) });
    const json = await res.json();
    if (res.ok) {
      setDocumentos((docs) => docs.map((d) => (d.id === id ? { ...d, status } : d)));
    } else {
      setErroBusca(json.error || "falha ao atualizar status");
    }
  } catch (err: any) {
    setErroBusca(err.message);
  } finally {
    setAtualizandoId(null);
  }
}

return createElement(
  "main",
  { style: { maxWidth: 640, margin: "60px auto", padding: 24, fontFamily: "sans-serif" } },
  createElement("h1", { style: { fontSize: 20, marginBottom: 8 } }, "Adicionar documento do cliente"),
  createElement("p", { style: { fontSize: 14, color: "#555", marginBottom: 24 } }, "Envie documentos adicionais (ou financeiros) que nao vieram automaticamente do Zoho."),
  createElement("label", { style: { display: "block", marginBottom: 16 } }, "Senha de acesso",
                createElement("input", { type: "password", value: senha, onChange: (e: any) => setSenha(e.target.value), required: true, style: { display: "block", width: "100%", padding: 8, marginTop: 4 } })
                ),
  createElement(
    "form",
    { onSubmit: handleSubmit, style: { display: "flex", flexDirection: "column", gap: 12 } },
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
  resultado ? createElement("p", { style: { marginTop: 16, fontSize: 14, whiteSpace: "pre-wrap" } }, resultado) : null,

  createElement("hr", { style: { margin: "32px 0" } }),

  createElement("h1", { style: { fontSize: 20, marginBottom: 8 } }, "Aprovar ou rejeitar documentos do titular"),
  createElement("p", { style: { fontSize: 14, color: "#555", marginBottom: 16 } }, "Busque os documentos enviados pelo titular (CPF) e altere o status de cada um."),
  createElement(
    "form",
    { onSubmit: buscarDocumentos, style: { display: "flex", gap: 8, marginBottom: 16 } },
    createElement("input", { type: "text", value: cpfBusca, onChange: (e: any) => setCpfBusca(e.target.value), placeholder: "CPF do titular (somente numeros)", required: true, style: { flex: 1, padding: 8 } }),
    createElement("button", { type: "submit", disabled: buscando, style: { padding: "8px 16px" } }, buscando ? "Buscando..." : "Buscar")
    ),
  erroBusca ? createElement("p", { style: { fontSize: 14, color: "#b91c1c", marginBottom: 12 } }, erroBusca) : null,
  documentos.length === 0
  ? null
  : createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", gap: 8 } },
    ...documentos.map((doc) =>
      createElement(
        "div",
        { key: doc.id, style: { display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid #e5e5e5", borderRadius: 6, padding: 8 } },
        createElement("span", { style: { fontSize: 14 } }, `${doc.nome_arquivo} (${doc.tipo_documento})`),
        createElement(
          "select",
          {
            value: doc.status || "pendente",
            disabled: atualizandoId === doc.id,
            onChange: (e: any) => alterarStatus(doc.id, e.target.value),
            style: { padding: 6 },
          },
          ...STATUS_OPCOES.map((s) => createElement("option", { key: s, value: s }, s))
          )
        )
                      )
    )
  );
}
