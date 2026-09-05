"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Editor de parcelas de UM contrato pelo Admin (Caso 360). Só aparece para quem
// tem financeiro.gerir. Espelha as regras do servidor (parcelas-edit): parcela
// paga/Pix é TRAVADA — linha somente-leitura, não editável nem removível; as
// demais o operador ajusta (valor/vencimento/descrição), adiciona e remove. A
// escrita vai para PUT /api/admin/contratos/[id]/parcelas (o servidor revalida
// tudo: soma == total, regra dos 30 dias, posse por capacidade).

type ParcelaEntrada = {
  id: string;
  numero: number | null;
  descricao: string | null;
  valor_atual: number | null;
  vencimento: string | null;
  status: string;
  qr_code_url: string | null;
  external_payment_id: string | null;
};

type Linha = {
  id?: string;
  numero: number;
  descricao: string;
  valor: string; // string no form
  vencimento: string; // YYYY-MM-DD
  travada: boolean;
};

const cents = (n: number) => Math.round(n * 100);

export default function EditorParcelasContrato({
  contratoId,
  moeda,
  valorTotal,
  parcelas,
}: {
  contratoId: string;
  moeda: string;
  valorTotal: number | null;
  parcelas: ParcelaEntrada[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);

  function abrir() {
    setLinhas(
      parcelas.map((p) => ({
        id: p.id,
        numero: p.numero ?? 0,
        descricao: p.descricao ?? "",
        valor: p.valor_atual != null ? String(p.valor_atual) : "",
        vencimento: p.vencimento ?? "",
        travada: p.status === "pago" || !!p.qr_code_url || !!p.external_payment_id,
      })),
    );
    setErro(null);
    setOk(false);
    setAberto(true);
  }

  const upd = (i: number, patch: Partial<Linha>) => setLinhas((a) => a.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const remover = (i: number) => setLinhas((a) => a.filter((_, j) => j !== i));
  const proxNumero = () => (linhas.reduce((max, l) => Math.max(max, l.numero), 0) || 0) + 1;
  const adicionar = () =>
    setLinhas((a) => [...a, { numero: proxNumero(), descricao: "Nova parcela", valor: "", vencimento: "", travada: false }]);

  const soma = linhas.reduce((acc, l) => acc + (Number(l.valor) || 0), 0);
  const somaConfere = valorTotal == null || cents(soma) === cents(Number(valorTotal));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setOk(false);
    const corpo = {
      parcelas: linhas.map((l) => ({
        id: l.id,
        numero: l.numero,
        descricao: l.descricao,
        valor: Number(l.valor),
        vencimento: l.vencimento,
      })),
    };
    try {
      const resp = await fetch(`/api/admin/contratos/${contratoId}/parcelas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        setErro(json?.erro ?? "Não foi possível salvar as parcelas.");
      } else {
        setOk(true);
        setAberto(false);
        router.refresh();
      }
    } catch {
      setErro("Falha de rede ao salvar.");
    }
    setSalvando(false);
  }

  const fmt = (n: number) => `${moeda} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!aberto) {
    return (
      <div className="mt-3">
        {ok ? <span className="mr-3 text-xs text-green-700">Parcelas atualizadas.</span> : null}
        <button
          type="button"
          onClick={abrir}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-brand hover:bg-neutral-50"
        >
          Editar parcelas
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-brand-gold/40 bg-brand-cream/30 p-3">
      <p className="mb-2 text-xs text-neutral-600">
        Parcelas pagas ou com Pix gerado ficam travadas (não editáveis). Ajuste as demais; a soma precisa fechar com o total do contrato.
      </p>
      {erro ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div> : null}

      <div className="space-y-2">
        {linhas.map((l, i) => (
          <div key={l.id ?? `nova-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2">
            <input
              type="number"
              value={l.numero}
              onChange={(e) => upd(i, { numero: Number(e.target.value) })}
              disabled={l.travada}
              className="w-14 rounded border border-neutral-200 p-1.5 text-sm disabled:bg-neutral-100"
              aria-label="Número"
            />
            <input
              value={l.descricao}
              onChange={(e) => upd(i, { descricao: e.target.value })}
              disabled={l.travada}
              placeholder="Descrição"
              className="min-w-[8rem] flex-1 rounded border border-neutral-200 p-1.5 text-sm disabled:bg-neutral-100"
            />
            <input
              type="date"
              value={l.vencimento}
              onChange={(e) => upd(i, { vencimento: e.target.value })}
              disabled={l.travada}
              className="rounded border border-neutral-200 p-1.5 text-sm disabled:bg-neutral-100"
            />
            <input
              type="number"
              step="0.01"
              value={l.valor}
              onChange={(e) => upd(i, { valor: e.target.value })}
              disabled={l.travada}
              placeholder="Valor"
              className="w-28 rounded border border-neutral-200 p-1.5 text-right text-sm disabled:bg-neutral-100"
            />
            {l.travada ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-brand-golddark">travada</span>
            ) : (
              <button type="button" onClick={() => remover(i)} className="text-xs text-red-600 hover:underline">
                Remover
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={adicionar} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-brand">
          + Adicionar parcela
        </button>
        <span className={`text-xs ${somaConfere ? "text-neutral-500" : "text-red-600"}`}>
          Soma: {fmt(soma)}
          {valorTotal != null ? ` / total ${fmt(Number(valorTotal))}` : ""}
          {!somaConfere ? " — precisa fechar" : ""}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || !somaConfere}
          title={!somaConfere ? "A soma precisa fechar com o total do contrato" : undefined}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar parcelas"}
        </button>
        <button type="button" onClick={() => setAberto(false)} disabled={salvando} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 disabled:opacity-60">
          Cancelar
        </button>
      </div>
    </div>
  );
}
