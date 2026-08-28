"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS_INTAKE,
  STATUS_INTAKE_LABEL,
  type StatusIntake,
} from "@/lib/disponibilidade";

// Tipos espelham catalog-disponibilidade (evita importar server-only no client).
type Intake = {
  id: string;
  startDate: string;
  status: StatusIntake;
  capacity: number | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};
type Programa = {
  id: string;
  name: string;
  status: string | null;
  language: string | null;
  educationType: string | null;
  minDuration: number | null;
  maxDuration: number | null;
  intakes: Intake[];
};

const COR_STATUS: Record<StatusIntake, string> = {
  open: "#15803d",
  limited: "#8a6d2f",
  closed: "#b91c1c",
  waitlist: "#6b7280",
};

// Gestao de disponibilidade por programa. Compartilhado entre o Portal do
// Fornecedor (endpoint /api/fornecedor/...) e o admin (endpoint /api/admin/...,
// com supplierId). Publica na hora: cada acao chama o endpoint e recarrega.
export default function DisponibilidadeClient({
  endpoint,
  supplierId,
  programas,
}: {
  endpoint: string;
  supplierId?: string;
  programas: Programa[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);

  // Form de novo programa.
  const [nome, setNome] = useState("");
  const [idioma, setIdioma] = useState("");
  const [durMin, setDurMin] = useState("");
  const [durMax, setDurMax] = useState("");

  async function chamar(payload: Record<string, unknown>): Promise<boolean> {
    setOcupado(true);
    setMsg(null);
    try {
      const body = supplierId ? { ...payload, supplierId } : payload;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ tipo: "erro", texto: json.erro || "Falha na operação." });
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede. Tente novamente." });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function criarPrograma() {
    if (!nome.trim()) {
      setMsg({ tipo: "erro", texto: "Informe o nome do programa." });
      return;
    }
    const ok = await chamar({
      acao: "criar_programa",
      name: nome,
      language: idioma,
      minDuration: durMin,
      maxDuration: durMax,
    });
    if (ok) {
      setNome("");
      setIdioma("");
      setDurMin("");
      setDurMax("");
      setMsg({ tipo: "ok", texto: "Programa criado." });
    }
  }

  return (
    <div>
      {msg ? (
        <div
          style={{
            marginBottom: 14,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 14,
            border: `1px solid ${msg.tipo === "ok" ? "#bbf7d0" : "#fecaca"}`,
            background: msg.tipo === "ok" ? "#f0fdf4" : "#fef2f2",
            color: msg.tipo === "ok" ? "#166534" : "#b91c1c",
          }}
        >
          {msg.texto}
        </div>
      ) : null}

      {/* Novo programa */}
      <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#042f1b", marginBottom: 10 }}>Novo programa</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: General English)" style={inp(220)} />
          <input value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="Idioma (ex.: en)" style={inp(120)} />
          <input value={durMin} onChange={(e) => setDurMin(e.target.value)} placeholder="Dur. mín (sem)" style={inp(110)} inputMode="numeric" />
          <input value={durMax} onChange={(e) => setDurMax(e.target.value)} placeholder="Dur. máx (sem)" style={inp(110)} inputMode="numeric" />
          <button type="button" onClick={criarPrograma} disabled={ocupado} style={btnPrim(ocupado)}>
            Adicionar
          </button>
        </div>
      </div>

      {programas.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhum programa ainda. Cadastre o primeiro acima.</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {programas.map((p) => (
            <ProgramaCard key={p.id} programa={p} ocupado={ocupado} chamar={chamar} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramaCard({
  programa,
  ocupado,
  chamar,
}: {
  programa: Programa;
  ocupado: boolean;
  chamar: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [novaData, setNovaData] = useState("");
  const [novoStatus, setNovoStatus] = useState("open" as StatusIntake);
  const [novaCap, setNovaCap] = useState("");

  async function adicionarIntake() {
    if (!novaData) return;
    const ok = await chamar({
      acao: "salvar_intake",
      productId: programa.id,
      startDate: novaData,
      status: novoStatus,
      capacity: novaCap,
    });
    if (ok) {
      setNovaData("");
      setNovoStatus("open");
      setNovaCap("");
    }
  }

  const dur =
    programa.minDuration && programa.maxDuration
      ? `${programa.minDuration}–${programa.maxDuration} sem`
      : programa.minDuration
        ? `≥ ${programa.minDuration} sem`
        : programa.maxDuration
          ? `≤ ${programa.maxDuration} sem`
          : null;

  return (
    <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#042f1b" }}>{programa.name}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {[programa.language, dur].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Arquivar o programa "${programa.name}"?`)) chamar({ acao: "arquivar_programa", productId: programa.id });
          }}
          disabled={ocupado}
          style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 12, cursor: "pointer" }}
        >
          Arquivar
        </button>
      </div>

      {/* Intakes */}
      <div style={{ marginTop: 12 }}>
        {programa.intakes.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>Sem datas de início cadastradas.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 11 }}>
                <th style={{ padding: "4px 6px" }}>Início</th>
                <th style={{ padding: "4px 6px" }}>Status</th>
                <th style={{ padding: "4px 6px" }}>Vagas</th>
                <th style={{ padding: "4px 6px" }}></th>
              </tr>
            </thead>
            <tbody>
              {programa.intakes.map((it) => (
                <IntakeRow key={it.id} productId={programa.id} intake={it} ocupado={ocupado} chamar={chamar} />
              ))}
            </tbody>
          </table>
        )}

        {/* Nova data */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
          <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} style={inp(150)} />
          <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value as StatusIntake)} style={inp(150)}>
            {STATUS_INTAKE.map((s) => (
              <option key={s} value={s}>
                {STATUS_INTAKE_LABEL[s]}
              </option>
            ))}
          </select>
          <input value={novaCap} onChange={(e) => setNovaCap(e.target.value)} placeholder="Vagas (opc.)" style={inp(110)} inputMode="numeric" />
          <button type="button" onClick={adicionarIntake} disabled={ocupado || !novaData} style={btnPrim(ocupado || !novaData)}>
            Adicionar data
          </button>
        </div>
      </div>
    </div>
  );
}

function IntakeRow({
  productId,
  intake,
  ocupado,
  chamar,
}: {
  productId: string;
  intake: Intake;
  ocupado: boolean;
  chamar: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [status, setStatus] = useState(intake.status);
  const [cap, setCap] = useState(intake.capacity == null ? "" : String(intake.capacity));
  const sujo = status !== intake.status || cap !== (intake.capacity == null ? "" : String(intake.capacity));

  return (
    <tr style={{ borderTop: "1px solid #f0e9da" }}>
      <td style={{ padding: "6px" }}>{intake.startDate}</td>
      <td style={{ padding: "6px" }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusIntake)}
          style={{ ...inp(140), borderColor: COR_STATUS[status], color: COR_STATUS[status] }}
        >
          {STATUS_INTAKE.map((s) => (
            <option key={s} value={s}>
              {STATUS_INTAKE_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td style={{ padding: "6px" }}>
        <input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="—" style={inp(70)} inputMode="numeric" />
      </td>
      <td style={{ padding: "6px", textAlign: "right", whiteSpace: "nowrap" }}>
        {sujo ? (
          <button
            type="button"
            onClick={() => chamar({ acao: "salvar_intake", productId, startDate: intake.startDate, status, capacity: cap })}
            disabled={ocupado}
            style={{ background: "none", border: "none", color: "#042f1b", fontSize: 12, cursor: "pointer", marginRight: 10 }}
          >
            Salvar
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remover a data ${intake.startDate}?`)) chamar({ acao: "remover_intake", productId, startDate: intake.startDate });
          }}
          disabled={ocupado}
          style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 12, cursor: "pointer" }}
        >
          Remover
        </button>
      </td>
    </tr>
  );
}

function inp(width: number): React.CSSProperties {
  return {
    width,
    border: "1px solid #d8ccb4",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13,
    background: "#fff",
  };
}
function btnPrim(disabled: boolean): React.CSSProperties {
  return {
    background: "#042f1b",
    color: "#f5ead9",
    border: "none",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
