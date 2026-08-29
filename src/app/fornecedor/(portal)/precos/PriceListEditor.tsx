"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UNIDADES,
  TIPOS_ACOM,
  TIPOS_TAXA,
  BASES_TAXA,
  type PriceListExtraido,
  type FaixaPreco,
} from "@/lib/price-list-extract";

// Editor do rascunho do price list. Enquanto 'draft' a escola edita, salva e
// aprova (envia para a EXP Tour). Nos demais status, so leitura.
export default function PriceListEditor({
  id,
  status,
  extracted,
}: {
  id: string;
  status: string;
  extracted: PriceListExtraido;
}) {
  const router = useRouter();
  const [d, setD] = useState<PriceListExtraido>(extracted);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState(null as { tipo: "ok" | "erro"; texto: string } | null);
  const editavel = status === "draft";

  async function chamar(acao: "salvar" | "aprovar"): Promise<boolean> {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await fetch("/api/fornecedor/price-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acao === "salvar" ? { acao, id, extracted: d } : { acao, id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setMsg({ tipo: "erro", texto: json.erro || "Falha na operação." });
        return false;
      }
      return true;
    } catch {
      setMsg({ tipo: "erro", texto: "Erro de rede. Tente novamente." });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    if (await chamar("salvar")) setMsg({ tipo: "ok", texto: "Rascunho salvo." });
  }
  async function aprovar() {
    if (!confirm("Enviar este price list para a EXP Tour aprovar e publicar?")) return;
    // Salva as edicoes atuais antes de aprovar.
    if (!(await chamar("salvar"))) return;
    if (await chamar("aprovar")) router.push("/fornecedor/precos");
  }

  const totalItens = d.programs.length + d.accommodations.length + d.fees.length;

  return (
    <div>
      {!editavel ? (
        <div style={{ marginBottom: 14, borderRadius: 10, padding: "10px 14px", fontSize: 13, border: "1px solid var(--p-line)", background: "var(--p-accent-soft)", color: "var(--p-accent-ink)" }}>
          Este price list já foi enviado — somente leitura.
        </div>
      ) : null}
      {msg ? (
        <div style={{ marginBottom: 14, borderRadius: 10, padding: "10px 14px", fontSize: 14, border: `1px solid ${msg.tipo === "ok" ? "var(--p-success-soft)" : "#fecaca"}`, background: msg.tipo === "ok" ? "var(--p-success-soft)" : "#fef2f2", color: msg.tipo === "ok" ? "var(--p-success-ink)" : "#b91c1c" }}>
          {msg.texto}
        </div>
      ) : null}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: "var(--p-ink)" }}>Moeda</label>
        <input
          value={d.currency ?? ""}
          onChange={(e) => setD({ ...d, currency: e.target.value.toUpperCase().slice(0, 3) || null })}
          placeholder="CAD"
          disabled={!editavel}
          style={{ ...inp(80), textTransform: "uppercase" }}
        />
        <span style={{ fontSize: 12, color: "var(--p-muted)" }}>{totalItens} item(ns)</span>
      </div>

      {/* Programas */}
      <Secao titulo="Programas / cursos">
        {d.programs.map((p, i) => (
          <ProdutoCard
            key={`p${i}`}
            nome={p.name}
            unit={p.unit}
            tiers={p.tiers}
            tipoLabel={null}
            editavel={editavel}
            onNome={(v) => setD({ ...d, programs: patch(d.programs, i, { name: v }) })}
            onUnit={(v) => setD({ ...d, programs: patch(d.programs, i, { unit: v }) })}
            onTiers={(t) => setD({ ...d, programs: patch(d.programs, i, { tiers: t }) })}
            onRemover={() => setD({ ...d, programs: d.programs.filter((_, j) => j !== i) })}
          />
        ))}
        {editavel ? (
          <Adicionar onClick={() => setD({ ...d, programs: [...d.programs, { name: "", educationType: null, unit: "week", tiers: [] }] })} rotulo="Adicionar programa" />
        ) : null}
      </Secao>

      {/* Acomodacoes */}
      <Secao titulo="Acomodações">
        {d.accommodations.map((a, i) => (
          <ProdutoCard
            key={`a${i}`}
            nome={a.name}
            unit={a.unit}
            tiers={a.tiers}
            tipoValor={a.type}
            tipoOpcoes={TIPOS_ACOM}
            editavel={editavel}
            onNome={(v) => setD({ ...d, accommodations: patch(d.accommodations, i, { name: v }) })}
            onUnit={(v) => setD({ ...d, accommodations: patch(d.accommodations, i, { unit: v }) })}
            onTipo={(v) => setD({ ...d, accommodations: patch(d.accommodations, i, { type: v || null }) })}
            onTiers={(t) => setD({ ...d, accommodations: patch(d.accommodations, i, { tiers: t }) })}
            onRemover={() => setD({ ...d, accommodations: d.accommodations.filter((_, j) => j !== i) })}
          />
        ))}
        {editavel ? (
          <Adicionar onClick={() => setD({ ...d, accommodations: [...d.accommodations, { name: "", type: "homestay", unit: "week", tiers: [] }] })} rotulo="Adicionar acomodação" />
        ) : null}
      </Secao>

      {/* Taxas */}
      <Secao titulo="Taxas">
        {d.fees.map((f, i) => (
          <div key={`f${i}`} style={cardStyle}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input value={f.name} onChange={(e) => setD({ ...d, fees: patch(d.fees, i, { name: e.target.value }) })} placeholder="Nome (ex.: Registration)" disabled={!editavel} style={inp(200)} />
              <select value={f.feeType ?? ""} onChange={(e) => setD({ ...d, fees: patch(d.fees, i, { feeType: e.target.value || null }) })} disabled={!editavel} style={inp(150)}>
                <option value="">Tipo…</option>
                {TIPOS_TAXA.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={String(f.amount)} onChange={(e) => setD({ ...d, fees: patch(d.fees, i, { amount: Number(e.target.value) || 0 }) })} placeholder="Valor" inputMode="decimal" disabled={!editavel} style={inp(100)} />
              <select value={f.basis ?? ""} onChange={(e) => setD({ ...d, fees: patch(d.fees, i, { basis: e.target.value || null }) })} disabled={!editavel} style={inp(150)}>
                <option value="">Cobrança…</option>
                {BASES_TAXA.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              {editavel ? (
                <button type="button" onClick={() => setD({ ...d, fees: d.fees.filter((_, j) => j !== i) })} style={btnRemover}>remover</button>
              ) : null}
            </div>
          </div>
        ))}
        {editavel ? (
          <Adicionar onClick={() => setD({ ...d, fees: [...d.fees, { name: "", feeType: "registration", amount: 0, basis: "once_per_quote", refundable: null }] })} rotulo="Adicionar taxa" />
        ) : null}
      </Secao>

      {editavel ? (
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={salvar} disabled={ocupado} style={btnSec(ocupado)}>Salvar rascunho</button>
          <button type="button" onClick={aprovar} disabled={ocupado} style={btnPrim(ocupado)}>Aprovar e enviar à EXP Tour</button>
        </div>
      ) : null}
    </div>
  );
}

function ProdutoCard({
  nome, unit, tiers, tipoValor, tipoOpcoes, tipoLabel, editavel, onNome, onUnit, onTipo, onTiers, onRemover,
}: {
  nome: string; unit: string; tiers: FaixaPreco[];
  tipoValor?: string | null; tipoOpcoes?: string[]; tipoLabel?: string | null;
  editavel: boolean;
  onNome: (v: string) => void; onUnit: (v: string) => void; onTipo?: (v: string) => void;
  onTiers: (t: FaixaPreco[]) => void; onRemover: () => void;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input value={nome} onChange={(e) => onNome(e.target.value)} placeholder="Nome" disabled={!editavel} style={inp(220)} />
        {tipoOpcoes && onTipo ? (
          <select value={tipoValor ?? ""} onChange={(e) => onTipo(e.target.value)} disabled={!editavel} style={inp(160)}>
            <option value="">Tipo…</option>
            {tipoOpcoes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ) : null}
        <select value={unit} onChange={(e) => onUnit(e.target.value)} disabled={!editavel} style={inp(110)}>
          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {editavel ? <button type="button" onClick={onRemover} style={btnRemover}>remover</button> : null}
      </div>
      <TiersEditor tiers={tiers} unit={unit} editavel={editavel} onTiers={onTiers} />
    </div>
  );
}

function TiersEditor({ tiers, unit, editavel, onTiers }: { tiers: FaixaPreco[]; unit: string; editavel: boolean; onTiers: (t: FaixaPreco[]) => void }) {
  return (
    <div style={{ marginLeft: 4 }}>
      {tiers.map((t, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, fontSize: 13 }}>
          <span style={{ color: "var(--p-muted)" }}>a partir de</span>
          <input value={String(t.minQuantity)} onChange={(e) => onTiers(patch(tiers, i, { minQuantity: Number(e.target.value) || 0 }))} inputMode="numeric" disabled={!editavel} style={inp(60)} />
          <span style={{ color: "var(--p-muted)" }}>{unit} →</span>
          <input value={String(t.unitPrice)} onChange={(e) => onTiers(patch(tiers, i, { unitPrice: Number(e.target.value) || 0 }))} inputMode="decimal" disabled={!editavel} style={inp(90)} />
          {editavel ? <button type="button" onClick={() => onTiers(tiers.filter((_, j) => j !== i))} style={btnRemover}>x</button> : null}
        </div>
      ))}
      {editavel ? (
        <button type="button" onClick={() => onTiers([...tiers, { minQuantity: 1, unitPrice: 0 }])} style={{ background: "none", border: "none", color: "var(--p-accent-ink)", fontSize: 12, cursor: "pointer", padding: 0 }}>
          + faixa
        </button>
      ) : null}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, margin: "0 0 8px" }}>{titulo}</h3>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}
function Adicionar({ onClick, rotulo }: { onClick: () => void; rotulo: string }) {
  return (
    <button type="button" onClick={onClick} style={{ textAlign: "left", background: "var(--p-accent-soft)", border: "1px dashed var(--p-line)", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: "var(--p-accent-ink)", cursor: "pointer" }}>
      + {rotulo}
    </button>
  );
}

// patch imutavel de um item de array por indice.
function patch<T>(arr: T[], i: number, campos: Partial<T>): T[] {
  return arr.map((x, j) => (j === i ? { ...x, ...campos } : x));
}

const cardStyle: React.CSSProperties = { border: "1px solid var(--p-line)", borderRadius: 10, background: "#fff", padding: 12 };
const btnRemover: React.CSSProperties = { background: "none", border: "none", color: "#b91c1c", fontSize: 12, cursor: "pointer" };
function inp(width: number): React.CSSProperties {
  return { width, border: "1px solid var(--p-line)", borderRadius: 8, padding: "6px 8px", fontSize: 13, background: "#fff" };
}
function btnPrim(disabled: boolean): React.CSSProperties {
  return { background: "var(--p-cta)", color: "var(--p-cta-fg)", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 };
}
function btnSec(disabled: boolean): React.CSSProperties {
  return { background: "#fff", color: "var(--p-ink)", border: "1px solid var(--p-line)", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 };
}
