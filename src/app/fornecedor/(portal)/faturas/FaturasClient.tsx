"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/fornecedor-i18n";
import type { StatusExibicao } from "@/lib/comissao-fatura";

type Fatura = {
  id: string;
  numero: string;
  currency: string;
  student_name: string | null;
  program_name: string | null;
  commission_amount: number | string;
  received_amount: number | string;
  saldo: number;
  due_date: string | null;
  exibicao: StatusExibicao;
  diasAtraso: number;
  school_expected_at: string | null;
  school_note: string | null;
};

const CORES: Record<StatusExibicao, { cor: string; bg: string; icone: string }> = {
  rascunho: { cor: "var(--p-muted)", bg: "#f0f0ef", icone: "✎" },
  emitida: { cor: "var(--p-accent-ink)", bg: "var(--p-accent-soft)", icone: "●" },
  enviada: { cor: "var(--p-accent-ink)", bg: "var(--p-accent-soft)", icone: "✉" },
  parcial: { cor: "var(--p-accent-ink)", bg: "var(--p-accent-soft)", icone: "◐" },
  vencida: { cor: "#b91c1c", bg: "#fde8e8", icone: "⚠" },
  paga: { cor: "var(--p-success-ink)", bg: "var(--p-success-soft)", icone: "✓" },
  cancelada: { cor: "var(--p-muted)", bg: "#f0f0ef", icone: "✕" },
};

function fmtMoeda(v: number | string, moeda: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: moeda }).format(Number(v));
  } catch {
    return `${moeda} ${Number(v).toFixed(2)}`;
  }
}
function fmtData(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

const inp = { border: "1px solid var(--p-line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, width: "100%", boxSizing: "border-box" as const };

export default function FaturasClient({ faturas, idioma }: { faturas: Fatura[]; idioma: string }) {
  const router = useRouter();
  const T = t(idioma, {
    pt: {
      vazio: "Nenhuma fatura emitida para a sua instituição.",
      fatura: "Fatura", estudante: "Estudante", comissao: "Comissão", vencimento: "Vencimento", situacao: "Situação",
      pdf: "Baixar PDF", informar: "Informar pagamento", salvar: "Salvar", cancelar: "Fechar",
      previsto: "Data prevista de pagamento", obs: "Observação (ex.: data da transferência)", saldo: "Saldo",
      atraso: (d: number) => `${d} dia(s) de atraso`, informado: "Você informou", salvoOk: "Informação enviada à EXP Tour.",
      aviso: "Esta informação avisa a EXP Tour; a fatura só é baixada quando o recebimento é confirmado.",
      status: { rascunho: "Rascunho", emitida: "Emitida", enviada: "Enviada", parcial: "Parcial", vencida: "Vencida", paga: "Paga", cancelada: "Cancelada" } as Record<StatusExibicao, string>,
    },
    en: {
      vazio: "No invoices issued to your institution.",
      fatura: "Invoice", estudante: "Student", comissao: "Commission", vencimento: "Due date", situacao: "Status",
      pdf: "Download PDF", informar: "Report payment", salvar: "Save", cancelar: "Close",
      previsto: "Expected payment date", obs: "Note (e.g. transfer date)", saldo: "Balance",
      atraso: (d: number) => `${d} day(s) overdue`, informado: "You reported", salvoOk: "Information sent to EXP Tour.",
      aviso: "This notifies EXP Tour; the invoice is only settled once the payment is confirmed on their side.",
      status: { rascunho: "Draft", emitida: "Issued", enviada: "Sent", parcial: "Partially paid", vencida: "Overdue", paga: "Paid", cancelada: "Cancelled" } as Record<StatusExibicao, string>,
    },
  });
  const locale = idioma === "pt" ? "pt-BR" : "en-US";
  const [aberta, setAberta] = useState<string | null>(null);
  const [data, setData] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar(id: string) {
    setSalvando(true); setErro(null); setOk(false);
    try {
      const res = await fetch(`/api/fornecedor/faturas/${id}/informar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedAt: data || undefined, note: nota || undefined }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) setErro(json.erro || "Error");
      else { setOk(true); setAberta(null); setData(""); setNota(""); router.refresh(); }
    } catch { setErro("Error"); }
    setSalvando(false);
  }

  if (faturas.length === 0) return <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{T.vazio}</p>;

  return (
    <div>
      {ok ? <div style={{ border: "1px solid var(--p-success-ink)", background: "var(--p-success-soft)", color: "var(--p-success-ink)", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{T.salvoOk}</div> : null}
      {erro ? <div style={{ border: "1px solid #fecaca", background: "#fde8e8", color: "#b91c1c", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>{erro}</div> : null}
      <div style={{ overflowX: "auto", border: "1px solid var(--p-line)", borderRadius: 12, background: "var(--p-surface)" }}>
        <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--p-muted)", fontSize: 12 }}>
              <th style={{ padding: "10px 14px" }}>{T.fatura}</th>
              <th style={{ padding: "10px 14px" }}>{T.estudante}</th>
              <th style={{ padding: "10px 14px", textAlign: "right" }}>{T.comissao}</th>
              <th style={{ padding: "10px 14px" }}>{T.vencimento}</th>
              <th style={{ padding: "10px 14px" }}>{T.situacao}</th>
              <th style={{ padding: "10px 14px" }}></th>
            </tr>
          </thead>
          <tbody>
            {faturas.map((f) => {
              const c = CORES[f.exibicao];
              const encerrada = f.exibicao === "paga";
              return (
                <tr key={f.id} style={{ borderTop: "1px solid var(--p-line)", verticalAlign: "top" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--p-ink)" }}>{f.numero}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div>{f.student_name || "—"}</div>
                    <div style={{ color: "var(--p-muted)", fontSize: 12 }}>{f.program_name || ""}</div>
                    {f.school_expected_at || f.school_note ? (
                      <div style={{ marginTop: 4, fontSize: 12, color: "var(--p-muted)" }}>
                        {T.informado}: {f.school_expected_at ? fmtData(f.school_expected_at) : ""}{f.school_note ? ` — “${f.school_note}”` : ""}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoeda(f.commission_amount, f.currency, locale)}
                    {Number(f.received_amount) > 0 && !encerrada ? <div style={{ color: "var(--p-muted)", fontSize: 12 }}>{T.saldo}: {fmtMoeda(f.saldo, f.currency, locale)}</div> : null}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {fmtData(f.due_date)}
                    {f.diasAtraso > 0 ? <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{T.atraso(f.diasAtraso)}</div> : null}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ color: c.cor, background: c.bg, borderRadius: 999, padding: "2px 9px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                      <span aria-hidden>{c.icone} </span>{T.status[f.exibicao]}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <a href={`/api/fornecedor/faturas/${f.id}/pdf`} style={{ border: "1px solid var(--p-line)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "var(--p-ink)", textDecoration: "none" }}>{T.pdf}</a>
                      {!encerrada ? (
                        <button type="button" onClick={() => { setAberta(aberta === f.id ? null : f.id); setErro(null); }} style={{ border: "1px solid var(--p-line)", borderRadius: 8, padding: "4px 10px", fontSize: 12, background: "var(--p-cta)", color: "var(--p-cta-fg)", cursor: "pointer" }}>{T.informar}</button>
                      ) : null}
                    </div>
                    {aberta === f.id ? (
                      <div style={{ marginTop: 8, display: "grid", gap: 6, minWidth: 240 }}>
                        <div><label style={{ fontSize: 12, color: "var(--p-muted)" }}>{T.previsto}</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inp} /></div>
                        <div><label style={{ fontSize: 12, color: "var(--p-muted)" }}>{T.obs}</label><textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={1000} style={inp} /></div>
                        <div style={{ fontSize: 11, color: "var(--p-muted)" }}>{T.aviso}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" disabled={salvando} onClick={() => void salvar(f.id)} style={{ borderRadius: 8, padding: "5px 12px", fontSize: 12, background: "var(--p-cta)", color: "var(--p-cta-fg)", border: "none", cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>{T.salvar}</button>
                          <button type="button" onClick={() => setAberta(null)} style={{ borderRadius: 8, padding: "5px 12px", fontSize: 12, background: "transparent", border: "1px solid var(--p-line)", cursor: "pointer" }}>{T.cancelar}</button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
