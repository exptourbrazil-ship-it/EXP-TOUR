"use client";

import { useEffect, useState } from "react";
import { labelDoTipoDocumento, categoriaDoTipoDocumento } from "@/lib/documentos";
import { fmtData } from "@/lib/formato";

// Fila de aprovacao: lista os documentos pendentes de TODOS os titulares e
// permite aprovar/rejeitar direto, com link para conferir o arquivo. Carrega
// ao montar. Reusa PATCH /api/admin/documentos/status para a acao.
type DocPendente = {
  id: string;
  tipo_documento: string;
  origem: string;
  status: string;
  nome_arquivo: string;
  created_at: string;
  titular_id: string;
  titular_nome: string | null;
  titular_cpf: string | null;
  url: string | null;
};

const CAT_BADGE: Record<string, string> = {
  estudante: "bg-brand/10 text-brand",
  escola: "bg-blue-100 text-blue-700",
  financeiro: "bg-amber-100 text-amber-800",
};

const CAT_LABEL: Record<string, string> = {
  estudante: "Estudante",
  escola: "Escola",
  financeiro: "Financeiro",
};

export default function FilaDocumentos() {
  const [docs, setDocs] = useState<DocPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agindoId, setAgindoId] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/documentos/pendentes", { cache: "no-store" });
        const json = await res.json();
        if (!ativo) return;
        if (!res.ok || !json.ok) {
          setErro(json.error || "Falha ao carregar a fila.");
        } else {
          setDocs(json.documentos || []);
        }
      } catch (err: any) {
        if (ativo) setErro(err?.message || "Erro de rede.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function decidir(id: string, status: "aprovado" | "rejeitado") {
    setAgindoId(id);
    setErro(null);
    try {
      const res = await fetch("/api/admin/documentos/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (res.ok && json.ok !== false) {
        // Deixou de ser pendente: sai da fila.
        setDocs((lista) => lista.filter((d) => d.id !== id));
      } else {
        setErro(json.error || "Falha ao atualizar o documento.");
      }
    } catch (err: any) {
      setErro(err?.message || "Erro de rede.");
    } finally {
      setAgindoId(null);
    }
  }

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-serif text-2xl text-brand">Fila de aprovação</h2>
        {!carregando ? (
          <span className="rounded-full bg-brand-cream px-2.5 py-0.5 text-xs font-medium text-brand">
            {docs.length}
          </span>
        ) : null}
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Documentos enviados pelos clientes aguardando revisão. Confira o arquivo e aprove ou rejeite.
      </p>

      {erro ? (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>
      ) : null}

      {carregando ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : docs.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">Nenhum documento pendente. Tudo em dia. 🎉</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((d) => {
            const categoria = categoriaDoTipoDocumento(d.tipo_documento);
            const agindo = agindoId === d.id;
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-brand">{d.titular_nome || "(sem nome)"}</span>
                    {d.titular_cpf ? (
                      <span className="text-xs text-neutral-400">{d.titular_cpf}</span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        CAT_BADGE[categoria] || "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {CAT_LABEL[categoria] || categoria}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-700">
                    {labelDoTipoDocumento(d.tipo_documento)}
                    <span className="text-neutral-400"> — {d.nome_arquivo}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    Enviado em {fmtData(d.created_at)}
                    {d.origem === "titular" ? " pelo cliente" : d.origem === "admin" ? " pela equipe" : ""}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
                    >
                      Ver arquivo
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-400">sem arquivo</span>
                  )}
                  <button
                    type="button"
                    onClick={() => decidir(d.id, "rejeitado")}
                    disabled={agindo}
                    className="rounded-xl border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Rejeitar
                  </button>
                  <button
                    type="button"
                    onClick={() => decidir(d.id, "aprovado")}
                    disabled={agindo}
                    className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-brand-cream transition hover:opacity-90 disabled:opacity-60"
                  >
                    {agindo ? "…" : "Aprovar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
