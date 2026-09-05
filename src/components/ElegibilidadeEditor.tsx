"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ELIG_ATTRIBUTES, ELIG_OPERATORS, ONSHORE_VALUES, type Falha } from "@/lib/elegibilidade";

// Editor das REGRAS DE ELEGIBILIDADE de um produto. Client component: monta o
// conjunto de regras e faz PUT /api/admin/produtos/[id]/elegibilidade (substitui
// tudo). Mesmo group_index = E; grupos diferentes = OU. is_blocking impede a
// emissão da cotação. O campo de valor adapta-se ao operador/atributo; a
// validação real é no servidor (motor puro), com falhas por campo destacadas.

const ATTR_LABEL: Record<string, string> = {
  age_at_start: "Idade no início", nationality: "Nacionalidade", residence_country: "País de residência",
  language_level: "Nível de idioma", education_level: "Nível de ensino", onshore_status: "Onshore/Offshore", has_visa: "Tem visto",
};
const OP_LABEL: Record<string, string> = {
  between: "entre", in: "em", not_in: "fora de", gte: ">=", lte: "<=", eq: "=",
};
const inp = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

type RegraForm = {
  group_index: string;
  attribute: string;
  operator: string;
  is_blocking: boolean;
  // campos de valor (só o relevante ao operador é usado no submit)
  vSingle: string;
  vMin: string;
  vMax: string;
  vList: string;
  vBool: boolean;
};

// Converte uma regra normalizada (do servidor) para o formulário.
function paraForm(r: any): RegraForm {
  const base: RegraForm = {
    group_index: String(r.group_index ?? 0),
    attribute: r.attribute ?? "nationality",
    operator: r.operator ?? "eq",
    is_blocking: !!r.is_blocking,
    vSingle: "", vMin: "", vMax: "", vList: "", vBool: false,
  };
  const v = r.value;
  if (r.operator === "between" && Array.isArray(v)) {
    base.vMin = String(v[0] ?? "");
    base.vMax = String(v[1] ?? "");
  } else if ((r.operator === "in" || r.operator === "not_in") && Array.isArray(v)) {
    base.vList = v.join(", ");
  } else if (r.attribute === "has_visa") {
    base.vBool = v === true;
  } else {
    base.vSingle = v == null ? "" : String(v);
  }
  return base;
}

function novaRegra(): RegraForm {
  return { group_index: "0", attribute: "nationality", operator: "eq", is_blocking: false, vSingle: "", vMin: "", vMax: "", vList: "", vBool: false };
}

// Monta o `value` cru conforme operador/atributo (o servidor normaliza/valida).
function valueDe(r: RegraForm): unknown {
  if (r.attribute === "has_visa") return r.vBool;
  switch (r.operator) {
    case "between":
      return [r.vMin, r.vMax];
    case "in":
    case "not_in":
      return r.vList.split(",").map((s) => s.trim()).filter(Boolean);
    default:
      return r.vSingle;
  }
}

export default function ElegibilidadeEditor({ productId, inicial }: { productId: string; inicial: any[] }) {
  const router = useRouter();
  const [regras, setRegras] = useState<RegraForm[]>((inicial ?? []).map(paraForm));
  const [justificativa, setJustificativa] = useState("");
  // Servidor é a autoridade: se ele exigir justificativa (detecção que a
  // heurística local não previu), revelamos o campo e permitimos reenviar.
  const [servidorExige, setServidorExige] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);

  const upd = (i: number, patch: Partial<RegraForm>) => setRegras((a) => a.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const falhaDe = (i: number) => falhas.find((f) => f.campo.startsWith(`regras[${i}]`))?.erro;

  // Detecção (UX): a gravação removeria uma regra BLOQUEANTE? O servidor é a
  // autoridade (compara os conjuntos normalizados); aqui usamos uma chave "solta"
  // — coerção a string — só para pedir a justificativa proativamente.
  const chaveLoose = (g: unknown, attr: string, op: string, value: unknown): string => {
    const v = Array.isArray(value) ? value.map((x) => String(x).trim()).join(",") : String(value ?? "").trim();
    return `${Number(g) || 0}|${attr}|${op}|${v}`;
  };
  const blocInicial = new Set(
    (inicial ?? [])
      .filter((r: any) => r.is_blocking)
      .map((r: any) => chaveLoose(r.group_index, r.attribute, r.operator, r.value)),
  );
  const blocAtual = new Set(
    regras
      .filter((r) => r.is_blocking)
      .map((r) => chaveLoose(r.group_index, r.attribute, r.attribute === "has_visa" ? "eq" : r.operator, valueDe(r))),
  );
  const exigeJustificativa = [...blocInicial].some((k) => !blocAtual.has(k)) || servidorExige;
  const justificativaFalta = exigeJustificativa && justificativa.trim().length < 10;

  async function salvar() {
    if (justificativaFalta) {
      setErroGeral("Remover uma regra bloqueante exige uma justificativa (mín. 10 caracteres).");
      return;
    }
    setSalvando(true);
    setOk(false);
    setErroGeral(null);
    setFalhas([]);
    const corpo = {
      regras: regras.map((r) => ({
        group_index: Number(r.group_index) || 0,
        attribute: r.attribute,
        operator: r.attribute === "has_visa" ? "eq" : r.operator,
        value: valueDe(r),
        is_blocking: r.is_blocking,
      })),
      ...(exigeJustificativa ? { justificativa: justificativa.trim() } : {}),
    };
    try {
      const resp = await fetch(`/api/admin/produtos/${productId}/elegibilidade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        if (Array.isArray(json.falhas) && json.falhas.length) setFalhas(json.falhas);
        // O servidor detectou remoção de bloqueante que a heurística local não
        // previu: revela o campo de justificativa para o admin poder reenviar.
        if (json?.error?.code === "justificativa_obrigatoria") setServidorExige(true);
        setErroGeral(json?.error?.message ?? "Não foi possível salvar as regras.");
      } else {
        setOk(true);
        setJustificativa("");
        setServidorExige(false);
        router.refresh();
      }
    } catch {
      setErroGeral("Falha de rede ao salvar.");
    }
    setSalvando(false);
  }

  return (
    <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
      <legend className="px-1 font-serif text-base text-brand">Elegibilidade</legend>
      <p className="mb-3 text-xs text-neutral-500">
        Regras que definem quem pode cotar este produto. <b>Mesmo grupo = E</b> (todas precisam passar);
        <b> grupos diferentes = OU</b>. Marque <b>bloqueante</b> para impedir a emissão da cotação (senão é só um aviso).
      </p>

      {erroGeral ? <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroGeral}</div> : null}
      {ok ? <div className="mb-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">Regras salvas.</div> : null}

      {regras.length === 0 ? (
        <p className="mb-3 text-sm text-neutral-500">Sem regras — o produto é elegível para todos.</p>
      ) : (
        <div className="mb-3 space-y-3">
          {regras.map((r, i) => {
            const isVisa = r.attribute === "has_visa";
            const isOnshore = r.attribute === "onshore_status";
            const op = isVisa ? "eq" : r.operator;
            return (
              <div key={i} className="rounded-lg border border-neutral-200 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-neutral-500">grupo</label>
                  <input type="number" min={0} value={r.group_index} onChange={(e) => upd(i, { group_index: e.target.value })} className={`${inp} w-16`} />
                  <select value={r.attribute} onChange={(e) => upd(i, { attribute: e.target.value })} className={`${inp} w-44`}>
                    {ELIG_ATTRIBUTES.map((a) => <option key={a} value={a}>{ATTR_LABEL[a] ?? a}</option>)}
                  </select>
                  {!isVisa ? (
                    <select value={r.operator} onChange={(e) => upd(i, { operator: e.target.value })} className={`${inp} w-28`}>
                      {ELIG_OPERATORS.map((o) => <option key={o} value={o}>{OP_LABEL[o] ?? o}</option>)}
                    </select>
                  ) : <span className="text-xs text-neutral-500">é</span>}

                  {/* Campo de valor conforme operador/atributo */}
                  {isVisa ? (
                    <select value={r.vBool ? "1" : "0"} onChange={(e) => upd(i, { vBool: e.target.value === "1" })} className={`${inp} w-28`}>
                      <option value="1">Sim</option>
                      <option value="0">Não</option>
                    </select>
                  ) : op === "between" ? (
                    <>
                      <input type="number" placeholder="mín" value={r.vMin} onChange={(e) => upd(i, { vMin: e.target.value })} className={`${inp} w-20`} />
                      <input type="number" placeholder="máx" value={r.vMax} onChange={(e) => upd(i, { vMax: e.target.value })} className={`${inp} w-20`} />
                    </>
                  ) : op === "in" || op === "not_in" ? (
                    <input value={r.vList} onChange={(e) => upd(i, { vList: e.target.value })} className={`${inp} flex-1`} placeholder={isOnshore ? "onshore, offshore" : "valores separados por vírgula"} />
                  ) : isOnshore ? (
                    <select value={r.vSingle} onChange={(e) => upd(i, { vSingle: e.target.value })} className={`${inp} w-36`}>
                      <option value="">Selecione…</option>
                      {ONSHORE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  ) : (
                    <input value={r.vSingle} onChange={(e) => upd(i, { vSingle: e.target.value })} className={`${inp} flex-1`} placeholder="valor" />
                  )}

                  <label className="flex items-center gap-1 text-xs text-neutral-600">
                    <input type="checkbox" checked={r.is_blocking} onChange={(e) => upd(i, { is_blocking: e.target.checked })} /> bloqueante
                  </label>
                  <button type="button" onClick={() => setRegras((a) => a.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remover</button>
                </div>
                {falhaDe(i) ? <p className="mt-1 text-xs text-red-600">{falhaDe(i)}</p> : null}
              </div>
            );
          })}
        </div>
      )}

      {exigeJustificativa ? (
        <div className="mb-3 rounded-lg border border-brand-gold/50 bg-brand-cream/40 p-3">
          <label className="mb-1 block text-xs font-semibold text-brand-golddark">
            Você está removendo uma regra bloqueante. Justifique (obrigatório, mín. 10 caracteres):
          </label>
          <textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={2}
            className={`${inp} w-full`}
            placeholder="Ex.: escola confirmou que o programa passou a aceitar esta nacionalidade."
          />
          <p className="mt-1 text-[11px] text-neutral-500">A justificativa fica registrada na trilha de auditoria.</p>
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setRegras((a) => [...a, novaRegra()])} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-brand">+ Adicionar regra</button>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || justificativaFalta}
          title={justificativaFalta ? "Justifique a remoção da regra bloqueante" : undefined}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar elegibilidade"}
        </button>
      </div>
    </fieldset>
  );
}
