"use client";

import { useState } from "react";
import { textosContaBancariaFornecedor } from "@/lib/fornecedor-i18n";

type StatusContaBancaria = "pending_admin" | "confirmed" | "rejected" | "superseded";

type ContaBancaria = {
  id: string;
  status: StatusContaBancaria;
  accountHolderName: string;
  bankName: string | null;
  countryCode: string | null;
  currency: string | null;
  iban: string | null;
  swiftBic: string | null;
  accountNumber: string | null;
  routingCode: string | null;
  pixKey: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
};

type Falha = { campo: string; erro: string };

type Form = {
  accountHolderName: string;
  bankName: string;
  countryCode: string;
  currency: string;
  iban: string;
  swiftBic: string;
  accountNumber: string;
  routingCode: string;
  pixKey: string;
  notes: string;
};

const FORM_VAZIO: Form = {
  accountHolderName: "",
  bankName: "",
  countryCode: "",
  currency: "",
  iban: "",
  swiftBic: "",
  accountNumber: "",
  routingCode: "",
  pixKey: "",
  notes: "",
};

function paraForm(c: ContaBancaria): Form {
  return {
    accountHolderName: c.accountHolderName || "",
    bankName: c.bankName || "",
    countryCode: c.countryCode || "",
    currency: c.currency || "",
    iban: c.iban || "",
    swiftBic: c.swiftBic || "",
    accountNumber: c.accountNumber || "",
    routingCode: c.routingCode || "",
    pixKey: c.pixKey || "",
    notes: c.notes || "",
  };
}

const STATUS_COR: Record<StatusContaBancaria, { cor: string; bg: string }> = {
  pending_admin: { cor: "#1d4ed8", bg: "#eff6ff" },
  confirmed: { cor: "var(--p-success-ink)", bg: "var(--p-success-soft)" },
  rejected: { cor: "#b91c1c", bg: "#fde8e8" },
  superseded: { cor: "var(--p-muted)", bg: "#f0f0ef" },
};

// Secao "Dados bancarios" (aba Financeiro): o fornecedor PROPOE a conta de
// destino do repasse; a proposta so vale depois que a EXP Tour confirmar
// manualmente (nunca automatico — dinheiro pro lugar errado e prejuizo real).
// Mostra a conta CONFIRMADA (se houver), a proposta PENDENTE (se houver, com
// formulario editavel) e permite propor uma alteracao a partir da confirmada.
export default function ContaBancariaFornecedorClient({
  idioma,
  contasIniciais,
}: {
  idioma: string | null | undefined;
  contasIniciais: ContaBancaria[];
}) {
  const T = textosContaBancariaFornecedor(idioma);
  const [contas, setContas] = useState(contasIniciais);
  const confirmada = contas.find((c) => c.status === "confirmed") ?? null;
  const pendente = contas.find((c) => c.status === "pending_admin") ?? null;
  const ultimaRejeitada =
    !pendente && !confirmada
      ? contas.find((c) => c.status === "rejected") ?? null
      : null;

  const [editando, setEditando] = useState(false);
  const [f, setF] = useState<Form>(pendente ? paraForm(pendente) : confirmada ? paraForm(confirmada) : FORM_VAZIO);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [ok, setOk] = useState<string | null>(null);

  const set = (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v }));
  const falhaDe = (campo: string) => falhas.find((x) => x.campo === campo)?.erro;

  function abrirEdicao() {
    setF(pendente ? paraForm(pendente) : confirmada ? paraForm(confirmada) : FORM_VAZIO);
    setErro(null);
    setFalhas([]);
    setOk(null);
    setEditando(true);
  }

  async function enviar() {
    setOcupado(true);
    setErro(null);
    setFalhas([]);
    setOk(null);
    try {
      const res = await fetch("/api/fornecedor/conta-bancaria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrada: f }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setErro(json.erro || T.erroGenerico);
        setFalhas(Array.isArray(json.falhas) ? json.falhas : []);
        return;
      }
      // Recarrega o historico (GET) para refletir o novo estado sem reload de pagina.
      const r2 = await fetch("/api/fornecedor/conta-bancaria");
      const j2 = await r2.json().catch(() => ({}));
      if (r2.ok && j2.ok && Array.isArray(j2.contas)) setContas(j2.contas);
      setOk(T.sucessoEnviada);
      setEditando(false);
    } catch {
      setErro(T.falhaConexao);
    } finally {
      setOcupado(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border px-2.5 py-1.5 text-sm";
  const Campo = ({ campo, label, children }: { campo: string; label: string; children: React.ReactNode }) => (
    <label className="block">
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--p-muted)" }}>{label}</span>
      {children}
      {falhaDe(campo) ? <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "#b91c1c" }}>{falhaDe(campo)}</span> : null}
    </label>
  );

  return (
    <div>
      <h2 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 20, margin: "0 0 4px" }}>{T.titulo}</h2>
      <p style={{ color: "var(--p-ink)", opacity: 0.75, fontSize: 13, margin: "0 0 16px" }}>{T.subtitulo}</p>

      {confirmada && !editando ? (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)" }}>{T.contaConfirmadaAtual}</span>
            <StatusBadge status="confirmed" T={T} />
          </div>
          <ResumoConta c={confirmada} />
          <p style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 10 }}>{T.avisoConfirmada}</p>
        </div>
      ) : null}

      {pendente && !editando ? (
        <div style={{ border: "1px solid #bfdbfe", borderRadius: 12, background: "#eff6ff", padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--p-ink)" }}>{T.propostaPendente}</span>
            <StatusBadge status="pending_admin" T={T} />
          </div>
          <ResumoConta c={pendente} />
          <p style={{ fontSize: 12, color: "#1d4ed8", marginTop: 10 }}>{T.avisoPendente}</p>
        </div>
      ) : null}

      {ultimaRejeitada ? (
        <div style={{ border: "1px solid #fecaca", borderRadius: 12, background: "#fde8e8", padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <StatusBadge status="rejected" T={T} />
          </div>
          <ResumoConta c={ultimaRejeitada} />
          {ultimaRejeitada.rejectionReason ? (
            <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 10 }}>
              <strong>{T.motivoRejeicao}</strong> {ultimaRejeitada.rejectionReason}
            </p>
          ) : null}
        </div>
      ) : null}

      {!confirmada && !pendente && !ultimaRejeitada && !editando ? (
        <p style={{ color: "var(--p-muted)", fontSize: 13, marginBottom: 12 }}>{T.semDados}</p>
      ) : null}

      {!editando ? (
        <button
          type="button"
          onClick={abrirEdicao}
          style={{
            borderRadius: 8,
            background: pendente ? "#fff" : "var(--p-accent-ink, #b45309)",
            color: pendente ? "var(--p-ink)" : "#fff",
            border: pendente ? "1px solid var(--p-line)" : "none",
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {pendente ? T.editarProposta : T.propor}
        </button>
      ) : (
        <div style={{ border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16 }}>
          {erro ? (
            <div style={{ marginBottom: 12, borderRadius: 8, border: "1px solid #fecaca", background: "#fde8e8", padding: 10, fontSize: 13, color: "#b91c1c" }}>
              {erro}
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <Campo campo="accountHolderName" label={T.titular}>
                <input className={input} style={{ borderColor: "var(--p-line)" }} value={f.accountHolderName} onChange={(e) => set("accountHolderName", e.target.value)} />
              </Campo>
            </div>
            <Campo campo="bankName" label={T.banco}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} value={f.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </Campo>
            <Campo campo="countryCode" label={T.pais}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} maxLength={2} value={f.countryCode} onChange={(e) => set("countryCode", e.target.value.toUpperCase())} />
            </Campo>
            <Campo campo="currency" label={T.moeda}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} maxLength={3} value={f.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </Campo>
            <Campo campo="iban" label={T.iban}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} value={f.iban} onChange={(e) => set("iban", e.target.value)} />
            </Campo>
            <Campo campo="swiftBic" label={T.swift}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} value={f.swiftBic} onChange={(e) => set("swiftBic", e.target.value)} />
            </Campo>
            <Campo campo="accountNumber" label={T.conta}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} value={f.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
            </Campo>
            <Campo campo="routingCode" label={T.routing}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} value={f.routingCode} onChange={(e) => set("routingCode", e.target.value)} />
            </Campo>
            <Campo campo="pixKey" label={T.pix}>
              <input className={input} style={{ borderColor: "var(--p-line)" }} value={f.pixKey} onChange={(e) => set("pixKey", e.target.value)} />
            </Campo>
            <div style={{ gridColumn: "1 / -1" }}>
              <Campo campo="notes" label={T.observacoes}>
                <textarea
                  className={input}
                  style={{ borderColor: "var(--p-line)" }}
                  rows={2}
                  placeholder={T.observacoesPlaceholder}
                  value={f.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </Campo>
            </div>
          </div>
          {falhaDe("identificador") ? (
            <p style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>{falhaDe("identificador")}</p>
          ) : (
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--p-muted)" }}>{T.identificadorAjuda}</p>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={enviar}
              disabled={ocupado}
              style={{ borderRadius: 8, background: "var(--p-accent-ink, #b45309)", color: "#fff", border: "none", padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: ocupado ? 0.6 : 1 }}
            >
              {ocupado ? T.enviando : pendente ? T.salvarAlteracoes : T.enviar}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={ocupado}
              style={{ borderRadius: 8, background: "#fff", color: "var(--p-ink)", border: "1px solid var(--p-line)", padding: "8px 16px", fontSize: 13, cursor: "pointer" }}
            >
              {T.cancelarEdicao}
            </button>
          </div>
        </div>
      )}
      {ok ? <div style={{ marginTop: 10, fontSize: 13, color: "var(--p-success-ink)" }}>{ok}</div> : null}
    </div>
  );
}

function StatusBadge({ status, T }: { status: StatusContaBancaria; T: ReturnType<typeof textosContaBancariaFornecedor> }) {
  const estilo = STATUS_COR[status];
  const label = {
    pending_admin: T.statusPendente,
    confirmed: T.statusConfirmada,
    rejected: T.statusRejeitada,
    superseded: T.statusSuperada,
  }[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: estilo.cor,
        background: estilo.bg,
      }}
    >
      {label}
    </span>
  );
}

function ResumoConta({ c }: { c: ContaBancaria }) {
  const linhas: Array<[string, string | null]> = [
    ["Titular", c.accountHolderName],
    ["Banco", c.bankName],
    ["País / moeda", [c.countryCode, c.currency].filter(Boolean).join(" · ") || null],
    ["IBAN", c.iban],
    ["SWIFT/BIC", c.swiftBic],
    ["Conta", c.accountNumber],
    ["Agência / routing", c.routingCode],
    ["Pix", c.pixKey],
  ].filter(([, v]) => !!v) as Array<[string, string]>;
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px", fontSize: 13 }}>
      {linhas.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <dt style={{ color: "var(--p-muted)" }}>{k}</dt>
          <dd style={{ color: "var(--p-ink)", fontWeight: 500 }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
