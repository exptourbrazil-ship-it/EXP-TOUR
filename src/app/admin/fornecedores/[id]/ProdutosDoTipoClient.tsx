"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ArquivarBotao, { avisosImpactoProduto } from "@/components/ArquivarBotao";
import ArquivarModal from "@/components/ArquivarModal";
import { selecionarInativos, resumoDoLote } from "@/lib/arquivamento";
import type { ProdutoLista } from "@/lib/produto-admin-service";
import { normalizarBusca } from "@/lib/clientes";

const STATUS_LABEL: Record<string, string> = { draft: "Rascunho", active: "Ativo", inactive: "Inativo" };
const VIS_LABEL: Record<string, string> = { hidden: "Oculto", internal: "Interno", quotable: "Cotável", sellable: "Vendável" };
const SOURCE_LABEL: Record<string, string> = { internal: "Interno", supplier: "Fornecedor" };
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-red-100 text-red-700",
};
const VIS_BADGE: Record<string, string> = {
  hidden: "bg-neutral-100 text-neutral-400",
  internal: "bg-neutral-100 text-neutral-600",
  quotable: "bg-brand-gold/25 text-brand-golddark",
  sellable: "bg-emerald-100 text-emerald-700",
};

// Lista de produtos de UM tipo (Programas/Acomodação/Outros/Pacotes/Seguro) do
// fornecedor, no estilo Edvisor. Busca por nome/campus; abre o editor do produto
// (onde vivem preço, conteúdo, disponibilidade e promoções ligadas).
export default function ProdutosDoTipoClient({
  produtos,
  vazioLabel,
  editHrefBase,
  supplierId,
  kind,
}: {
  produtos: ProdutoLista[];
  vazioLabel: string;
  // Base do editor no hub (ex.: /admin/fornecedores/<id>/produto); o link vira
  // `${editHrefBase}/${produtoId}`.
  editHrefBase: string;
  // Fornecedor e tipo da aba (escopo do arquivamento e do lote).
  supplierId: string;
  kind: string;
}) {
  const router = useRouter();
  const inativos = useMemo(() => selecionarInativos(produtos, kind), [produtos, kind]);
  const [loteAberto, setLoteAberto] = useState(false);
  const [loteExecutando, setLoteExecutando] = useState(false);
  const [loteErro, setLoteErro] = useState<string | null>(null);
  const [loteResultado, setLoteResultado] = useState<{ arquivados: number; ignorados: { id: string; nome: string; motivo: string }[]; restantes: number } | null>(null);

  async function arquivarInativos() {
    setLoteExecutando(true);
    setLoteErro(null);
    try {
      const res = await fetch(`/api/admin/fornecedores/${supplierId}/produtos/arquivar-inativos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setLoteErro(json?.error?.message ?? "Não foi possível arquivar os inativos.");
        return;
      }
      setLoteResultado(json.data);
      router.refresh();
    } catch {
      setLoteErro("Falha de rede ao arquivar os inativos.");
    } finally {
      setLoteExecutando(false);
    }
  }

  function fecharLote() {
    setLoteAberto(false);
    setLoteResultado(null);
    setLoteErro(null);
  }

  const [busca, setBusca] = useState("");
  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    if (!termo) return produtos;
    return produtos.filter((p) => normalizarBusca([p.name, p.campusName].filter(Boolean).join(" ")).includes(termo));
  }, [produtos, busca]);

  if (produtos.length === 0) {
    return <p className="text-sm text-neutral-500">{vazioLabel}</p>;
  }

  return (
    <>
      {inativos.length > 0 ? (
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setLoteAberto(true)}
            className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700"
          >
            Arquivar inativos ({inativos.length})
          </button>
        </div>
      ) : null}
      {loteAberto ? (
        loteResultado ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="font-serif text-lg text-brand">Resultado</h3>
              <p className="mt-2 text-sm text-neutral-700">{loteResultado.arquivados} produto(s) arquivado(s).</p>
              {loteResultado.restantes > 0 ? (
                <p className="mt-2 text-sm text-amber-800">
                  Limite de segurança atingido: restam {loteResultado.restantes} inativo(s). Rode novamente.
                </p>
              ) : null}
              {loteResultado.ignorados.length > 0 ? (
                <div className="mt-3">
                  <p className="text-sm font-medium text-red-700">{loteResultado.ignorados.length} não arquivado(s):</p>
                  <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-xs text-neutral-700">
                    {loteResultado.ignorados.map((i) => (
                      <li key={i.id}>{i.motivo}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={fecharLote} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <ArquivarModal
            titulo={`Arquivar ${inativos.length} produto(s) inativo(s)?`}
            erro={loteErro}
            executando={loteExecutando}
            rotuloConfirmar={`Arquivar ${inativos.length}`}
            onConfirmar={arquivarInativos}
            onCancelar={fecharLote}
          >
            <p>Eles somem do catálogo e das cotações novas. Cotações já emitidas e contratos ficam como estão (histórico preservado).</p>
            <ul className="list-disc pl-5 text-xs text-neutral-600">
              {resumoDoLote(inativos).map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="text-xs text-neutral-500">
              Produtos que são item de um pacote em uso não serão arquivados (aparecem no resultado).
            </p>
          </ArquivarModal>
        )
      ) : null}
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por nome ou campus"
        className="mb-4 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm sm:max-w-md"
      />
      {filtrados.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum item para a busca.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Campus</th>
                <th className="px-4 py-2">Fonte</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Visibilidade</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {filtrados.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-brand">{p.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{p.campusName ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">{SOURCE_LABEL[p.source] ?? p.source}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VIS_BADGE[p.visibility] ?? "bg-neutral-100 text-neutral-600"}`}>
                      {VIS_LABEL[p.visibility] ?? p.visibility}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`${editHrefBase}/${p.id}`} className="font-medium text-brand-golddark hover:underline">
                      Editar →
                    </Link>
                    <span className="ml-4">
                      <ArquivarBotao
                        titulo={`Arquivar "${p.name}"?`}
                        descricao={
                          <p>
                            O produto{p.campusName ? ` (${p.campusName})` : ""} some do catálogo e das cotações novas. Cotações já emitidas e
                            contratos ficam como estão. É reversível (arquivamento, não exclusão).
                          </p>
                        }
                        urlArquivar={`/api/admin/produtos/${p.id}?supplier=${supplierId}`}
                        urlImpacto={`/api/admin/produtos/${p.id}/impacto-arquivar`}
                        avisosDoImpacto={avisosImpactoProduto}
                        aoArquivar={() => router.refresh()}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-400">
        {filtrados.length} de {produtos.length} item(ns).
      </p>
    </>
  );
}
