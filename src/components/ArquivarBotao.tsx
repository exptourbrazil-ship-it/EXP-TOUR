"use client";

import { useState, type ReactNode } from "react";
import ArquivarModal from "./ArquivarModal";

// Botão "Arquivar" de UM registro (produto, tabela de preço ou taxa) com modal
// de confirmação. Ao abrir, consulta (opcional) a rota de impacto para montar
// avisos informativos; ao confirmar, chama DELETE e executa `aoArquivar`. O
// erro do servidor (ex.: tabela gerida por price list, produto em pacote) é
// mostrado no próprio modal e nada é arquivado.
export default function ArquivarBotao({
  rotulo = "Arquivar",
  titulo,
  descricao,
  urlArquivar,
  urlImpacto,
  avisosDoImpacto,
  aoArquivar,
  className = "text-red-700 hover:underline",
}: {
  rotulo?: string;
  titulo: string;
  descricao: ReactNode;
  urlArquivar: string;
  urlImpacto?: string;
  // Converte a resposta de impacto em avisos em português.
  avisosDoImpacto?: (data: any) => string[];
  aoArquivar: () => void;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAberto(true);
    setErro(null);
    setAvisos([]);
    if (!urlImpacto || !avisosDoImpacto) return;
    setCarregando(true);
    try {
      const res = await fetch(urlImpacto, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setAvisos(avisosDoImpacto(json.data));
      else setErro(json?.error?.message ?? "Não foi possível verificar o impacto.");
    } catch {
      setErro("Falha de rede ao verificar o impacto.");
    } finally {
      setCarregando(false);
    }
  }

  async function confirmar() {
    setExecutando(true);
    setErro(null);
    try {
      const res = await fetch(urlArquivar, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErro(json?.error?.message ?? "Não foi possível arquivar.");
        return;
      }
      setAberto(false);
      aoArquivar();
    } catch {
      setErro("Falha de rede ao arquivar.");
    } finally {
      setExecutando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={abrir} className={className}>
        {rotulo}
      </button>
      {aberto ? (
        <ArquivarModal
          titulo={titulo}
          avisos={avisos}
          erro={erro}
          carregando={carregando}
          executando={executando}
          onConfirmar={confirmar}
          onCancelar={() => setAberto(false)}
        >
          {descricao}
        </ArquivarModal>
      ) : null}
    </>
  );
}

// Avisos de impacto por tipo (textos em português).
export function avisosImpactoProduto(d: { pacotes?: string[]; cotacoesRascunho?: number }): string[] {
  const out: string[] = [];
  if (d.pacotes && d.pacotes.length > 0) {
    out.push(`é item do(s) pacote(s) ${d.pacotes.join(", ")} — o arquivamento será recusado até remover o item do pacote.`);
  }
  if (d.cotacoesRascunho && d.cotacoesRascunho > 0) {
    out.push(`${d.cotacoesRascunho} cotação(ões) em RASCUNHO usam este produto.`);
  }
  return out;
}

export function avisosImpactoTabela(d: { produtosSemTabela?: string[] }): string[] {
  const n = d.produtosSemTabela ?? [];
  if (n.length === 0) return [];
  const lista = n.slice(0, 5).join(", ") + (n.length > 5 ? ` e mais ${n.length - 5}` : "");
  return [`ao arquivar, ${n.length === 1 ? "o produto ativo" : `${n.length} produtos ativos`} ficará(ão) sem tabela de preço vigente: ${lista}.`];
}
