"use client";

import { useState } from "react";
import Link from "next/link";

// Painel de sincronizacao dos fornecedores (Vendors do Zoho CRM) para a tabela
// supplier. Dois botoes: pre-visualizar (dry-run, nao grava) e sincronizar de
// verdade. Usa a sessao de admin (cookie) — sem curl nem segredo.
type Amostra = {
  supplier: { display_name: string; website: string | null; country_code: string | null };
  email: string | null;
};
type Resultado =
  | { dryRun: true; totalVendors: number; mapeados: number; comEmail: number; amostra: Amostra[] }
  | { dryRun: false; totalVendors: number; suppliersUpsert: number; usersUpsert: number; semEmail: number; contratosVinculados: number; erros: string[] };

export default function FornecedoresClient() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null as string | null);
  const [resultado, setResultado] = useState(null as Resultado | null);

  async function chamar(aplicar: boolean) {
    if (aplicar && !confirm("Isto vai gravar/atualizar fornecedores e usuários no banco. Confirmar?")) return;
    setCarregando(true);
    setErro(null);
    if (!aplicar) setResultado(null);
    try {
      const res = await fetch("/api/admin/suppliers/sync-zoho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aplicar ? { dryRun: false } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao sincronizar. Confira a conexão do Zoho em Sistema.");
      } else {
        setResultado(json.resultado as Resultado);
      }
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl text-brand">Fornecedores</h1>
        <Link
          href="/admin/fornecedores/usuarios"
          className="text-sm text-neutral-500 hover:text-brand"
        >
          Usuários do portal →
        </Link>
      </div>
      <p className="mb-5 text-sm text-neutral-600">
        Importa as escolas do módulo <strong>Vendors</strong> do Zoho CRM para o portal, criando o
        acesso (usuário admin) a partir do e-mail de cada Vendor. É idempotente: rodar de novo
        atualiza, nunca duplica. Para convidar acessos à mão (escolas sem e-mail no Zoho ou um 2º
        contato), use <strong>Usuários do portal</strong>.
      </p>

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => chamar(false)}
          disabled={carregando}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-brand disabled:opacity-60"
        >
          {carregando ? "Consultando…" : "Pré-visualizar (não grava)"}
        </button>
        <button
          type="button"
          onClick={() => chamar(true)}
          disabled={carregando}
          className="rounded-lg border border-transparent bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Sincronizar de verdade
        </button>
      </div>

      {erro ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>
      ) : null}

      {resultado ? (
        resultado.dryRun ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <p className="text-sm text-brand">
              <strong>Prévia</strong> — {resultado.totalVendors} Vendors no Zoho · {resultado.mapeados}{" "}
              mapeados · {resultado.comEmail} com e-mail (viram acesso).
            </p>
            {resultado.amostra.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-neutral-400">
                    <tr>
                      <th className="py-1 pr-3">Escola</th>
                      <th className="py-1 pr-3">País</th>
                      <th className="py-1 pr-3">Site</th>
                      <th className="py-1">E-mail (acesso)</th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-700">
                    {resultado.amostra.map((a, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="py-1 pr-3">{a.supplier.display_name}</td>
                        <td className="py-1 pr-3">{a.supplier.country_code || "—"}</td>
                        <td className="py-1 pr-3">{a.supplier.website || "—"}</td>
                        <td className="py-1">{a.email || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-neutral-400">
                  Amostra (até 10). Confira se os campos vieram certos antes de sincronizar.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">Nenhum Vendor mapeável retornou do Zoho.</p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p>
              <strong>Sincronizado.</strong> {resultado.suppliersUpsert} fornecedores e{" "}
              {resultado.usersUpsert} acessos gravados/atualizados · {resultado.contratosVinculados}{" "}
              contratos vinculados · {resultado.semEmail} sem e-mail (sem acesso).
            </p>
            {resultado.erros.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                {resultado.erros.slice(0, 8).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
