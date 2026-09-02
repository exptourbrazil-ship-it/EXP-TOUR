"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  KINDS,
  SOURCES,
  VISIBILITIES,
  STATUSES,
  UNITS,
  DELIVERY_METHODS,
  ACCOMMODATION_TYPES,
  ROOM_TYPES,
  BATHROOM_TYPES,
  MEAL_PLANS,
  POLICY_UNITS,
  CHARGE_UNITS,
  PRICING_MODES,
  type Kind,
  type Falha,
} from "@/lib/produto";

// Editor de produto do Admin (escrita em todos os verticais). Client component:
// monta o corpo cru e chama POST /api/admin/produtos (criar) ou PUT
// /api/admin/produtos/[id] (editar). Os selects usam os MESMOS enums do motor
// puro (src/lib/produto.ts), entao UI e validacao nunca divergem. A validacao de
// verdade acontece no servidor; aqui destacamos as falhas devolvidas por campo.

// Rotulos PT dos enums (a UI mostra em portugues; o valor enviado e o codigo).
const L: Record<string, string> = {
  program: "Programa", accommodation: "Acomodação", insurance: "Seguro", other: "Outro (transfer etc.)", package: "Pacote",
  internal: "Interno", supplier: "Fornecedor",
  hidden: "Oculto", quotable: "Cotável", sellable: "Vendável",
  draft: "Rascunho", active: "Ativo", inactive: "Inativo",
  once: "Único", day: "Dia", night: "Noite", week: "Semana", month: "Mês", person: "Pessoa", unit: "Unidade",
  in_person: "Presencial", online: "Online", hybrid: "Híbrido",
  homestay: "Casa de família", residence: "Residência estudantil", shared_apartment: "Apto. compartilhado", studio: "Studio", hotel: "Hotel",
  private: "Individual", shared_2: "Duplo", shared_3plus: "Triplo+", shared: "Compartilhado",
  none: "Sem refeição", breakfast: "Café da manhã", half_board: "Meia pensão", full_board: "Pensão completa", self_catering: "Cozinha própria",
  sum_of_items: "Soma dos itens", fixed_price: "Preço fixo",
};
const rot = (v: string) => L[v] ?? v;

export type CampusOpt = { id: string; name: string; supplierName: string | null };
export type ProdutoOpt = { id: string; name: string; kind: string };

// Estado inicial: para edicao, vem preenchido do servidor (core + detalhe + itens).
export type ProdutoInicial = {
  id?: string;
  core?: Record<string, any>;
  detalhe?: Record<string, any> | null;
  itens?: any[];
};

type ItemPacote = { item_product_id: string; quantity: string; unit: string; is_optional: boolean };

export default function ProdutoEditor({
  campi,
  produtos,
  inicial,
}: {
  campi: CampusOpt[];
  produtos: ProdutoOpt[]; // candidatos a item de pacote (do mesmo tenant)
  inicial?: ProdutoInicial;
}) {
  const router = useRouter();
  const edicao = !!inicial?.id;
  const core = inicial?.core ?? {};
  const det = inicial?.detalhe ?? {};

  const [kind, setKind] = useState<Kind>((core.kind as Kind) ?? "program");
  const [campo, setCampo] = useState<Record<string, any>>({
    name: core.name ?? "",
    campus_id: core.campus_id ?? (campi[0]?.id ?? ""),
    internal_code: core.internal_code ?? "",
    source: core.source ?? "internal",
    visibility: core.visibility ?? "internal",
    status: core.status ?? "draft",
    default_unit: core.default_unit ?? "week",
    min_duration: core.min_duration ?? "",
    max_duration: core.max_duration ?? "",
    available_from: core.available_from ?? "",
    available_until: core.available_until ?? "",
    // detalhe (achatado; so os do kind atual sao enviados)
    education_type: det.education_type ?? "",
    subject: det.subject ?? "",
    language: det.language ?? "",
    delivery_method: det.delivery_method ?? "",
    format: det.format ?? "",
    institution_type: det.institution_type ?? "",
    grades: Array.isArray(det.grades) ? det.grades.join(", ") : "",
    lessons_per_week: det.lessons_per_week ?? "",
    hours_per_week: det.hours_per_week ?? "",
    is_pathway: !!det.is_pathway,
    includes_activities: !!det.includes_activities,
    accommodation_type: det.accommodation_type ?? "",
    room_type: det.room_type ?? "",
    bathroom_type: det.bathroom_type ?? "",
    meal_plan: det.meal_plan ?? "",
    distance_to_campus_minutes: det.distance_to_campus_minutes ?? "",
    check_in_weekday: det.check_in_weekday ?? "",
    check_out_weekday: det.check_out_weekday ?? "",
    provider_name: det.provider_name ?? "",
    coverage_summary: det.coverage_summary ?? "",
    policy_unit: det.policy_unit ?? "",
    max_duration_days: det.max_duration_days ?? "",
    charge_unit: det.charge_unit ?? "once",
    category: det.category ?? "",
    valid_from: det.valid_from ?? "",
    valid_until: det.valid_until ?? "",
    pricing_mode: det.pricing_mode ?? "sum_of_items",
  });
  const [itens, setItens] = useState<ItemPacote[]>(
    (inicial?.itens ?? []).map((it: any) => ({
      item_product_id: it.item_product_id ?? "",
      quantity: it.quantity != null ? String(it.quantity) : "",
      unit: it.unit ?? "",
      is_optional: !!it.is_optional,
    })),
  );

  const [salvando, setSalvando] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [falhas, setFalhas] = useState<Falha[]>([]);

  const set = (k: string, v: any) => setCampo((c) => ({ ...c, [k]: v }));
  const falhaDe = (campoNome: string) => falhas.find((f) => f.campo === campoNome)?.erro;

  // Monta o detalhe (só do kind atual) — números vazios viram undefined.
  function montarDetalhe(): Record<string, any> {
    const num = (v: any) => (v === "" || v == null ? undefined : Number(v));
    switch (kind) {
      case "program":
        return {
          education_type: campo.education_type, subject: campo.subject, language: campo.language,
          delivery_method: campo.delivery_method || undefined, format: campo.format,
          institution_type: campo.institution_type,
          grades: campo.grades ? String(campo.grades).split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
          lessons_per_week: num(campo.lessons_per_week), hours_per_week: num(campo.hours_per_week),
          is_pathway: campo.is_pathway, includes_activities: campo.includes_activities,
        };
      case "accommodation":
        return {
          accommodation_type: campo.accommodation_type || undefined, room_type: campo.room_type || undefined,
          bathroom_type: campo.bathroom_type || undefined, meal_plan: campo.meal_plan || undefined,
          distance_to_campus_minutes: num(campo.distance_to_campus_minutes),
          check_in_weekday: num(campo.check_in_weekday), check_out_weekday: num(campo.check_out_weekday),
        };
      case "insurance":
        return {
          provider_name: campo.provider_name, coverage_summary: campo.coverage_summary,
          policy_unit: campo.policy_unit || undefined, max_duration_days: num(campo.max_duration_days),
        };
      case "other":
        return { charge_unit: campo.charge_unit, category: campo.category };
      case "package":
        return {
          valid_from: campo.valid_from || undefined, valid_until: campo.valid_until || undefined,
          pricing_mode: campo.pricing_mode,
          itens: itens
            .filter((it) => it.item_product_id)
            .map((it) => ({
              item_product_id: it.item_product_id,
              quantity: it.quantity === "" ? undefined : Number(it.quantity),
              unit: it.unit || undefined,
              is_optional: it.is_optional,
            })),
        };
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErroGeral(null);
    setFalhas([]);
    const num = (v: any) => (v === "" || v == null ? undefined : Number(v));
    const corpo = {
      kind,
      name: campo.name,
      campus_id: campo.campus_id,
      internal_code: campo.internal_code || undefined,
      source: campo.source,
      visibility: campo.visibility,
      status: campo.status,
      default_unit: campo.default_unit,
      min_duration: num(campo.min_duration),
      max_duration: num(campo.max_duration),
      available_from: campo.available_from || undefined,
      available_until: campo.available_until || undefined,
      detail: montarDetalhe(),
    };
    try {
      const url = edicao ? `/api/admin/produtos/${inicial!.id}` : "/api/admin/produtos";
      const resp = await fetch(url, {
        method: edicao ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.ok) {
        if (Array.isArray(json.falhas) && json.falhas.length) setFalhas(json.falhas);
        setErroGeral(json?.error?.message ?? "Não foi possível salvar o produto.");
        setSalvando(false);
        return;
      }
      router.push("/admin/produtos");
      router.refresh();
    } catch {
      setErroGeral("Falha de rede ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      {erroGeral ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erroGeral}</div>
      ) : null}

      {/* Tipo (kind) — imutável na edição */}
      <div>
        <Rotulo>Tipo de produto</Rotulo>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          disabled={edicao}
          className={`w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm ${edicao ? "opacity-60" : ""}`}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>{rot(k)}</option>
          ))}
        </select>
        {edicao ? <Ajuda>O tipo não pode ser alterado após a criação.</Ajuda> : null}
      </div>

      {/* Núcleo */}
      <Secao titulo="Dados gerais">
        <Grid>
          <Campo label="Nome" erro={falhaDe("name")} className="sm:col-span-2">
            <input value={campo.name} onChange={(e) => set("name", e.target.value)} className={inp} placeholder="Ex.: General English" />
          </Campo>
          <Campo label="Campus / Unidade" erro={falhaDe("campus_id")}>
            <select value={campo.campus_id} onChange={(e) => set("campus_id", e.target.value)} className={inp}>
              <option value="">Selecione…</option>
              {campi.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.supplierName ? ` — ${c.supplierName}` : ""}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Código interno" erro={falhaDe("internal_code")}>
            <input value={campo.internal_code} onChange={(e) => set("internal_code", e.target.value)} className={inp} />
          </Campo>
          <Sel label="Origem" v={campo.source} set={(x) => set("source", x)} opts={SOURCES} />
          <Sel label="Visibilidade" v={campo.visibility} set={(x) => set("visibility", x)} opts={VISIBILITIES} />
          <Sel label="Status" v={campo.status} set={(x) => set("status", x)} opts={STATUSES} />
          <Sel label="Unidade padrão" v={campo.default_unit} set={(x) => set("default_unit", x)} opts={UNITS} />
          <Campo label="Duração mín." erro={falhaDe("min_duration")}>
            <input type="number" min={0} value={campo.min_duration} onChange={(e) => set("min_duration", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Duração máx." erro={falhaDe("max_duration")}>
            <input type="number" min={0} value={campo.max_duration} onChange={(e) => set("max_duration", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Disponível de" erro={falhaDe("available_from")}>
            <input type="date" value={campo.available_from} onChange={(e) => set("available_from", e.target.value)} className={inp} />
          </Campo>
          <Campo label="Disponível até" erro={falhaDe("available_until")}>
            <input type="date" value={campo.available_until} onChange={(e) => set("available_until", e.target.value)} className={inp} />
          </Campo>
        </Grid>
      </Secao>

      {/* Detalhe por vertical */}
      {kind === "program" && (
        <Secao titulo="Detalhes do programa">
          <Grid>
            <Campo label="Tipo de ensino"><input value={campo.education_type} onChange={(e) => set("education_type", e.target.value)} className={inp} /></Campo>
            <Campo label="Assunto/Área"><input value={campo.subject} onChange={(e) => set("subject", e.target.value)} className={inp} /></Campo>
            <Campo label="Idioma"><input value={campo.language} onChange={(e) => set("language", e.target.value)} className={inp} placeholder="en, es…" /></Campo>
            <Sel label="Modalidade" v={campo.delivery_method} set={(x) => set("delivery_method", x)} opts={DELIVERY_METHODS} vazio />
            <Campo label="Formato"><input value={campo.format} onChange={(e) => set("format", e.target.value)} className={inp} /></Campo>
            <Campo label="Tipo de instituição"><input value={campo.institution_type} onChange={(e) => set("institution_type", e.target.value)} className={inp} /></Campo>
            <Campo label="Aulas/semana" erro={falhaDe("lessons_per_week")}><input type="number" min={0} value={campo.lessons_per_week} onChange={(e) => set("lessons_per_week", e.target.value)} className={inp} /></Campo>
            <Campo label="Horas/semana" erro={falhaDe("hours_per_week")}><input type="number" min={0} step="0.5" value={campo.hours_per_week} onChange={(e) => set("hours_per_week", e.target.value)} className={inp} /></Campo>
            <Campo label="Séries/anos (separados por vírgula)" className="sm:col-span-2"><input value={campo.grades} onChange={(e) => set("grades", e.target.value)} className={inp} placeholder="Ex.: 9, 10, 11" /></Campo>
            <Check label="É pathway" v={campo.is_pathway} set={(x) => set("is_pathway", x)} />
            <Check label="Inclui atividades" v={campo.includes_activities} set={(x) => set("includes_activities", x)} />
          </Grid>
        </Secao>
      )}

      {kind === "accommodation" && (
        <Secao titulo="Detalhes da acomodação">
          <Grid>
            <Sel label="Tipo" v={campo.accommodation_type} set={(x) => set("accommodation_type", x)} opts={ACCOMMODATION_TYPES} vazio erro={falhaDe("accommodation_type")} />
            <Sel label="Quarto" v={campo.room_type} set={(x) => set("room_type", x)} opts={ROOM_TYPES} vazio erro={falhaDe("room_type")} />
            <Sel label="Banheiro" v={campo.bathroom_type} set={(x) => set("bathroom_type", x)} opts={BATHROOM_TYPES} vazio erro={falhaDe("bathroom_type")} />
            <Sel label="Refeições" v={campo.meal_plan} set={(x) => set("meal_plan", x)} opts={MEAL_PLANS} vazio erro={falhaDe("meal_plan")} />
            <Campo label="Distância ao campus (min)" erro={falhaDe("distance_to_campus_minutes")}><input type="number" min={0} value={campo.distance_to_campus_minutes} onChange={(e) => set("distance_to_campus_minutes", e.target.value)} className={inp} /></Campo>
            <Campo label="Check-in (0=dom…6=sáb)" erro={falhaDe("check_in_weekday")}><input type="number" min={0} max={6} value={campo.check_in_weekday} onChange={(e) => set("check_in_weekday", e.target.value)} className={inp} /></Campo>
            <Campo label="Check-out (0=dom…6=sáb)" erro={falhaDe("check_out_weekday")}><input type="number" min={0} max={6} value={campo.check_out_weekday} onChange={(e) => set("check_out_weekday", e.target.value)} className={inp} /></Campo>
          </Grid>
        </Secao>
      )}

      {kind === "insurance" && (
        <Secao titulo="Detalhes do seguro">
          <Grid>
            <Campo label="Provedor"><input value={campo.provider_name} onChange={(e) => set("provider_name", e.target.value)} className={inp} /></Campo>
            <Sel label="Unidade da apólice" v={campo.policy_unit} set={(x) => set("policy_unit", x)} opts={POLICY_UNITS} vazio erro={falhaDe("policy_unit")} />
            <Campo label="Duração máx. (dias)" erro={falhaDe("max_duration_days")}><input type="number" min={0} value={campo.max_duration_days} onChange={(e) => set("max_duration_days", e.target.value)} className={inp} /></Campo>
            <Campo label="Resumo da cobertura" className="sm:col-span-2"><textarea value={campo.coverage_summary} onChange={(e) => set("coverage_summary", e.target.value)} rows={2} className={inp} /></Campo>
          </Grid>
        </Secao>
      )}

      {kind === "other" && (
        <Secao titulo="Detalhes do produto complementar">
          <Grid>
            <Sel label="Cobrança por" v={campo.charge_unit} set={(x) => set("charge_unit", x)} opts={CHARGE_UNITS} erro={falhaDe("charge_unit")} />
            <Campo label="Categoria"><input value={campo.category} onChange={(e) => set("category", e.target.value)} className={inp} placeholder="transfer, taxa, etc." /></Campo>
          </Grid>
        </Secao>
      )}

      {kind === "package" && (
        <Secao titulo="Detalhes do pacote">
          <Grid>
            <Sel label="Modo de preço" v={campo.pricing_mode} set={(x) => set("pricing_mode", x)} opts={PRICING_MODES} erro={falhaDe("pricing_mode")} />
            <Campo label="Válido de"><input type="date" value={campo.valid_from} onChange={(e) => set("valid_from", e.target.value)} className={inp} /></Campo>
            <Campo label="Válido até"><input type="date" value={campo.valid_until} onChange={(e) => set("valid_until", e.target.value)} className={inp} /></Campo>
          </Grid>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-brand">Itens do pacote</span>
              <button type="button" onClick={() => setItens((a) => [...a, { item_product_id: "", quantity: "", unit: "", is_optional: false }])} className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-brand">
                + Adicionar item
              </button>
            </div>
            {falhaDe("itens") ? <Ajuda erro>{falhaDe("itens")}</Ajuda> : null}
            {itens.length === 0 ? (
              <p className="text-xs text-neutral-500">Nenhum item. Pacote por soma exige ao menos um item.</p>
            ) : (
              <div className="space-y-2">
                {itens.map((it, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2">
                    <select value={it.item_product_id} onChange={(e) => setItens((a) => a.map((x, j) => (j === i ? { ...x, item_product_id: e.target.value } : x)))} className={`${inp} flex-1`}>
                      <option value="">Selecione o produto…</option>
                      {produtos.filter((p) => p.id !== inicial?.id).map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({rot(p.kind)})</option>
                      ))}
                    </select>
                    <input type="number" min={0} step="0.01" placeholder="Qtd" value={it.quantity} onChange={(e) => setItens((a) => a.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className={`${inp} w-20`} />
                    <select value={it.unit} onChange={(e) => setItens((a) => a.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} className={`${inp} w-28`}>
                      <option value="">Unidade…</option>
                      {UNITS.map((u) => <option key={u} value={u}>{rot(u)}</option>)}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-neutral-600">
                      <input type="checkbox" checked={it.is_optional} onChange={(e) => setItens((a) => a.map((x, j) => (j === i ? { ...x, is_optional: e.target.checked } : x)))} /> Opcional
                    </label>
                    <button type="button" onClick={() => setItens((a) => a.filter((_, j) => j !== i))} className="text-xs text-red-600 hover:underline">Remover</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Secao>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={salvando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-cream disabled:opacity-60">
          {salvando ? "Salvando…" : edicao ? "Salvar alterações" : "Criar produto"}
        </button>
        <button type="button" onClick={() => router.push("/admin/produtos")} className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-brand">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ── Subcomponentes de UI ────────────────────────────────────────────────────
const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-neutral-200 bg-white p-4">
      <legend className="px-1 font-serif text-base text-brand">{titulo}</legend>
      {children}
    </fieldset>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}
function Rotulo({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-neutral-600">{children}</label>;
}
function Ajuda({ children, erro }: { children: React.ReactNode; erro?: boolean }) {
  return <p className={`mt-1 text-xs ${erro ? "text-red-600" : "text-neutral-500"}`}>{children}</p>;
}
function Campo({ label, erro, className, children }: { label: string; erro?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Rotulo>{label}</Rotulo>
      {children}
      {erro ? <Ajuda erro>{erro}</Ajuda> : null}
    </div>
  );
}
function Sel({ label, v, set, opts, vazio, erro }: { label: string; v: string; set: (x: string) => void; opts: readonly string[]; vazio?: boolean; erro?: string }) {
  return (
    <Campo label={label} erro={erro}>
      <select value={v} onChange={(e) => set(e.target.value)} className={inp}>
        {vazio ? <option value="">Selecione…</option> : null}
        {opts.map((o) => <option key={o} value={o}>{rot(o)}</option>)}
      </select>
    </Campo>
  );
}
function Check({ label, v, set }: { label: string; v: boolean; set: (x: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  );
}
