"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Previsao = {
  grossAmount: number | null;
  commissionAmount: number | null;
  netAmount: number | null;
  currency: string | null;
  dueDate: string | null;
};

// prefillFatura: só vem preenchido quando a conferência é VERDE — aí o par
// gross/net pré-preenche bruto+comissão+líquido. faturaRef: valores extraídos
// para EXIBIR como referência (inclusive divergente/indeterminado), sem tocar
// no campo.
type Fatura = { grossAmount: number | null; commissionAmount: number | null; netAmount: number | null; currency: string | null } | null;
type FaturaRef = { grossAmount: number | null; netAmount: number | null; currency: string | null; status: string } | null;

// Formulário de execução da remessa (D-30). Pré-preenche com a previsão, mas os
// valores são editáveis (o financeiro confere contra a fatura). Anexa o
// comprovante. Envia multipart para /api/admin/repasses (financeiro.gerir).
export default function RepasseExecutarClient({
  contratoId,
  previsao,
  prefillFatura,
  faturaRef,
}: {
  contratoId: string;
  previsao: Previsao;
  prefillFatura?: Fatura;
  faturaRef?: FaturaRef;
}) {
  const router = useRouter();
  // Quando a conferência é VERDE (prefillFatura), o par gross/net preenche
  // bruto+comissão+líquido de uma vez (comissão = gross − net, líquido = net).
  // Caso contrário, cai na previsão do contrato.
  const usouFatura = prefillFatura?.grossAmount != null && prefillFatura?.netAmount != null;
  const grossInicial = usouFatura ? prefillFatura!.grossAmount : previsao.grossAmount;
  const commissionInicial = usouFatura ? prefillFatura!.commissionAmount : previsao.commissionAmount;
  const netInicial = usouFatura ? prefillFatura!.netAmount : previsao.netAmount;
  const moedaInicial = (usouFatura ? prefillFatura!.currency : previsao.currency) || "";
  const [gross, setGross] = useState(grossInicial != null ? String(grossInicial) : "");
  const [commission, setCommission] = useState(commissionInicial != null ? String(commissionInicial) : "");
  const [net, setNet] = useState(netInicial != null ? String(netInicial) : "");
  const [currency, setCurrency] = useState(moedaInicial);
  const [dueDate, setDueDate] = useState(previsao.dueDate || "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [arquivo, setArquivo] = useState(null as File | null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null as string | null);
  const [ok, setOk] = useState(false);

  // Auto-calcula o líquido quando bruto/comissão mudam (o usuário ainda pode
  // sobrescrever manualmente depois).
  function recalcularLiquido(g: string, c: string) {
    const gn = Number(g);
    const cn = Number(c || "0");
    if (Number.isFinite(gn) && Number.isFinite(cn)) {
      setNet(String(Math.max(0, Math.round((gn - cn) * 100) / 100)));
    }
  }

  async function enviar() {
    if (!confirm("Registrar esta remessa como PAGA e avisar a escola? Isso é uma ação financeira.")) return;
    setOcupado(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.set("contratoId", contratoId);
      fd.set("grossAmount", gross);
      fd.set("commissionAmount", commission || "0");
      fd.set("netAmount", net);
      fd.set("currency", currency);
      if (dueDate) fd.set("dueDate", dueDate);
      if (reference) fd.set("reference", reference);
      if (notes) fd.set("notes", notes);
      if (arquivo) fd.set("comprovante", arquivo);
      const res = await fetch("/api/admin/repasses", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || "Falha ao registrar a remessa.");
        return;
      }
      setOk(true);
      setTimeout(() => router.push("/admin/contas-a-pagar"), 900);
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setOcupado(false);
    }
  }

  const inputCls = "mt-1 w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm";
  const labelCls = "block text-xs font-medium text-neutral-600";

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 font-serif text-lg text-brand">Registrar remessa</h2>
      {erro ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{erro}</div> : null}
      {ok ? <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800">Remessa registrada. Escola avisada.</div> : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Bruto</label>
          <input type="number" step="0.01" value={gross} onChange={(e) => { setGross(e.target.value); recalcularLiquido(e.target.value, commission); }} className={inputCls} />
          {faturaRef && faturaRef.status !== "conferida" && (faturaRef.grossAmount != null || faturaRef.netAmount != null) ? (
            <p className="mt-1 text-xs text-amber-700">
              Faturas (não confirmadas): gross {faturaRef.currency || ""} {faturaRef.grossAmount ?? "—"} · net {faturaRef.netAmount ?? "—"} — confira antes de usar.
            </p>
          ) : null}
        </div>
        <div>
          <label className={labelCls}>Moeda</label>
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} placeholder="CAD" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Comissão</label>
          <input type="number" step="0.01" value={commission} onChange={(e) => { setCommission(e.target.value); recalcularLiquido(gross, e.target.value); }} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Líquido (a remeter)</label>
          <input type="number" step="0.01" value={net} onChange={(e) => setNet(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Vencimento</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Referência (TED/wire)</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" className={inputCls} />
        </div>
      </div>

      <div className="mt-3">
        <label className={labelCls}>Comprovante (PDF/imagem)</label>
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="mt-1 text-sm" />
      </div>
      <div className="mt-3">
        <label className={labelCls}>Observações</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="Opcional" />
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={enviar}
          disabled={ocupado || ok}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {ocupado ? "Registrando…" : "Registrar remessa e avisar escola"}
        </button>
      </div>
    </div>
  );
}
