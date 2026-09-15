"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { CampusOpcao } from "./page";

// Opções (rótulos pt-BR) espelhando os enums de src/lib/anexo3-entidades.ts.
const ANCORAS: [string, string][] = [
  ["inicio_curso", "Início do curso"],
  ["chegada_acomodacao", "Chegada da acomodação"],
  ["assinatura", "Assinatura do contrato"],
  ["reserva", "Reserva"],
];
const UNIDADES: [string, string][] = [
  ["dias_corridos", "Dias corridos"],
  ["dias_uteis", "Dias úteis"],
  ["semanas", "Semanas"],
];
const DESTINATARIOS: [string, string][] = [["agencia", "Agência (Forio)"], ["aluno", "Aluno"]];
const FORMAS: [string, string][] = [["dinheiro", "Dinheiro"], ["credito", "Crédito"]];
const PROTECOES: [string, string][] = [
  ["nenhum", "Nenhuma"],
  ["conta_fiduciaria", "Conta fiduciária"],
  ["fundo", "Fundo de proteção"],
  ["garantia", "Garantia obrigatória"],
];
const FONTES: [string, string][] = [["contrato_representacao", "Contrato de representação"], ["site", "Site (monitorar)"]];
const CONDICOES: [string, string][] = [
  ["sempre", "Sempre"],
  ["com_acomodacao", "Com acomodação"],
  ["com_residencia", "Com residência"],
  ["duracao_min", "Duração mínima"],
  ["destino_especifico", "Destino específico"],
];
const COMPONENTES: [string, string][] = [["educacional", "Educacional"], ["terceiro", "Terceiro"]];
const EVENTOS: [string, string][] = [
  ["emissao_documento_visto", "Emissão de documento p/ visto"],
  ["confirmacao_reserva", "Confirmação de reserva"],
  ["manutencao_reserva", "Manutenção de reserva"],
];

type Politica = Record<string, unknown> | null;
type Taxa = {
  id: string; nome: string; valor: number; moeda: string; condicao_aplicacao: string;
  reembolsavel: boolean; vencimento_dias: number; componente: string; ordem: number;
};
type Exig = {
  id: string; ativa: boolean; evento_gerador: string; documento_viabilizado: string;
  valor: number | null; percentual: number | null; moeda: string | null;
  data_limite_ancora: string; data_limite_unidade: string; data_limite_valor: number;
  comprovante_ref: string | null; condicao: string | null;
};

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-neutral-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
const inputCls =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-500";

export default function CampusConfigClient({ campi }: { campi: CampusOpcao[] }) {
  const [campusId, setCampusId] = useState("");
  const campus = campi.find((c) => c.id === campusId) ?? null;
  const moeda = campus?.moeda || "";

  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Política
  const [pol, setPol] = useState<Record<string, string>>({});
  const [salvandoPol, setSalvandoPol] = useState(false);
  // Taxas
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [novaTaxa, setNovaTaxa] = useState({ nome: "", valor: "", condicaoAplicacao: "sempre", componente: "educacional", vencimentoDias: "5", reembolsavel: "false" });
  // Exigências
  const [exigs, setExigs] = useState<Exig[]>([]);
  const [novaExig, setNovaExig] = useState({ ativa: "false", eventoGerador: "emissao_documento_visto", documentoViabilizado: "", valor: "", percentual: "", dataLimiteAncora: "inicio_curso", dataLimiteUnidade: "dias_corridos", dataLimiteValor: "", comprovanteRef: "" });

  const flash = (m: string) => { setMsg(m); setErro(null); setTimeout(() => setMsg(null), 2500); };

  const carregar = useCallback(async (id: string) => {
    setErro(null); setMsg(null);
    try {
      const [pr, tr, er] = await Promise.all([
        fetch(`/api/admin/config/campus-politica?campus=${id}`).then((r) => r.json()),
        fetch(`/api/admin/config/taxa-obrigatoria?campus=${id}`).then((r) => r.json()),
        fetch(`/api/admin/config/exigencia-antecipacao?campus=${id}`).then((r) => r.json()),
      ]);
      const p: Politica = pr?.ok ? pr.politica : null;
      setPol({
        prazoPagamentoAncora: (p?.prazo_pagamento_ancora as string) || "inicio_curso",
        prazoPagamentoUnidade: (p?.prazo_pagamento_unidade as string) || "dias_corridos",
        prazoPagamentoValor: String(p?.prazo_pagamento_valor ?? 30),
        reembolsoDestinatario: (p?.reembolso_destinatario as string) || "agencia",
        reembolsoForma: (p?.reembolso_forma as string) || "dinheiro",
        reembolsoPrazoDias: String(p?.reembolso_prazo_dias ?? 0),
        creditoValidadeMeses: p?.credito_validade_meses != null ? String(p.credito_validade_meses) : "",
        creditoTransferivel: p?.credito_transferivel ? "true" : "false",
        creditoEscopo: (p?.credito_escopo as string) || "",
        protecaoEstudantil: (p?.protecao_estudantil as string) || "nenhum",
        politicaFonte: (p?.politica_fonte as string) || "contrato_representacao",
        intakeMaximoVendavel: (p?.intake_maximo_vendavel as string) || "",
        calendarioFeriadosPais: (p?.calendario_feriados_pais as string) || "",
        politicaUrl: (p?.politica_url as string) || "",
        politicaVersao: (p?.politica_versao as string) || "",
        politicaData: (p?.politica_data as string) || "",
      });
      setTaxas(tr?.ok ? tr.itens : []);
      setExigs(er?.ok ? er.itens : []);
    } catch {
      setErro("Falha ao carregar a configuração.");
    }
  }, []);

  useEffect(() => {
    if (campusId) carregar(campusId);
    else { setPol({}); setTaxas([]); setExigs([]); }
  }, [campusId, carregar]);

  async function salvarPolitica() {
    if (!campusId) return;
    setSalvandoPol(true); setErro(null);
    try {
      const body: Record<string, unknown> = {
        campusId,
        prazoPagamentoAncora: pol.prazoPagamentoAncora,
        prazoPagamentoUnidade: pol.prazoPagamentoUnidade,
        prazoPagamentoValor: Number(pol.prazoPagamentoValor),
        reembolsoDestinatario: pol.reembolsoDestinatario,
        reembolsoForma: pol.reembolsoForma,
        reembolsoPrazoDias: Number(pol.reembolsoPrazoDias),
        creditoValidadeMeses: pol.creditoValidadeMeses ? Number(pol.creditoValidadeMeses) : null,
        creditoTransferivel: pol.creditoTransferivel === "true",
        creditoEscopo: pol.creditoEscopo || null,
        protecaoEstudantil: pol.protecaoEstudantil,
        politicaFonte: pol.politicaFonte,
        intakeMaximoVendavel: pol.intakeMaximoVendavel || null,
        calendarioFeriadosPais: pol.calendarioFeriadosPais || null,
        politicaUrl: pol.politicaUrl || null,
        politicaVersao: pol.politicaVersao || null,
        politicaData: pol.politicaData || null,
      };
      const r = await fetch("/api/admin/config/campus-politica", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.ok) setErro(j?.erro || "Falha ao salvar a política.");
      else flash("Política salva.");
    } finally { setSalvandoPol(false); }
  }

  async function adicionarTaxa() {
    if (!campusId) return;
    setErro(null);
    const body = {
      campusId, nome: novaTaxa.nome, valor: Number(novaTaxa.valor), moeda,
      condicaoAplicacao: novaTaxa.condicaoAplicacao, componente: novaTaxa.componente,
      vencimentoDias: Number(novaTaxa.vencimentoDias), reembolsavel: novaTaxa.reembolsavel === "true",
    };
    const r = await fetch("/api/admin/config/taxa-obrigatoria", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok || !j.ok) { setErro(j?.erro || "Falha ao adicionar a taxa."); return; }
    setNovaTaxa({ nome: "", valor: "", condicaoAplicacao: "sempre", componente: "educacional", vencimentoDias: "5", reembolsavel: "false" });
    carregar(campusId); flash("Taxa adicionada.");
  }
  async function removerTaxa(id: string) {
    const r = await fetch(`/api/admin/config/taxa-obrigatoria?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok || !j.ok) { setErro(j?.erro || "Falha ao remover."); return; }
    carregar(campusId);
  }

  async function adicionarExig() {
    if (!campusId) return;
    setErro(null);
    const body: Record<string, unknown> = {
      campusId, ativa: novaExig.ativa === "true", eventoGerador: novaExig.eventoGerador,
      documentoViabilizado: novaExig.documentoViabilizado,
      dataLimiteAncora: novaExig.dataLimiteAncora, dataLimiteUnidade: novaExig.dataLimiteUnidade,
      dataLimiteValor: Number(novaExig.dataLimiteValor),
      comprovanteRef: novaExig.comprovanteRef || null,
    };
    if (novaExig.valor) { body.valor = Number(novaExig.valor); body.moeda = moeda; }
    else if (novaExig.percentual) body.percentual = Number(novaExig.percentual);
    const r = await fetch("/api/admin/config/exigencia-antecipacao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok || !j.ok) { setErro(j?.erro || "Falha ao adicionar a exigência."); return; }
    setNovaExig({ ativa: "false", eventoGerador: "emissao_documento_visto", documentoViabilizado: "", valor: "", percentual: "", dataLimiteAncora: "inicio_curso", dataLimiteUnidade: "dias_corridos", dataLimiteValor: "", comprovanteRef: "" });
    carregar(campusId); flash("Exigência adicionada.");
  }
  async function removerExig(id: string) {
    const r = await fetch(`/api/admin/config/exigencia-antecipacao?id=${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok || !j.ok) { setErro(j?.erro || "Falha ao remover."); return; }
    carregar(campusId);
  }

  const sel = (v: string, on: (x: string) => void, opts: [string, string][]) => (
    <select className={inputCls} value={v} onChange={(e) => on(e.target.value)}>
      {opts.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
    </select>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-semibold text-neutral-900">Política do campus (Anexo III)</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Taxas obrigatórias, exigência de antecipação e política de reembolso por campus. Só Gestor.
      </p>

      <div className="mt-4">
        <Campo label="Campus">
          <select className={inputCls} value={campusId} onChange={(e) => setCampusId(e.target.value)}>
            <option value="">Selecione um campus…</option>
            {campi.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.local ? ` — ${c.local}` : ""}{c.moeda ? ` (${c.moeda})` : ""}</option>)}
          </select>
        </Campo>
      </div>

      {erro ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p> : null}
      {msg ? <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{msg}</p> : null}

      {campusId ? (
        <div className="mt-6 space-y-8">
          {/* Política de reembolso / intake */}
          <section className="rounded-xl border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-800">Política de reembolso e horizonte</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo label="Prazo de pagamento — âncora">{sel(pol.prazoPagamentoAncora || "inicio_curso", (v) => setPol({ ...pol, prazoPagamentoAncora: v }), ANCORAS)}</Campo>
              <Campo label="Prazo de pagamento — unidade">{sel(pol.prazoPagamentoUnidade || "dias_corridos", (v) => setPol({ ...pol, prazoPagamentoUnidade: v }), UNIDADES)}</Campo>
              <Campo label="Prazo de pagamento — valor"><input className={inputCls} type="number" value={pol.prazoPagamentoValor || ""} onChange={(e) => setPol({ ...pol, prazoPagamentoValor: e.target.value })} /></Campo>
              <Campo label="Intake máximo vendável (data)"><input className={inputCls} type="date" value={pol.intakeMaximoVendavel || ""} onChange={(e) => setPol({ ...pol, intakeMaximoVendavel: e.target.value })} /></Campo>
              <Campo label="Reembolso — destinatário">{sel(pol.reembolsoDestinatario || "agencia", (v) => setPol({ ...pol, reembolsoDestinatario: v }), DESTINATARIOS)}</Campo>
              <Campo label="Reembolso — prazo (dias)"><input className={inputCls} type="number" value={pol.reembolsoPrazoDias || ""} onChange={(e) => setPol({ ...pol, reembolsoPrazoDias: e.target.value })} /></Campo>
              <Campo label="Reembolso — forma">{sel(pol.reembolsoForma || "dinheiro", (v) => setPol({ ...pol, reembolsoForma: v }), FORMAS)}</Campo>
              {pol.reembolsoForma === "credito" ? (
                <Campo label="Crédito — validade (meses)"><input className={inputCls} type="number" value={pol.creditoValidadeMeses || ""} onChange={(e) => setPol({ ...pol, creditoValidadeMeses: e.target.value })} /></Campo>
              ) : null}
              <Campo label="Proteção estudantil">{sel(pol.protecaoEstudantil || "nenhum", (v) => setPol({ ...pol, protecaoEstudantil: v }), PROTECOES)}</Campo>
              <Campo label="Fonte da política">{sel(pol.politicaFonte || "contrato_representacao", (v) => setPol({ ...pol, politicaFonte: v }), FONTES)}</Campo>
              {pol.prazoPagamentoUnidade === "dias_uteis" ? (
                <Campo label="País do calendário (ex.: CA, GB)"><input className={inputCls} value={pol.calendarioFeriadosPais || ""} onChange={(e) => setPol({ ...pol, calendarioFeriadosPais: e.target.value })} /></Campo>
              ) : null}
              <Campo label="URL da política (se site)"><input className={inputCls} value={pol.politicaUrl || ""} onChange={(e) => setPol({ ...pol, politicaUrl: e.target.value })} /></Campo>
              <Campo label="Versão / data da política"><input className={inputCls} placeholder="versão" value={pol.politicaVersao || ""} onChange={(e) => setPol({ ...pol, politicaVersao: e.target.value })} /></Campo>
            </div>
            <button onClick={salvarPolitica} disabled={salvandoPol} className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {salvandoPol ? "Salvando…" : "Salvar política"}
            </button>
          </section>

          {/* Taxas obrigatórias */}
          <section className="rounded-xl border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-800">Taxas obrigatórias (compõem a Entrada) — moeda {moeda}</h2>
            <div className="mt-3 space-y-2">
              {taxas.length === 0 ? <p className="text-sm text-neutral-400">Nenhuma taxa cadastrada.</p> : null}
              {taxas.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                  <span>
                    <strong>{t.nome}</strong> — {t.moeda} {Number(t.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · {t.componente} · {t.condicao_aplicacao} · venc. +{t.vencimento_dias}d · {t.reembolsavel ? "reembolsável" : "não reembolsável"}
                  </span>
                  <button onClick={() => removerTaxa(t.id)} className="ml-3 text-red-600 hover:underline">Remover</button>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input className={inputCls} placeholder="Nome (ex.: Matrícula)" value={novaTaxa.nome} onChange={(e) => setNovaTaxa({ ...novaTaxa, nome: e.target.value })} />
              <input className={inputCls} type="number" placeholder={`Valor (${moeda})`} value={novaTaxa.valor} onChange={(e) => setNovaTaxa({ ...novaTaxa, valor: e.target.value })} />
              {sel(novaTaxa.componente, (v) => setNovaTaxa({ ...novaTaxa, componente: v }), COMPONENTES)}
              {sel(novaTaxa.condicaoAplicacao, (v) => setNovaTaxa({ ...novaTaxa, condicaoAplicacao: v }), CONDICOES)}
              <input className={inputCls} type="number" placeholder="Vencimento (dias)" value={novaTaxa.vencimentoDias} onChange={(e) => setNovaTaxa({ ...novaTaxa, vencimentoDias: e.target.value })} />
              {sel(novaTaxa.reembolsavel, (v) => setNovaTaxa({ ...novaTaxa, reembolsavel: v }), [["false", "Não reembolsável"], ["true", "Reembolsável"]])}
            </div>
            <button onClick={adicionarTaxa} className="mt-3 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Adicionar taxa</button>
          </section>

          {/* Exigência de antecipação */}
          <section className="rounded-xl border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-800">Exigência de antecipação (ativa a Cláusula 7.5)</h2>
            <div className="mt-3 space-y-2">
              {exigs.length === 0 ? <p className="text-sm text-neutral-400">Nenhuma exigência cadastrada.</p> : null}
              {exigs.map((x) => (
                <div key={x.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm">
                  <span>
                    {x.ativa ? "✅ ativa" : "⚪ inativa"} · {x.evento_gerador} · {x.documento_viabilizado} · {x.valor != null ? `${x.moeda} ${x.valor}` : `${x.percentual}%`} · limite {x.data_limite_ancora}+{x.data_limite_valor} {x.data_limite_unidade}
                  </span>
                  <button onClick={() => removerExig(x.id)} className="ml-3 text-red-600 hover:underline">Remover</button>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {sel(novaExig.ativa, (v) => setNovaExig({ ...novaExig, ativa: v }), [["false", "Inativa"], ["true", "Ativa (exige comprovante)"]])}
              {sel(novaExig.eventoGerador, (v) => setNovaExig({ ...novaExig, eventoGerador: v }), EVENTOS)}
              <input className={inputCls} placeholder="Documento viabilizado (ex.: LOA)" value={novaExig.documentoViabilizado} onChange={(e) => setNovaExig({ ...novaExig, documentoViabilizado: e.target.value })} />
              <input className={inputCls} placeholder="Comprovante (ref/URL)" value={novaExig.comprovanteRef} onChange={(e) => setNovaExig({ ...novaExig, comprovanteRef: e.target.value })} />
              <input className={inputCls} type="number" placeholder={`Valor (${moeda}) — ou % ao lado`} value={novaExig.valor} onChange={(e) => setNovaExig({ ...novaExig, valor: e.target.value, percentual: "" })} />
              <input className={inputCls} type="number" placeholder="Percentual (0-100)" value={novaExig.percentual} onChange={(e) => setNovaExig({ ...novaExig, percentual: e.target.value, valor: "" })} />
              {sel(novaExig.dataLimiteAncora, (v) => setNovaExig({ ...novaExig, dataLimiteAncora: v }), ANCORAS)}
              {sel(novaExig.dataLimiteUnidade, (v) => setNovaExig({ ...novaExig, dataLimiteUnidade: v }), UNIDADES)}
              <input className={inputCls} type="number" placeholder="Data-limite — valor" value={novaExig.dataLimiteValor} onChange={(e) => setNovaExig({ ...novaExig, dataLimiteValor: e.target.value })} />
            </div>
            <button onClick={adicionarExig} className="mt-3 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">Adicionar exigência</button>
          </section>
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-neutral-400">
          {campi.length === 0 ? "Nenhum campus no seu escopo." : "Selecione um campus para configurar."}
        </p>
      )}
    </div>
  );
}
