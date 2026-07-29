"use client";

import { useEffect, useState } from "react";

// Card de status da integracao com o Zoho. Consome GET /api/admin/zoho/status
// (que testa a renovacao do token e reporta a presenca das envs, sem valores)
// e mostra "Conectado / Desconectado" de forma amigavel, com o motivo quando
// falha. Botao para reverificar sob demanda.
type StatusZoho = {
  ok: boolean;
  conexao: { ok: boolean; erro?: string };
  envs: Record<string, boolean | string>;
};

export default function ZohoStatusCard() {
  const [status, setStatus] = useState<StatusZoho | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function verificar() {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/zoho/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok && res.status === 401) {
        setErro("Sessão expirada. Faça login novamente.");
        setStatus(null);
      } else {
        setStatus(json);
      }
    } catch (e: any) {
      setErro(e?.message || "Erro de rede.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/zoho/status", { cache: "no-store" });
        const json = await res.json();
        if (!ativo) return;
        if (!res.ok && res.status === 401) {
          setErro("Sessão expirada. Faça login novamente.");
        } else {
          setStatus(json);
        }
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro de rede.");
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const conectado = status?.conexao?.ok === true;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold text-brand">Integração Zoho</h2>
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        {carregando ? (
          <p className="text-sm text-neutral-500">Verificando…</p>
        ) : erro ? (
          <p className="text-sm text-red-700">{erro}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    conectado ? "bg-green-500" : "bg-red-500"
                  }`}
                  aria-hidden="true"
                />
                <span className="font-medium text-brand">
                  {conectado ? "Conectado" : "Desconectado"}
                </span>
              </div>
              <button
                type="button"
                onClick={verificar}
                className="rounded-xl border border-neutral-300 px-3 py-1.5 text-sm font-medium text-brand transition hover:bg-brand-cream/60"
              >
                Reverificar
              </button>
            </div>

            {!conectado && status?.conexao?.erro ? (
              <p className="mt-2 break-words text-xs text-red-600">{status.conexao.erro}</p>
            ) : null}

            {status?.envs ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(status.envs).map(([chave, valor]) => {
                  // Booleano -> presente/ausente; string (ex.: API_DOMAIN) -> mostra o valor.
                  const presente = typeof valor === "boolean" ? valor : true;
                  const rotulo = typeof valor === "boolean" ? chave : `${chave}: ${valor}`;
                  return (
                    <span
                      key={chave}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        presente ? "bg-brand/10 text-brand" : "bg-neutral-100 text-neutral-500"
                      }`}
                      title={presente ? "configurada" : "ausente"}
                    >
                      {typeof valor === "boolean" ? (presente ? "✓ " : "✕ ") : ""}
                      {rotulo}
                    </span>
                  );
                })}
              </div>
            ) : null}

            <p className="mt-3 text-xs text-neutral-400">
              Configuração das credenciais é feita no ambiente (Vercel). Documentos são espelhados
              como cópia no Contato do Zoho; o Supabase permanece a fonte de verdade.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
