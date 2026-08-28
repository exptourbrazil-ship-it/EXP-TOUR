"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS_PERIODO,
  STATUS_PERIODO_LABEL,
  TIPOS_ACOMODACAO,
  TIPO_ACOMODACAO_LABEL,
  REGIMES_ACOMODACAO,
  REGIME_ACOMODACAO_LABEL,
  type StatusPeriodo,
  type TipoAcomodacao,
} from "@/lib/disponibilidade";

// Tipos espelham catalog-disponibilidade (evita importar server-only no client).
type Periodo = {
  id: string;
  periodStart: string;
  periodEnd: string | null;
  status: StatusPeriodo;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};
type Acomodacao = {
  id: string;
  name: string;
  status: string | null;
  accommodationType: string | null;
  mealPlan: string | null;
  periodos: Periodo[];
};

const COR_STATUS: Record<StatusPeriodo, string> = {
  open: "#15803d",
  closed: "#b91c1c",
  on_request: "#8a6d2f",
};

// Gestao de disponibilidade por acomodacao (por periodo). Compartilhado entre o
// Portal do Fornecedor (endpoint /api/fornecedor/...) e o admin (endpoint
// /api/admin/..., com supplierId). Publica na hora: cada acao recarrega.
export default function AcomodacaoClient({
  endpoint,
  supplierId,
  acomodacoes,
}: {
  endpoint: string;
  supplierId?: string;
  acomodacoes: Acomodacao[];
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("homestay" as TipoAcomodacao);
  const [regime, setRegime] = useState("");

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

  async function criar() {
    if (!nome.trim()) {
      setMsg({ tipo: "erro", texto: "Informe o nome da acomodação." });
      return;
    }
    const ok = await chamar({ acao: "criar_acomodacao", name: nome, accommodationType: tipo, mealPlan: regime });
    if (ok) {
      setNome("");
      setTipo("homestay");
      setRegime("");
      setMsg({ tipo: "ok", texto: "Acomodação criada." });
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

      {/* Nova acomodacao */}
      <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#042f1b", marginBottom: 10 }}>Nova acomodação</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Homestay standard)" style={inp(220)} />
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoAcomodacao)} style={inp(180)}>
            {TIPOS_ACOMODACAO.map((t) => (
              <option key={t} value={t}>
                {TIPO_ACOMODACAO_LABEL[t]}
              </option>
            ))}
          </select>
          <select value={regime} onChange={(e) => setRegime(e.target.value)} style={inp(170)}>
            <option value="">Regime (opcional)</option>
            {REGIMES_ACOMODACAO.map((r) => (
              <option key={r} value={r}>
                {REGIME_ACOMODACAO_LABEL[r]}
              </option>
            ))}
          </select>
          <button type="button" onClick={criar} disabled={ocupado} style={btnPrim(ocupado)}>
            Adicionar
          </button>
        </div>
      </div>

      {acomodacoes.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 14 }}>Nenhuma acomodação ainda. Cadastre a primeira acima.</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {acomodacoes.map((a) => (
            <AcomodacaoCard key={a.id} acomodacao={a} ocupado={ocupado} chamar={chamar} />
          ))}
        </div>
      )}
    </div>
  );
}

function AcomodacaoCard({
  acomodacao,
  ocupado,
  chamar,
}: {
  acomodacao: Acomodacao;
  ocupado: boolean;
  chamar: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [status, setStatus] = useState("open" as StatusPeriodo);
  const [notas, setNotas] = useState("");

  async function adicionar() {
    if (!ini) return;
    const ok = await chamar({
      acao: "salvar_periodo",
      productId: acomodacao.id,
      periodStart: ini,
      periodEnd: fim,
      status,
      notes: notas,
    });
    if (ok) {
      setIni("");
      setFim("");
      setStatus("open");
      setNotas("");
    }
  }

  const subtitulo = [
    acomodacao.accommodationType ? TIPO_ACOMODACAO_LABEL[acomodacao.accommodationType as TipoAcomodacao] : null,
    acomodacao.mealPlan ? REGIME_ACOMODACAO_LABEL[acomodacao.mealPlan as keyof typeof REGIME_ACOMODACAO_LABEL] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ border: "1px solid #d8ccb4", borderRadius: 12, background: "#fff", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#042f1b" }}>{acomodacao.name}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>{subtitulo || "—"}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Arquivar a acomodação "${acomodacao.name}"?`)) chamar({ acao: "arquivar_acomodacao", productId: acomodacao.id });
          }}
          disabled={ocupado}
          style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 12, cursor: "pointer" }}
        >
          Arquivar
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        {acomodacao.periodos.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 8px" }}>Sem períodos cadastrados.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 11 }}>
                <th style={{ padding: "4px 6px" }}>Período</th>
                <th style={{ padding: "4px 6px" }}>Status</th>
                <th style={{ padding: "4px 6px" }}>Observações</th>
                <th style={{ padding: "4px 6px" }}></th>
              </tr>
            </thead>
            <tbody>
              {acomodacao.periodos.map((pd) => (
                <PeriodoRow key={pd.id} productId={acomodacao.id} periodo={pd} ocupado={ocupado} chamar={chamar} />
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 10 }}>
          <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} style={inp(140)} title="Início" />
          <span style={{ color: "#6b7280", fontSize: 12 }}>até</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} style={inp(140)} title="Fim (opcional)" />
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusPeriodo)} style={inp(150)}>
            {STATUS_PERIODO.map((s) => (
              <option key={s} value={s}>
                {STATUS_PERIODO_LABEL[s]}
              </option>
            ))}
          </select>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observações (opc.)" style={inp(200)} />
          <button type="button" onClick={adicionar} disabled={ocupado || !ini} style={btnPrim(ocupado || !ini)}>
            Adicionar período
          </button>
        </div>
      </div>
    </div>
  );
}

function PeriodoRow({
  productId,
  periodo,
  ocupado,
  chamar,
}: {
  productId: string;
  periodo: Periodo;
  ocupado: boolean;
  chamar: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [status, setStatus] = useState(periodo.status);
  const [notas, setNotas] = useState(periodo.notes ?? "");
  const sujo = status !== periodo.status || notas !== (periodo.notes ?? "");
  const faixa = periodo.periodEnd ? `${periodo.periodStart} → ${periodo.periodEnd}` : `${periodo.periodStart} → em diante`;

  return (
    <tr style={{ borderTop: "1px solid #f0e9da" }}>
      <td style={{ padding: "6px", whiteSpace: "nowrap" }}>{faixa}</td>
      <td style={{ padding: "6px" }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusPeriodo)}
          style={{ ...inp(140), borderColor: COR_STATUS[status], color: COR_STATUS[status] }}
        >
          {STATUS_PERIODO.map((s) => (
            <option key={s} value={s}>
              {STATUS_PERIODO_LABEL[s]}
            </option>
          ))}
        </select>
      </td>
      <td style={{ padding: "6px" }}>
        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="—" style={inp(180)} />
      </td>
      <td style={{ padding: "6px", textAlign: "right", whiteSpace: "nowrap" }}>
        {sujo ? (
          <button
            type="button"
            onClick={() =>
              chamar({ acao: "salvar_periodo", productId, periodStart: periodo.periodStart, periodEnd: periodo.periodEnd, status, notes: notas })
            }
            disabled={ocupado}
            style={{ background: "none", border: "none", color: "#042f1b", fontSize: 12, cursor: "pointer", marginRight: 10 }}
          >
            Salvar
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remover o período que começa em ${periodo.periodStart}?`)) chamar({ acao: "remover_periodo", productId, periodStart: periodo.periodStart });
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
  return { width, border: "1px solid #d8ccb4", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" };
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
