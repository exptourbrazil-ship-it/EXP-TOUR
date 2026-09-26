"use client";

import { useEffect, useState } from "react";
import {
  DIAS_SEMANA,
  hidratarTimetable,
  serializarTimetable,
  type DiaSemana,
  type BlocoAulaEdit,
  type TimetableEdit,
} from "@/lib/timetable-editor";
import { t, statusConteudoLabel, localeConteudoLabel, textosEditorConteudo } from "@/lib/fornecedor-i18n";
import MidiaPreview from "@/components/MidiaPreview";
import { ELIG_ATTRIBUTES, ELIG_OPERATORS, ONSHORE_VALUES } from "@/lib/elegibilidade";

// Editor do conteúdo de um curso pela escola (Fase B1). Carrega/cria o rascunho
// via /api/fornecedor/conteudo (acao "iniciar"), edita conteúdo por locale +
// mídia + ficha (program_detail), e salva/envia. Só editável enquanto "draft".
// Estilo do portal do fornecedor (tokens --p-*).

const LOCALES = ["pt-BR", "en", "es"] as const;

const DELIVERY = (idioma: string | undefined) => t(idioma, {
  pt: [
    { v: "", t: "—" },
    { v: "in_person", t: "Presencial" },
    { v: "online", t: "Online" },
    { v: "hybrid", t: "Híbrido" },
  ],
  en: [
    { v: "", t: "—" },
    { v: "in_person", t: "In person" },
    { v: "online", t: "Online" },
    { v: "hybrid", t: "Hybrid" },
  ],
});
// Formato da aula: quantos alunos dividem o professor. Enum, e nao texto livre,
// porque o preco depende dele — a mesma carga horaria em grupo e individual sao
// duas tabelas diferentes.
const FORMATO = (idioma: string | undefined) => t(idioma, {
  pt: [
    { v: "", t: "—" },
    { v: "group", t: "Em grupo" },
    { v: "mini_group", t: "Mini-grupo (2 alunos)" },
    { v: "one_to_one", t: "Individual (1:1)" },
    { v: "combined", t: "Grupo + individual" },
  ],
  en: [
    { v: "", t: "—" },
    { v: "group", t: "Group" },
    { v: "mini_group", t: "Mini-group (2 students)" },
    { v: "one_to_one", t: "One-to-one" },
    { v: "combined", t: "Group + one-to-one" },
  ],
});

type ConteudoForm = { description_html: string; highlights: string; inclusions: string; exclusions: string; is_machine_translated: boolean };
type MidiaForm = { url: string; kind: string; caption: string };
type ProgramaForm = {
  education_type: string; subject: string; language: string; delivery_method: string; format: string;
  grades: string; lessons_per_week: string; hours_per_week: string; is_pathway: boolean; includes_activities: boolean;
};
// Duração/disponibilidade do PRODUTO (min_duration/max_duration em SEMANAS +
// available_from/available_until — colunas de `product`, nao de
// program_detail). Vai no MESMO rascunho de conteúdo; o admin aplica em
// `product` na aprovação (content-admin-service.aprovarConteudoPeloAdmin).
type DisponibilidadeForm = { min_duration: string; max_duration: string; available_from: string; available_until: string };
const vazioDisponibilidade = (): DisponibilidadeForm => ({ min_duration: "", max_duration: "", available_from: "", available_until: "" });

// ── Elegibilidade (eligibility_rule) ─────────────────────────────────────────
// Regras propostas pela escola (kind agnóstico às abas de locale — é uma
// propriedade do CURSO). Mesma semântica do editor do admin
// (src/components/ElegibilidadeEditor.tsx): mesmo group_index = E; grupos
// diferentes = OU. A validação real (motor puro) é do servidor; aqui só
// montamos o `value` cru conforme atributo/operador.
type RegraEligForm = {
  group_index: string;
  attribute: string;
  operator: string;
  is_blocking: boolean;
  vSingle: string;
  vMin: string;
  vMax: string;
  vList: string;
  vBool: boolean;
};

function regraEligParaForm(r: any): RegraEligForm {
  const base: RegraEligForm = {
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

function novaRegraElig(): RegraEligForm {
  return { group_index: "0", attribute: "nationality", operator: "eq", is_blocking: false, vSingle: "", vMin: "", vMax: "", vList: "", vBool: false };
}

function valorRegraElig(r: RegraEligForm): unknown {
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

const box: React.CSSProperties = { border: "1px solid var(--p-line)", borderRadius: 12, background: "#fff", padding: 16, marginBottom: 16 };
const inp: React.CSSProperties = { width: "100%", border: "1px solid var(--p-line)", borderRadius: 8, padding: "8px 10px", fontSize: 14, background: "#fff", color: "var(--p-ink)", boxSizing: "border-box", fontFamily: "var(--p-body)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--p-muted)", marginBottom: 4 };

const arr = (v: unknown): string => (Array.isArray(v) ? v.join("\n") : "");
const vazioConteudo = (): ConteudoForm => ({ description_html: "", highlights: "", inclusions: "", exclusions: "", is_machine_translated: false });

// ── Grade de horários (timetable) ───────────────────────────────────────────
// Tipos/parsing (shape canônico de program_detail.timetable) vêm de
// src/lib/timetable-editor.ts, compartilhado com o editor do admin (mesma
// lógica; UI própria aqui por causa do estilo --p-* do portal do fornecedor).
function GradeHorarios({ valor, set, idioma }: { valor: TimetableEdit; set: (t: TimetableEdit) => void; idioma?: string }) {
  const [diaAtivo, setDiaAtivo] = useState<DiaSemana>("Seg");
  const [copiarDe, setCopiarDe] = useState<DiaSemana>("Seg");

  const blocos = valor[diaAtivo];
  const setBlocos = (novos: BlocoAulaEdit[]) => set({ ...valor, [diaAtivo]: novos });

  const diasComDados = DIAS_SEMANA.filter((d) => valor[d].length > 0);

  const T = t(idioma, {
    pt: {
      nenhumHorario: (dia: string) => `Nenhum horário cadastrado para ${dia}.`,
      ate: "até",
      descricaoPlaceholder: "Ex.: General English Morning, Intervalo…",
      intervalo: "Intervalo",
      remover: "Remover",
      fimAntesDoInicio: "O horário de fim não pode ser antes do início.",
      adicionarLinha: "+ Adicionar linha",
      copiarDe: "Copiar de:",
      copiar: "Copiar",
    },
    en: {
      nenhumHorario: (dia: string) => `No schedule set for ${dia}.`,
      ate: "to",
      descricaoPlaceholder: "E.g.: General English Morning, Break…",
      intervalo: "Break",
      remover: "Remove",
      fimAntesDoInicio: "The end time can't be before the start time.",
      adicionarLinha: "+ Add row",
      copiarDe: "Copy from:",
      copiar: "Copy",
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {DIAS_SEMANA.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDiaAtivo(d)}
            style={{
              borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              border: d === diaAtivo ? "1px solid var(--p-cta)" : "1px solid var(--p-line)",
              background: d === diaAtivo ? "var(--p-cta)" : "#fff",
              color: d === diaAtivo ? "var(--p-cta-fg)" : valor[d].length > 0 ? "var(--p-accent-ink)" : "var(--p-muted)",
            }}
          >
            {d}
            {valor[d].length > 0 ? ` (${valor[d].length})` : ""}
          </button>
        ))}
      </div>

      {blocos.length === 0 ? (
        <p style={{ marginBottom: 8, fontSize: 12, color: "var(--p-muted)" }}>{T.nenhumHorario(diaAtivo)}</p>
      ) : (
        <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {blocos.map((b, i) => {
            const invalido = b.inicio && b.fim && b.fim <= b.inicio;
            return (
              <div key={i} style={{ border: "1px solid var(--p-line)", borderRadius: 8, background: "#fff", padding: 8 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <input
                    type="time"
                    value={b.inicio}
                    onChange={(e) => setBlocos(blocos.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)))}
                    style={{ ...inp, width: 112 }}
                  />
                  <span style={{ fontSize: 12, color: "var(--p-muted)" }}>{T.ate}</span>
                  <input
                    type="time"
                    value={b.fim}
                    onChange={(e) => setBlocos(blocos.map((x, j) => (j === i ? { ...x, fim: e.target.value } : x)))}
                    style={{ ...inp, width: 112 }}
                  />
                  <input
                    value={b.descricao}
                    onChange={(e) => setBlocos(blocos.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                    placeholder={T.descricaoPlaceholder}
                    style={{ ...inp, minWidth: 180, flex: 1 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--p-ink)" }}>
                    <input
                      type="checkbox"
                      checked={b.isIntervalo}
                      onChange={(e) => setBlocos(blocos.map((x, j) => (j === i ? { ...x, isIntervalo: e.target.checked } : x)))}
                    />
                    {T.intervalo}
                  </label>
                  <button
                    type="button"
                    onClick={() => setBlocos(blocos.filter((_, j) => j !== i))}
                    style={{ fontSize: 12, color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}
                  >
                    {T.remover}
                  </button>
                </div>
                {invalido ? <p style={{ marginTop: 4, fontSize: 11, color: "#b91c1c" }}>{T.fimAntesDoInicio}</p> : null}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => setBlocos([...blocos, { inicio: "", fim: "", descricao: "", isIntervalo: false }])}
          style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "var(--p-ink)", cursor: "pointer" }}
        >
          {T.adicionarLinha}
        </button>
        {diasComDados.length > 0 ? (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--p-ink)" }}>
            {T.copiarDe}
            <select
              value={copiarDe}
              onChange={(e) => setCopiarDe(e.target.value as DiaSemana)}
              style={{ ...inp, width: "auto", padding: "4px 8px" }}
            >
              {diasComDados.filter((d) => d !== diaAtivo).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={copiarDe === diaAtivo || valor[copiarDe].length === 0}
              onClick={() => setBlocos(valor[copiarDe].map((b) => ({ ...b })))}
              style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 600, color: "var(--p-ink)", cursor: "pointer", opacity: (copiarDe === diaAtivo || valor[copiarDe].length === 0) ? 0.4 : 1 }}
            >
              {T.copiar}
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

const ATTR_LABEL = (idioma: string | undefined) => t(idioma, {
  pt: {
    age_at_start: "Idade no início", nationality: "Nacionalidade", residence_country: "País de residência",
    language_level: "Nível de idioma", education_level: "Nível de ensino", onshore_status: "Onshore/Offshore", has_visa: "Tem visto",
  } as Record<string, string>,
  en: {
    age_at_start: "Age at start", nationality: "Nationality", residence_country: "Country of residence",
    language_level: "Language level", education_level: "Education level", onshore_status: "Onshore/Offshore", has_visa: "Has visa",
  } as Record<string, string>,
});
const OP_LABEL = (idioma: string | undefined) => t(idioma, {
  pt: { between: "entre", in: "em", not_in: "fora de", gte: ">=", lte: "<=", eq: "=" } as Record<string, string>,
  en: { between: "between", in: "in", not_in: "not in", gte: ">=", lte: "<=", eq: "=" } as Record<string, string>,
});

export default function ConteudoProgramaEditor({ productId, idioma }: { productId: string; idioma?: string }) {
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("draft");
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<string>("pt-BR");

  const [porLocale, setPorLocale] = useState<Record<string, ConteudoForm>>(() => {
    const b: Record<string, ConteudoForm> = {};
    for (const l of LOCALES) b[l] = vazioConteudo();
    return b;
  });
  const [midias, setMidias] = useState<MidiaForm[]>([]);
  const [prog, setProg] = useState<ProgramaForm>({
    education_type: "", subject: "", language: "", delivery_method: "", format: "",
    grades: "", lessons_per_week: "", hours_per_week: "", is_pathway: false, includes_activities: false,
  });
  const [timetable, setTimetable] = useState<TimetableEdit>(() => hidratarTimetable(undefined));
  const [disp, setDisp] = useState<DisponibilidadeForm>(vazioDisponibilidade());
  const [regrasElig, setRegrasElig] = useState<RegraEligForm[]>([]);

  const editavel = status === "draft";
  const TX = textosEditorConteudo(idioma);
  const LOCALE_LABEL = localeConteudoLabel(idioma);
  const T = t(idioma, {
    pt: {
      descricaoELista: "Descrição e listas",
      descricaoHtml: "Descrição (HTML simples: parágrafos, negrito, listas)",
      destaques: "Destaques (um por linha)",
      inclui: "Inclui (um por linha)",
      naoInclui: "Não inclui (um por linha)",
      fichaCurso: "Ficha do curso",
      tipoExemplo: "Tipo (ex.: General English)",
      areaAssunto: "Área/assunto",
      idioma: "Idioma",
      ondeAcontece: "Onde acontece",
      formatoAula: "Formato da aula",
      aulasPorSemana: "Aulas por semana",
      cargaHoraria: "Carga horária (h/semana)",
      niveis: "Níveis (um por linha)",
      pathway: "Pathway",
      incluiAtividades: "Inclui atividades",
      gradeHorarios: "Grade de horários",
      fotosVideos: "Fotos e vídeos",
      duracaoDisponibilidade: "Duração e disponibilidade",
      duracaoMin: "Duração mín. (semanas)",
      duracaoMax: "Duração máx. (semanas)",
      disponivelDe: "Disponível de",
      disponivelAte: "Disponível até",
      elegibilidade: "Elegibilidade",
      elegibilidadeAjuda: "Regras que definem quem pode cotar este curso — proposta enviada para a EXP Tour revisar. Mesmo grupo = todas as condições precisam valer; grupos diferentes = basta uma. \"Bloqueante\" impede a emissão da cotação (senão é só um aviso).",
      elegibilidadeVazia: "Sem regras propostas — o curso seria elegível para todos.",
      grupo: "grupo",
      bloqueante: "bloqueante",
      adicionarRegra: "+ Adicionar regra",
      valorPlaceholder: "valor",
      listaPlaceholder: "valores separados por vírgula",
      onshorePlaceholder: "onshore, offshore",
      selecione: "Selecione…",
      sim: "Sim",
      nao: "Não",
    },
    en: {
      descricaoELista: "Description and lists",
      descricaoHtml: "Description (simple HTML: paragraphs, bold, lists)",
      destaques: "Highlights (one per line)",
      inclui: "Includes (one per line)",
      naoInclui: "Doesn't include (one per line)",
      fichaCurso: "Course details",
      tipoExemplo: "Type (e.g.: General English)",
      areaAssunto: "Subject area",
      idioma: "Language",
      ondeAcontece: "Where it happens",
      formatoAula: "Class format",
      aulasPorSemana: "Lessons per week",
      cargaHoraria: "Weekly hours",
      niveis: "Levels (one per line)",
      pathway: "Pathway",
      incluiAtividades: "Includes activities",
      gradeHorarios: "Class schedule",
      fotosVideos: "Photos and videos",
      duracaoDisponibilidade: "Duration and availability",
      duracaoMin: "Min. duration (weeks)",
      duracaoMax: "Max. duration (weeks)",
      disponivelDe: "Available from",
      disponivelAte: "Available until",
      elegibilidade: "Eligibility",
      elegibilidadeAjuda: "Rules that define who can quote this course — sent to EXP Tour for review. Same group = all conditions must hold; different groups = any one is enough. \"Blocking\" prevents the quote from being issued (otherwise it's just a warning).",
      elegibilidadeVazia: "No rules proposed — the course would be eligible for everyone.",
      grupo: "group",
      bloqueante: "blocking",
      adicionarRegra: "+ Add rule",
      valorPlaceholder: "value",
      listaPlaceholder: "comma-separated values",
      onshorePlaceholder: "onshore, offshore",
      selecione: "Select…",
      sim: "Yes",
      nao: "No",
    },
  });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/fornecedor/conteudo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "iniciar", productId }),
        });
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok || !j.ok) {
          setErro(j?.erro || TX.erroAbrirConteudo);
        } else {
          hidratar(j.detalhe);
        }
      } catch {
        if (vivo) setErro(TX.falhaConexao);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function hidratar(det: any) {
    setId(det.id);
    setStatus(det.status);
    setRejectReason(det.rejectReason ?? null);
    const p = det.payload ?? {};
    const base: Record<string, ConteudoForm> = {};
    for (const l of LOCALES) {
      const c = (p.content ?? []).find((x: any) => x.locale === l);
      base[l] = c
        ? { description_html: c.description_html ?? "", highlights: arr(c.highlights), inclusions: arr(c.inclusions), exclusions: arr(c.exclusions), is_machine_translated: !!c.is_machine_translated }
        : vazioConteudo();
    }
    setPorLocale(base);
    setMidias((p.media ?? []).map((m: any) => ({ url: m.url ?? "", kind: m.kind ?? "image", caption: m.caption ?? "" })));
    const pd = p.programDetail ?? {};
    setProg({
      education_type: pd.education_type ?? "", subject: pd.subject ?? "", language: pd.language ?? "",
      delivery_method: pd.delivery_method ?? "", format: pd.format ?? "", grades: arr(pd.grades),
      lessons_per_week: pd.lessons_per_week != null ? String(pd.lessons_per_week) : "",
      hours_per_week: pd.hours_per_week != null ? String(pd.hours_per_week) : "",
      is_pathway: !!pd.is_pathway, includes_activities: !!pd.includes_activities,
    });
    setTimetable(hidratarTimetable(pd.timetable));
    const dp = p.disponibilidade ?? {};
    setDisp({
      min_duration: dp.min_duration != null ? String(dp.min_duration) : "",
      max_duration: dp.max_duration != null ? String(dp.max_duration) : "",
      available_from: dp.available_from ?? "",
      available_until: dp.available_until ?? "",
    });
    setRegrasElig(Array.isArray(p.elegibilidade) ? p.elegibilidade.map(regraEligParaForm) : []);
  }

  function montarPayload() {
    return {
      content: LOCALES.map((l) => ({ locale: l, ...porLocale[l] })),
      media: midias.map((m, i) => ({ url: m.url, kind: m.kind || undefined, caption: m.caption || undefined, sort: i })),
      programDetail: {
        education_type: prog.education_type, subject: prog.subject, language: prog.language,
        delivery_method: prog.delivery_method || undefined, format: prog.format, grades: prog.grades,
        lessons_per_week: prog.lessons_per_week || undefined, hours_per_week: prog.hours_per_week || undefined,
        is_pathway: prog.is_pathway, includes_activities: prog.includes_activities,
        timetable: serializarTimetable(timetable),
      },
      disponibilidade: {
        min_duration: disp.min_duration || undefined, max_duration: disp.max_duration || undefined,
        available_from: disp.available_from || undefined, available_until: disp.available_until || undefined,
      },
      elegibilidade: regrasElig.map((r) => ({
        group_index: Number(r.group_index) || 0,
        attribute: r.attribute,
        operator: r.attribute === "has_visa" ? "eq" : r.operator,
        value: valorRegraElig(r),
        is_blocking: r.is_blocking,
      })),
    };
  }

  async function salvar(): Promise<boolean> {
    if (!id) return false;
    setSalvando(true); setErro(null); setOkMsg(null);
    try {
      const r = await fetch("/api/fornecedor/conteudo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "salvar", id, payload: montarPayload() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setErro(j?.erro || TX.erroSalvar); return false;
      }
      setOkMsg(TX.rascunhoSalvo); return true;
    } catch {
      setErro(TX.falhaConexao); return false;
    } finally {
      setSalvando(false);
    }
  }

  async function enviar() {
    if (!id) return;
    const salvou = await salvar();
    if (!salvou) return;
    if (!confirm(TX.confirmarEnvio)) return;
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/fornecedor/conteudo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "aprovar", id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setErro(j?.erro || TX.erroEnviar);
      else { setStatus("pending_admin"); setOkMsg(TX.enviadoParaExpTour); }
    } catch {
      setErro(TX.falhaConexao);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <p style={{ color: "var(--p-muted)", fontSize: 14 }}>{TX.carregando}</p>;
  if (erro && !id) return <p style={{ color: "#b91c1c", fontSize: 14 }}>{erro}</p>;

  const st = statusConteudoLabel(idioma, status);
  const c = porLocale[aba];
  const setLoc = (patch: Partial<ConteudoForm>) => setPorLocale((s) => ({ ...s, [aba]: { ...s[aba], ...patch } }));
  const setP = (patch: Partial<ProgramaForm>) => setProg((s) => ({ ...s, ...patch }));
  const setD = (patch: Partial<DisponibilidadeForm>) => setDisp((s) => ({ ...s, ...patch }));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "var(--p-muted)" }}>{TX.statusRotulo}</span>
        <span style={{ fontWeight: 700, color: st.cor, fontSize: 14 }}>{st.texto}</span>
      </div>
      {!editavel ? (
        <div style={{ ...box, background: "var(--p-page)", fontSize: 13, color: "var(--p-ink)" }}>
          {status === "pending_admin" ? TX.avisoPendingAdmin
            : status === "approved" ? TX.avisoApproved
            : TX.avisoNaoEditavel}
        </div>
      ) : null}
      {status === "rejected" && rejectReason ? (
        <div style={{ ...box, borderColor: "#fca5a5", background: "#fef2f2", fontSize: 13, color: "#991b1b" }}>
          <strong>{TX.devolvidoPelaExpTour}</strong> {rejectReason}
        </div>
      ) : null}
      {erro ? <div style={{ ...box, borderColor: "#fca5a5", background: "#fef2f2", color: "#991b1b", fontSize: 14 }}>{erro}</div> : null}
      {okMsg ? <div style={{ ...box, borderColor: "#86efac", background: "#f0fdf4", color: "var(--p-success-ink)", fontSize: 14 }}>{okMsg}</div> : null}

      {/* Conteúdo por locale */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>{T.descricaoELista}</legend>
        <div style={{ display: "flex", gap: 6, margin: "6px 0 12px" }}>
          {LOCALES.map((l) => (
            <button key={l} type="button" onClick={() => setAba(l)}
              style={{ borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: "1px solid var(--p-line)", background: aba === l ? "var(--p-cta)" : "#fff", color: aba === l ? "var(--p-cta-fg)" : "var(--p-ink)" }}>
              {LOCALE_LABEL[l]}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>{T.descricaoHtml}</label>
          <textarea value={c.description_html} onChange={(e) => setLoc({ description_html: e.target.value })} rows={5} style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><label style={lbl}>{T.destaques}</label><textarea value={c.highlights} onChange={(e) => setLoc({ highlights: e.target.value })} rows={4} style={inp} /></div>
          <div><label style={lbl}>{T.inclui}</label><textarea value={c.inclusions} onChange={(e) => setLoc({ inclusions: e.target.value })} rows={4} style={inp} /></div>
          <div><label style={lbl}>{T.naoInclui}</label><textarea value={c.exclusions} onChange={(e) => setLoc({ exclusions: e.target.value })} rows={4} style={inp} /></div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, color: "var(--p-ink)" }}>
          <input type="checkbox" checked={c.is_machine_translated} onChange={(e) => setLoc({ is_machine_translated: e.target.checked })} /> {TX.traducaoAutomatica}
        </label>
      </fieldset>

      {/* Ficha (program_detail) */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>{T.fichaCurso}</legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lbl}>{T.tipoExemplo}</label><input value={prog.education_type} onChange={(e) => setP({ education_type: e.target.value })} style={inp} /></div>
          <div><label style={lbl}>{T.areaAssunto}</label><input value={prog.subject} onChange={(e) => setP({ subject: e.target.value })} style={inp} /></div>
          <div><label style={lbl}>{T.idioma}</label><input value={prog.language} onChange={(e) => setP({ language: e.target.value })} style={inp} /></div>
          <div>
            <label style={lbl}>{T.ondeAcontece}</label>
            <select value={prog.delivery_method} onChange={(e) => setP({ delivery_method: e.target.value })} style={inp}>
              {DELIVERY(idioma).map((d) => <option key={d.v} value={d.v}>{d.t}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>{T.formatoAula}</label>
            <select value={prog.format} onChange={(e) => setP({ format: e.target.value })} style={inp}>
              {FORMATO(idioma).map((f) => <option key={f.v} value={f.v}>{f.t}</option>)}
            </select>
          </div>
          <div><label style={lbl}>{T.aulasPorSemana}</label><input value={prog.lessons_per_week} onChange={(e) => setP({ lessons_per_week: e.target.value })} inputMode="numeric" style={inp} /></div>
          <div><label style={lbl}>{T.cargaHoraria}</label><input value={prog.hours_per_week} onChange={(e) => setP({ hours_per_week: e.target.value })} inputMode="decimal" style={inp} /></div>
          <div><label style={lbl}>{T.niveis}</label><textarea value={prog.grades} onChange={(e) => setP({ grades: e.target.value })} rows={2} style={inp} /></div>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-ink)" }}>
            <input type="checkbox" checked={prog.is_pathway} onChange={(e) => setP({ is_pathway: e.target.checked })} /> {T.pathway}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--p-ink)" }}>
            <input type="checkbox" checked={prog.includes_activities} onChange={(e) => setP({ includes_activities: e.target.checked })} /> {T.incluiAtividades}
          </label>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={lbl}>{T.gradeHorarios}</label>
          <GradeHorarios valor={timetable} set={setTimetable} idioma={idioma} />
        </div>
      </fieldset>

      {/* Duração e disponibilidade (min_duration/max_duration/available_from/available_until em `product`) */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>{T.duracaoDisponibilidade}</legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={lbl}>{T.duracaoMin}</label><input value={disp.min_duration} onChange={(e) => setD({ min_duration: e.target.value })} inputMode="numeric" style={inp} /></div>
          <div><label style={lbl}>{T.duracaoMax}</label><input value={disp.max_duration} onChange={(e) => setD({ max_duration: e.target.value })} inputMode="numeric" style={inp} /></div>
          <div><label style={lbl}>{T.disponivelDe}</label><input type="date" value={disp.available_from} onChange={(e) => setD({ available_from: e.target.value })} style={inp} /></div>
          <div><label style={lbl}>{T.disponivelAte}</label><input type="date" value={disp.available_until} onChange={(e) => setD({ available_until: e.target.value })} style={inp} /></div>
        </div>
      </fieldset>

      {/* Elegibilidade (eligibility_rule) */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>{T.elegibilidade}</legend>
        <p style={{ marginTop: 0, marginBottom: 10, fontSize: 12, color: "var(--p-muted)" }}>{T.elegibilidadeAjuda}</p>
        {regrasElig.length === 0 ? (
          <p style={{ marginBottom: 10, fontSize: 13, color: "var(--p-muted)" }}>{T.elegibilidadeVazia}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {regrasElig.map((r, i) => {
              const isVisa = r.attribute === "has_visa";
              const isOnshore = r.attribute === "onshore_status";
              const op = isVisa ? "eq" : r.operator;
              const upd = (patch: Partial<RegraEligForm>) => setRegrasElig((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} style={{ border: "1px solid var(--p-line)", borderRadius: 8, background: "#fff", padding: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--p-muted)" }}>{T.grupo}</span>
                    <input type="number" min={0} value={r.group_index} onChange={(e) => upd({ group_index: e.target.value })} style={{ ...inp, width: 60 }} />
                    <select value={r.attribute} onChange={(e) => upd({ attribute: e.target.value })} style={{ ...inp, width: 170 }}>
                      {ELIG_ATTRIBUTES.map((a) => <option key={a} value={a}>{ATTR_LABEL(idioma)[a] ?? a}</option>)}
                    </select>
                    {!isVisa ? (
                      <select value={r.operator} onChange={(e) => upd({ operator: e.target.value })} style={{ ...inp, width: 110 }}>
                        {ELIG_OPERATORS.map((o) => <option key={o} value={o}>{OP_LABEL(idioma)[o] ?? o}</option>)}
                      </select>
                    ) : <span style={{ fontSize: 12, color: "var(--p-muted)" }}>=</span>}

                    {isVisa ? (
                      <select value={r.vBool ? "1" : "0"} onChange={(e) => upd({ vBool: e.target.value === "1" })} style={{ ...inp, width: 100 }}>
                        <option value="1">{T.sim}</option>
                        <option value="0">{T.nao}</option>
                      </select>
                    ) : op === "between" ? (
                      <>
                        <input type="number" placeholder="mín" value={r.vMin} onChange={(e) => upd({ vMin: e.target.value })} style={{ ...inp, width: 80 }} />
                        <input type="number" placeholder="máx" value={r.vMax} onChange={(e) => upd({ vMax: e.target.value })} style={{ ...inp, width: 80 }} />
                      </>
                    ) : op === "in" || op === "not_in" ? (
                      <input value={r.vList} onChange={(e) => upd({ vList: e.target.value })} style={{ ...inp, flex: 1, minWidth: 140 }} placeholder={isOnshore ? T.onshorePlaceholder : T.listaPlaceholder} />
                    ) : isOnshore ? (
                      <select value={r.vSingle} onChange={(e) => upd({ vSingle: e.target.value })} style={{ ...inp, width: 140 }}>
                        <option value="">{T.selecione}</option>
                        {ONSHORE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input value={r.vSingle} onChange={(e) => upd({ vSingle: e.target.value })} style={{ ...inp, flex: 1, minWidth: 140 }} placeholder={T.valorPlaceholder} />
                    )}

                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--p-ink)" }}>
                      <input type="checkbox" checked={r.is_blocking} onChange={(e) => upd({ is_blocking: e.target.checked })} /> {T.bloqueante}
                    </label>
                    <button type="button" onClick={() => setRegrasElig((a) => a.filter((_, j) => j !== i))} style={{ fontSize: 12, color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}>
                      {TX.remover}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => setRegrasElig((a) => [...a, novaRegraElig()])}
          style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "var(--p-ink)", cursor: "pointer" }}>
          {T.adicionarRegra}
        </button>
      </fieldset>

      {/* Mídia */}
      <fieldset style={box} disabled={!editavel}>
        <legend style={{ fontFamily: "var(--p-heading)", color: "var(--p-ink)", fontSize: 16, padding: "0 4px" }}>{T.fotosVideos}</legend>
        {midias.length === 0 ? (
          <p style={{ color: "var(--p-muted)", fontSize: 13, margin: "0 0 10px" }}>{TX.nenhumaMidia}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            {midias.map((m, i) => (
              <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <MidiaPreview url={m.url} kind={m.kind} />
                <input value={m.url} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" style={{ ...inp, flex: 1, minWidth: 180 }} />
                <select value={m.kind} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} style={{ ...inp, width: 120 }}>
                  <option value="image">{TX.imagem}</option>
                  <option value="video">{TX.video}</option>
                  <option value="document">{TX.documento}</option>
                </select>
                <input value={m.caption} onChange={(e) => setMidias((a) => a.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} placeholder={TX.legenda} style={{ ...inp, width: 160 }} />
                <button type="button" onClick={() => setMidias((a) => a.filter((_, j) => j !== i))} style={{ color: "#b91c1c", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>{TX.remover}</button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={() => setMidias((a) => [...a, { url: "", kind: "image", caption: "" }])}
          style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "var(--p-ink)", cursor: "pointer" }}>
          {TX.adicionarMidia}
        </button>
      </fieldset>

      {editavel ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={salvar} disabled={salvando}
            style={{ border: "1px solid var(--p-line)", background: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "var(--p-ink)", cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
            {salvando ? TX.salvando : TX.salvarRascunho}
          </button>
          <button type="button" onClick={enviar} disabled={salvando}
            style={{ border: "none", background: "var(--p-cta)", color: "var(--p-cta-fg)", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
            {TX.enviarParaExpTour}
          </button>
        </div>
      ) : null}
    </div>
  );
}
