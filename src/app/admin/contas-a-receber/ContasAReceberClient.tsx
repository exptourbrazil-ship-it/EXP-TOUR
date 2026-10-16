"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { calcularComissaoFatura } from "@/lib/comissao-fatura";
import { KINDS_COMISSAO, KIND_ROTULO, descreverRegra } from "@/lib/comissao-regra";
import type { EmissorFatura, StatusExibicao } from "@/lib/comissao-fatura";

type Fatura = {
  id: string;
  numero: string;
  supplier_id: string;
  supplierNome: string | null;
  student_name: string | null;
  program_name: string | null;
  currency: string;
  commission_amount: number | string;
  received_amount: number | string;
  saldo: number;
  due_date: string | null;
  issue_date: string | null;
  status: string;
  exibicao: StatusExibicao;
  diasAtraso: number;
  sent_at: string | null;
  school_expected_at: string | null;
  school_note: string | null;
};

type Totais = { moeda: string; emAberto: number; vencido: number }[];
type Caso = { id: string; rotulo: string; supplierNome: string | null };
type Escola = { id: string; nome: string };

const inp = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs text-neutral-500";

const CHIP: Record<StatusExibicao, { texto: string; icone: string; cls: string }> = {
  rascunho: { texto: "Rascunho", icone: "✎", cls: "bg-neutral-100 text-neutral-700" },
  emitida: { texto: "Emitida", icone: "●", cls: "bg-blue-100 text-blue-800" },
  enviada: { texto: "Enviada", icone: "✉", cls: "bg-blue-100 text-blue-800" },
  parcial: { texto: "Parcial", icone: "◐", cls: "bg-amber-100 text-amber-800" },
  vencida: { texto: "Vencida", icone: "⚠", cls: "bg-red-100 text-red-700" },
  paga: { texto: "Paga", icone: "✓", cls: "bg-emerald-100 text-emerald-800" },
  cancelada: { texto: "Cancelada", icone: "✕", cls: "bg-neutral-100 text-neutral-500" },
};

function fmtMoeda(v: number | string, moeda: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(Number(v));
  } catch {
    return `${moeda} ${Number(v).toFixed(2)}`;
  }
}
function fmtData(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}
const hoje = () => new Date().toISOString().slice(0, 10);

async function chamar(url: string, init: RequestInit): Promise<{ ok: boolean; erro?: string; dados?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, init);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || json.ok === false) return { ok: false, erro: String(json.erro || "Não foi possível concluir a ação.") };
    return { ok: true, dados: json };
  } catch {
    return { ok: false, erro: "Erro de rede. Tente novamente." };
  }
}

export default function ContasAReceberClient({
  faturas,
  totais,
  emissor,
  casos,
  escolas,
  podeGerir,
}: {
  faturas: Fatura[];
  totais: Totais;
  emissor: EmissorFatura | null;
  casos: Caso[];
  escolas: Escola[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);
  const [emissorAberto, setEmissorAberto] = useState(false);
  const [receberId, setReceberId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"abertas" | "todas">("abertas");

  const visiveis = useMemo(
    () => (filtro === "abertas" ? faturas.filter((f) => f.status === "rascunho" || f.status === "emitida" || f.status === "enviada") : faturas),
    [faturas, filtro],
  );

  function ok(texto: string) {
    setMsg({ tipo: "ok", texto });
    router.refresh();
  }

  async function acao(id: string, chave: string, fn: () => Promise<{ ok: boolean; erro?: string; dados?: Record<string, unknown> }>, sucesso: (d?: Record<string, unknown>) => string) {
    setOcupado(id + chave);
    setMsg(null);
    const r = await fn();
    setOcupado(null);
    if (!r.ok) setMsg({ tipo: "erro", texto: r.erro || "Falhou." });
    else ok(sucesso(r.dados));
  }

  const emitir = (f: Fatura, enviar: boolean) =>
    acao(
      f.id,
      enviar ? "env" : "emi",
      () => chamar(`/api/admin/contas-a-receber/${f.id}/emitir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enviar }) }),
      (d) => {
        if (!enviar) return "Fatura emitida.";
        const env = (d?.enviados as string[] | undefined)?.length ?? 0;
        const fal = (d?.falhas as string[] | undefined)?.length ?? 0;
        if (d?.semDestinatario) return "Fatura emitida, mas a escola não tem contato financeiro ativo no portal: baixe o PDF e envie manualmente.";
        return `Fatura enviada a ${env} contato(s)${fal ? `; ${fal} falha(s) de envio (veja o log de e-mails)` : ""}.`;
      },
    );

  const cancelar = (f: Fatura) => {
    const motivo = window.prompt(`Motivo do cancelamento da fatura ${f.numero}:`);
    if (!motivo) return;
    void acao(f.id, "can", () => chamar(`/api/admin/contas-a-receber/${f.id}/cancelar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) }), () => "Fatura cancelada.");
  };

  return (
    <div>
      {msg ? (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${msg.tipo === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.texto}</div>
      ) : null}

      {totais.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          {totais.map((t) => (
            <div key={t.moeda} className="rounded-xl border border-neutral-200 bg-white px-4 py-2">
              <div className="text-xs text-neutral-500">A receber ({t.moeda})</div>
              <div className="font-serif text-xl text-brand">{fmtMoeda(t.emAberto, t.moeda)}</div>
              {t.vencido > 0 ? <div className="text-xs font-medium text-red-700">⚠ {fmtMoeda(t.vencido, t.moeda)} vencido</div> : <div className="text-xs text-neutral-400">nada vencido</div>}
            </div>
          ))}
        </div>
      ) : null}

      {!emissor ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ Cadastre os <b>dados da fatura</b> (razão social, e-mail e dados bancários) antes de emitir. {podeGerir ? "Use o botão abaixo." : "Peça ao financeiro."}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {podeGerir ? (
          <>
            <button type="button" onClick={() => setNovaAberta((v) => !v)} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">
              {novaAberta ? "Fechar formulário" : "+ Nova fatura de comissão"}
            </button>
            <button type="button" onClick={() => setEmissorAberto((v) => !v)} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700">
              Dados da fatura (emissor)
            </button>
          </>
        ) : null}
        <div className="ml-auto flex gap-1 text-sm">
          {(["abertas", "todas"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-full px-3 py-1 ${filtro === k ? "bg-brand text-white" : "bg-neutral-100 text-neutral-700"}`}>
              {k === "abertas" ? "Em aberto" : "Todas"}
            </button>
          ))}
        </div>
      </div>

      {podeGerir && emissorAberto ? <EmissorForm inicial={emissor} onSalvo={() => { setEmissorAberto(false); ok("Dados da fatura salvos."); }} onErro={(t) => setMsg({ tipo: "erro", texto: t })} /> : null}
      {podeGerir && novaAberta ? <NovaFaturaForm casos={casos} escolas={escolas} onCriada={(n) => { setNovaAberta(false); ok(`Fatura ${n} criada (rascunho).`); }} onErro={(t) => setMsg({ tipo: "erro", texto: t })} /> : null}

      {visiveis.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhuma fatura {filtro === "abertas" ? "em aberto" : "cadastrada"}.</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm" style={{ minWidth: 880 }}>
            <thead className="text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Fatura</th>
                <th className="px-4 py-2">Escola / aluno</th>
                <th className="px-4 py-2 text-right">Comissão</th>
                <th className="px-4 py-2 text-right">Recebido</th>
                <th className="px-4 py-2">Vencimento</th>
                <th className="px-4 py-2">Situação</th>
                <th className="px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="text-neutral-700">
              {visiveis.map((f) => {
                const chip = CHIP[f.exibicao];
                const aberta = f.status === "emitida" || f.status === "enviada";
                return (
                  <tr key={f.id} className="border-t border-neutral-100 align-top">
                    <td className="px-4 py-2 font-medium text-brand">{f.numero}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-brand">{f.supplierNome || "—"}</div>
                      <div className="text-xs text-neutral-500">{f.student_name || f.program_name || "—"}</div>
                      {f.school_expected_at || f.school_note ? (
                        <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                          Escola informou{f.school_expected_at ? `: pagamento previsto em ${fmtData(f.school_expected_at)}` : ""}{f.school_note ? ` — “${f.school_note}”` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoeda(f.commission_amount, f.currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(f.received_amount) > 0 ? fmtMoeda(f.received_amount, f.currency) : "—"}</td>
                    <td className="px-4 py-2">
                      {fmtData(f.due_date)}
                      {f.diasAtraso > 0 ? <div className="text-xs font-medium text-red-700">{f.diasAtraso} dia(s) de atraso</div> : null}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${chip.cls}`}>
                        <span aria-hidden>{chip.icone}</span>
                        {chip.texto}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {f.status !== "rascunho" && f.status !== "cancelada" ? (
                          <a href={`/api/admin/contas-a-receber/${f.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-md border border-neutral-300 px-2 py-1 text-xs">PDF</a>
                        ) : null}
                        {podeGerir && f.status === "rascunho" ? (
                          <>
                            <button type="button" disabled={ocupado !== null} onClick={() => emitir(f, true)} className="rounded-md bg-brand px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Emitir e enviar</button>
                            <button type="button" disabled={ocupado !== null} onClick={() => emitir(f, false)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50">Só emitir</button>
                          </>
                        ) : null}
                        {podeGerir && aberta ? (
                          <>
                            <button type="button" disabled={ocupado !== null} onClick={() => emitir(f, true)} className="rounded-md border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50">{f.status === "enviada" ? "Reenviar" : "Enviar"}</button>
                            <button type="button" onClick={() => setReceberId(receberId === f.id ? null : f.id)} className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white">Registrar recebimento</button>
                          </>
                        ) : null}
                        {podeGerir && (f.status === "rascunho" || aberta) && Number(f.received_amount) === 0 ? (
                          <button type="button" disabled={ocupado !== null} onClick={() => cancelar(f)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 disabled:opacity-50">Cancelar</button>
                        ) : null}
                      </div>
                      {podeGerir && receberId === f.id ? (
                        <ReceberForm fatura={f} onFeito={() => { setReceberId(null); ok("Recebimento registrado."); }} onErro={(t) => setMsg({ tipo: "erro", texto: t })} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Recebimento ──────────────────────────────────────────────────────────────
function ReceberForm({ fatura, onFeito, onErro }: { fatura: Fatura; onFeito: () => void; onErro: (t: string) => void }) {
  const [valor, setValor] = useState(String(fatura.saldo));
  const [data, setData] = useState(hoje());
  const [ref, setRef] = useState("");
  const [arq, setArq] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const fd = new FormData();
    fd.set("amount", valor);
    fd.set("receivedAt", data);
    if (ref.trim()) fd.set("reference", ref.trim());
    if (arq) fd.set("comprovante", arq);
    const r = await chamar(`/api/admin/contas-a-receber/${fatura.id}/receber`, { method: "POST", body: fd });
    setSalvando(false);
    if (r.ok) onFeito();
    else onErro(r.erro || "Falhou.");
  }
  return (
    <form onSubmit={enviar} className="mt-2 grid gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="text-xs text-neutral-500">Saldo em aberto: {fmtMoeda(fatura.saldo, fatura.currency)}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={lbl}>Valor recebido ({fatura.currency})</label><input className={inp} value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" required /></div>
        <div><label className={lbl}>Data do recebimento</label><input className={inp} type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} required /></div>
      </div>
      <div><label className={lbl}>Referência (transferência/wire)</label><input className={inp} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={200} /></div>
      <div><label className={lbl}>Comprovante (PDF/imagem, opcional)</label><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArq(e.target.files?.[0] ?? null)} className="text-xs" /></div>
      <button type="submit" disabled={salvando} className="justify-self-start rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{salvando ? "Registrando…" : "Confirmar recebimento"}</button>
    </form>
  );
}

// ── Emissor ──────────────────────────────────────────────────────────────────
function EmissorForm({ inicial, onSalvo, onErro }: { inicial: EmissorFatura | null; onSalvo: () => void; onErro: (t: string) => void }) {
  const [v, setV] = useState({
    legalName: inicial?.legalName ?? "",
    address: inicial?.address ?? "",
    taxId: inicial?.taxId ?? "",
    email: inicial?.email ?? "",
    paymentInstructions: inicial?.paymentInstructions ?? "",
    paymentTermsDays: inicial?.paymentTermsDays != null ? String(inicial.paymentTermsDays) : "30",
  });
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const r = await chamar("/api/admin/contas-a-receber/emissor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    setSalvando(false);
    if (r.ok) onSalvo();
    else onErro(r.erro || "Falhou.");
  }
  return (
    <form onSubmit={salvar} className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-sm text-neutral-600">Estes dados saem no PDF da fatura (em inglês) e no e-mail enviado à escola.</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={lbl}>Razão social *</label><input className={inp} value={v.legalName} onChange={(e) => set({ legalName: e.target.value })} required /></div>
        <div><label className={lbl}>CNPJ / identificação fiscal</label><input className={inp} value={v.taxId} onChange={(e) => set({ taxId: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className={lbl}>Endereço</label><input className={inp} value={v.address} onChange={(e) => set({ address: e.target.value })} /></div>
        <div><label className={lbl}>E-mail do financeiro *</label><input className={inp} type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} required /></div>
        <div><label className={lbl}>Prazo padrão de pagamento (dias)</label><input className={inp} inputMode="numeric" value={v.paymentTermsDays} onChange={(e) => set({ paymentTermsDays: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className={lbl}>Instruções de pagamento / dados bancários (em inglês) *</label><textarea className={inp} rows={5} value={v.paymentInstructions} onChange={(e) => set({ paymentInstructions: e.target.value })} required placeholder={"Beneficiary: ...\nBank: ...\nSWIFT/BIC: ...\nIBAN / Account: ...\nCurrency: ..."} /></div>
      </div>
      <button type="submit" disabled={salvando} className="justify-self-start rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{salvando ? "Salvando…" : "Salvar dados da fatura"}</button>
    </form>
  );
}

// ── Nova fatura (com linhas por item) ────────────────────────────────────────
type RegraTela = { origem: "produto" | "tipo" | "padrao"; basis: string; type: string; value: number; currency: string | null } | null;
type ItemForm = { key: number; kind: string; productId: string; description: string; baseAmount: string; manual: boolean; commissionAmount: string; regra: RegraTela };
type ProdutoEscola = { id: string; name: string; kind: string };

const ORIGEM_ROTULO: Record<string, string> = { produto: "regra do produto", tipo: "regra do tipo", padrao: "acordo padrão" };
let proximaChave = 1;
const novoItem = (p: Partial<ItemForm> = {}): ItemForm => ({ key: proximaChave++, kind: "program", productId: "", description: "", baseAmount: "", manual: false, commissionAmount: "", regra: null, ...p });

function comissaoDoItem(it: ItemForm, currency: string, weeks: number | null): number | null {
  const base = Number(String(it.baseAmount).replace(",", "."));
  if (!(base > 0)) return null;
  if (it.manual) {
    const m = Number(String(it.commissionAmount).replace(",", "."));
    return Number.isFinite(m) && m >= 0 ? m : null;
  }
  if (!it.regra) return null;
  if (it.regra.basis === "none") return 0;
  return calcularComissaoFatura({ base, currency, type: it.regra.type as "percent" | "fixed_per_sale" | "fixed_per_week", value: it.regra.value, acordoCurrency: it.regra.currency, weeks });
}

function NovaFaturaForm({ casos, escolas, onCriada, onErro }: { casos: Caso[]; escolas: Escola[]; onCriada: (numero: string) => void; onErro: (t: string) => void }) {
  const [contratoId, setContratoId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [v, setV] = useState({ currency: "", studentName: "", programName: "", startDate: "", endDate: "", weeks: "", paidToSchoolAt: "", notes: "" });
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);
  const [produtos, setProdutos] = useState<ProdutoEscola[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));
  const weeks = Number(v.weeks) > 0 ? Number(v.weeks) : null;

  // Resolve (no servidor) a regra de cada linha: produto > tipo > acordo padrao da escola.
  async function resolver(escola: string, lista: ItemForm[]): Promise<ItemForm[]> {
    if (!escola) return lista;
    const r = await chamar("/api/admin/contas-a-receber/resolver", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId: escola, itens: lista.map((i) => ({ kind: i.kind, productId: i.productId || null })) }),
    });
    if (!r.ok) { onErro(r.erro || "Não foi possível carregar as regras de comissão."); return lista; }
    const regras = (r.dados?.regras ?? []) as (null | { origem: "produto" | "tipo" | "padrao"; basis: string; type: string; value: number; currency: string | null })[];
    setProdutos((r.dados?.produtos ?? []) as ProdutoEscola[]);
    return lista.map((it, idx) => ({ ...it, regra: regras[idx] ?? null }));
  }

  async function mudarEscola(id: string) {
    setSupplierId(id);
    setItens(await resolver(id, itens));
  }

  async function atualizarItem(key: number, patch: Partial<ItemForm>, reresolver: boolean) {
    const lista = itens.map((i) => (i.key === key ? { ...i, ...patch } : i));
    setItens(lista);
    if (reresolver) setItens(await resolver(supplierId, lista));
  }

  async function escolherCaso(id: string) {
    setContratoId(id);
    setAviso(null);
    if (!id) return;
    const r = await chamar(`/api/admin/contas-a-receber?sugerir=${id}`, { method: "GET" });
    const s = (r.dados?.sugestao ?? null) as null | { supplierId: string; studentName: string | null; programName: string | null; startDate: string | null; currency: string | null; valorContrato: number | null; jaTemFatura: boolean; acordo: unknown };
    if (!r.ok || !s) { onErro(r.erro || "Não foi possível carregar o caso."); return; }
    setSupplierId(s.supplierId);
    set({ currency: s.currency || "", studentName: s.studentName || "", programName: s.programName || "", startDate: s.startDate || "" });
    const lista = [novoItem({ kind: "program", description: s.programName || "Programa", baseAmount: s.valorContrato != null ? String(s.valorContrato) : "" })];
    setItens(await resolver(s.supplierId, lista));
    setAviso(
      (s.jaTemFatura ? "Já existe uma fatura ativa para este caso. " : "") +
        "A base de cada linha vem do valor do contrato: ajuste para o que o aluno pagou à escola e acrescente a acomodação e outros itens, cada um com a sua regra de comissão.",
    );
  }

  const comissoes = itens.map((it) => comissaoDoItem(it, v.currency, weeks));
  const totalBase = itens.reduce((a, it) => a + (Number(String(it.baseAmount).replace(",", ".")) || 0), 0);
  const totalComissao = comissoes.reduce<number>((a, c) => a + (c ?? 0), 0);
  const faltaRegra = itens.some((it, i) => comissoes[i] === null && Number(String(it.baseAmount).replace(",", ".")) > 0);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    const corpo = {
      supplierId, contratoId: contratoId || undefined, ...v,
      itens: itens.map((it) => ({
        kind: it.kind, productId: it.productId || undefined, description: it.description, baseAmount: it.baseAmount,
        ...(it.manual ? { commissionAmount: it.commissionAmount } : {}),
      })),
    };
    const r = await chamar("/api/admin/contas-a-receber", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    setSalvando(false);
    if (r.ok) onCriada(String(r.dados?.numero ?? ""));
    else onErro(r.erro || "Falhou.");
  }

  return (
    <form onSubmit={criar} className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={lbl}>Caso (preenche os dados automaticamente)</label>
          <select className={inp} value={contratoId} onChange={(e) => void escolherCaso(e.target.value)}>
            <option value="">— sem caso (preencher à mão) —</option>
            {casos.map((c) => <option key={c.id} value={c.id}>{c.rotulo}{c.supplierNome ? ` · ${c.supplierNome}` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Escola *</label>
          <select className={inp} value={supplierId} onChange={(e) => void mudarEscola(e.target.value)} required disabled={!!contratoId}>
            <option value="">— escolha —</option>
            {escolas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      </div>
      {aviso ? <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{aviso}</div> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className={lbl}>Aluno</label><input className={inp} value={v.studentName} onChange={(e) => set({ studentName: e.target.value })} /></div>
        <div className="sm:col-span-2"><label className={lbl}>Programa</label><input className={inp} value={v.programName} onChange={(e) => set({ programName: e.target.value })} /></div>
        <div><label className={lbl}>Moeda *</label><input className={inp} value={v.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase().slice(0, 3) })} placeholder="EUR" required /></div>
        <div><label className={lbl}>Início</label><input className={inp} type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} /></div>
        <div><label className={lbl}>Término</label><input className={inp} type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} /></div>
        <div><label className={lbl}>Semanas</label><input className={inp} inputMode="decimal" value={v.weeks} onChange={(e) => set({ weeks: e.target.value })} /></div>
        <div><label className={lbl}>Data do pagamento à escola</label><input className={inp} type="date" value={v.paidToSchoolAt} onChange={(e) => set({ paidToSchoolAt: e.target.value })} /></div>
      </div>

      <div>
        <div className="mb-1 flex items-center">
          <span className="text-sm font-medium text-brand">Itens que o aluno pagou à escola</span>
          <button type="button" onClick={() => setItens((l) => [...l, novoItem({ kind: "accommodation" })])} className="ml-auto rounded-md border border-neutral-300 px-2 py-1 text-xs">+ Item</button>
        </div>
        <div className="grid gap-2">
          {itens.map((it, idx) => {
            const c = comissoes[idx];
            const prods = produtos.filter((p) => p.kind === it.kind);
            return (
              <div key={it.key} className="grid gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-12">
                <div className="sm:col-span-2"><label className={lbl}>Tipo</label>
                  <select className={inp} value={it.kind} onChange={(e) => void atualizarItem(it.key, { kind: e.target.value, productId: "" }, true)}>
                    {KINDS_COMISSAO.map((k) => <option key={k} value={k}>{KIND_ROTULO[k]}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3"><label className={lbl}>Produto (opcional)</label>
                  <select className={inp} value={it.productId} onChange={(e) => void atualizarItem(it.key, { productId: e.target.value, description: it.description || (produtos.find((p) => p.id === e.target.value)?.name ?? "") }, true)}>
                    <option value="">— qualquer —</option>
                    {prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-3"><label className={lbl}>Descrição *</label><input className={inp} value={it.description} onChange={(e) => void atualizarItem(it.key, { description: e.target.value }, false)} maxLength={200} required /></div>
                <div className="sm:col-span-2"><label className={lbl}>Valor pago *</label><input className={inp} inputMode="decimal" value={it.baseAmount} onChange={(e) => void atualizarItem(it.key, { baseAmount: e.target.value }, false)} required /></div>
                <div className="sm:col-span-2">
                  <label className={lbl}>Comissão {it.manual ? "(manual)" : ""}</label>
                  {it.manual ? (
                    <input className={inp} inputMode="decimal" value={it.commissionAmount} onChange={(e) => void atualizarItem(it.key, { commissionAmount: e.target.value }, false)} required />
                  ) : (
                    <div className={`${inp} bg-white tabular-nums`}>{c != null ? fmtMoeda(c, v.currency || "USD") : "—"}</div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 sm:col-span-12">
                  <span>
                    {it.manual ? "ajuste manual" : it.regra ? <>{descreverRegra({ basis: it.regra.basis as never, type: it.regra.type as never, value: it.regra.value, currency: it.regra.currency })} <span className="text-neutral-400">({ORIGEM_ROTULO[it.regra.origem]})</span></> : <span className="text-amber-700">sem regra aplicável — use o ajuste manual</span>}
                  </span>
                  <button type="button" className="underline" onClick={() => void atualizarItem(it.key, { manual: !it.manual, commissionAmount: it.manual ? "" : c != null ? String(c) : "" }, false)}>{it.manual ? "voltar à regra" : "ajustar manualmente"}</button>
                  {itens.length > 1 ? <button type="button" className="ml-auto text-red-700 underline" onClick={() => setItens((l) => l.filter((x) => x.key !== it.key))}>remover</button> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-end gap-6 text-sm">
          <span className="text-neutral-500">Pago à escola: <b className="tabular-nums text-neutral-800">{fmtMoeda(totalBase, v.currency || "USD")}</b></span>
          <span className="text-neutral-500">Comissão total: <b className="tabular-nums text-brand">{fmtMoeda(totalComissao, v.currency || "USD")}</b></span>
        </div>
      </div>

      <div><label className={lbl}>Observações (saem na fatura)</label><textarea className={inp} rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} /></div>
      <button type="submit" disabled={salvando || faltaRegra} className="justify-self-start rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{salvando ? "Criando…" : "Criar fatura (rascunho)"}</button>
      {faltaRegra ? <div className="text-xs text-amber-700">Algum item não tem regra de comissão: cadastre em Fornecedores → Comissões ou use o ajuste manual no item.</div> : null}
    </form>
  );
}
