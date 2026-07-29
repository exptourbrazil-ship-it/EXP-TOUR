"use client";

import { useState } from "react";
import { TIPOS_DOCUMENTO, CATEGORIAS_DOCUMENTO } from "@/lib/documentos";

const STATUS_OPCOES = ["pendente", "aprovado", "rejeitado"];

// Tela admin de documentos: enviar um documento em nome do cliente e
// aprovar/rejeitar os documentos enviados pelo titular. A autenticacao e a
// sessao de admin (cookie) — as rotas /api/admin/documentos* aceitam esse
// cookie, entao nao ha mais senha digitada aqui.
export default function DocumentosAdminClient() {
  const [cpf, setCpf] = useState("");
  const [tipoDocumento, setTipoDocumento] = useState(TIPOS_DOCUMENTO[0].valor);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const [cpfBusca, setCpfBusca] = useState("");
  const [documentos, setDocumentos] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [atualizandoId, setAtualizandoId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) {
      setResultado("Selecione um arquivo.");
      return;
    }
    setCarregando(true);
    setResultado(null);
    try {
      const formData = new FormData();
      formData.append("cpf", cpf);
      formData.append("tipoDocumento", tipoDocumento);
      formData.append("arquivo", arquivo);
      const res = await fetch("/api/admin/documentos", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        setResultado(`Erro: ${json.error || "falha desconhecida"}`);
      } else {
        setResultado("Documento enviado com sucesso!");
      }
    } catch (err: any) {
      setResultado(`Erro: ${err.message}`);
    } finally {
      setCarregando(false);
    }
  }

  async function buscarDocumentos(e: React.FormEvent) {
    e.preventDefault();
    setBuscando(true);
    setErroBusca(null);
    setDocumentos([]);
    try {
      const res = await fetch(`/api/admin/documentos/listar?cpf=${encodeURIComponent(cpfBusca)}`);
      const json = await res.json();
      if (!res.ok) {
        setErroBusca(json.error || "falha desconhecida");
      } else {
        setDocumentos(json.documentos || []);
      }
    } catch (err: any) {
      setErroBusca(err.message);
    } finally {
      setBuscando(false);
    }
  }

  async function alterarStatus(id: string, status: string) {
    setAtualizandoId(id);
    try {
      const res = await fetch("/api/admin/documentos/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
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

  const inputClasse = "mt-1 block w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-2xl text-brand">Adicionar documento do cliente</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Envie documentos adicionais (ou financeiros) que não vieram automaticamente do Zoho.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="text-sm font-medium text-brand">
          CPF do titular (somente números)
          <input
            type="text"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            required
            className={inputClasse}
          />
        </label>

        <label className="text-sm font-medium text-brand">
          Tipo de documento
          <select
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value)}
            className={inputClasse}
          >
            {CATEGORIAS_DOCUMENTO.map((cat) => (
              <optgroup key={cat.valor} label={cat.label}>
                {TIPOS_DOCUMENTO.filter((t) => t.categoria === cat.valor).map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-brand">
          Arquivo
          <input
            type="file"
            onChange={(e) => setArquivo(e.target.files?.[0] || null)}
            required
            className="mt-1 block w-full text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={carregando}
          className="mt-2 rounded-xl bg-brand-gold px-4 py-2.5 text-sm font-semibold text-brand transition hover:opacity-90 disabled:opacity-60"
        >
          {carregando ? "Enviando..." : "Enviar documento"}
        </button>
      </form>
      {resultado ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-neutral-700">{resultado}</p>
      ) : null}

      <hr className="my-8 border-neutral-200" />

      <h2 className="font-serif text-2xl text-brand">Aprovar ou rejeitar documentos</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Busque os documentos enviados pelo titular (CPF) e altere o status de cada um.
      </p>

      <form onSubmit={buscarDocumentos} className="mt-4 flex gap-2">
        <input
          type="text"
          value={cpfBusca}
          onChange={(e) => setCpfBusca(e.target.value)}
          placeholder="CPF do titular (somente números)"
          required
          className="flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={buscando}
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60 disabled:opacity-60"
        >
          {buscando ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {erroBusca ? <p className="mt-3 text-sm text-red-700">{erroBusca}</p> : null}

      {documentos.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {documentos.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3"
            >
              <span className="min-w-0 truncate text-sm text-brand">
                {doc.nome_arquivo}{" "}
                <span className="text-neutral-400">({doc.tipo_documento})</span>
              </span>
              <div className="flex flex-shrink-0 items-center gap-2">
                <a
                  href={`/api/admin/documentos/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
                >
                  Ver
                </a>
                <select
                  value={doc.status || "pendente"}
                  disabled={atualizandoId === doc.id}
                  onChange={(e) => alterarStatus(doc.id, e.target.value)}
                  className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                >
                  {STATUS_OPCOES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
