// Contas a receber de COMISSAO das escolas. SERVER-ONLY (service role).
//
// Fluxo: o aluno paga o programa direto a escola -> o financeiro cria a fatura
// (rascunho) -> emite (e envia por e-mail com o PDF) -> acompanha o vencimento ->
// registra o recebimento. Todas as acoes que mudam estado sao funcoes nomeadas,
// auditadas (admin_audit); o dinheiro so muda por registrar_recebimento_comissao
// (RPC atomica), nunca por tela solta. Posse sempre por tenant (e pelo
// supplier_id da sessao, no lado do fornecedor).
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import {
  calcularComissaoFatura,
  normalizarEmissor,
  saldoFatura,
  statusExibicao,
  validarNovaFatura,
  vencimentoPadrao,
  lembreteDevido,
  diferencaDias,
  type EmissorFatura,
  type EntradaNovaFatura,
  type StatusExibicao,
  type StatusFatura,
  type TipoLembrete,
} from "@/lib/comissao-fatura";
import { resolverRegra, validarRegra, type RegraArmazenada, type RegraComissao } from "@/lib/comissao-regra";

export type Resultado<T = unknown> = ({ ok: true } & T) | { ok: false; erro: string };

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const SEL_FATURA =
  "id, tenant_id, supplier_id, contrato_id, numero, status, currency, student_name, program_name, start_date, end_date, weeks, paid_to_school_amount, paid_to_school_at, commission_basis, commission_type, commission_value, commission_amount, issue_date, due_date, sent_at, sent_to, received_amount, paid_at, notes, school_expected_at, school_note, school_note_at, created_by, created_at, cancelled_at, cancel_reason";

export type FaturaRow = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  contrato_id: string | null;
  numero: string;
  status: StatusFatura;
  currency: string;
  student_name: string | null;
  program_name: string | null;
  start_date: string | null;
  end_date: string | null;
  weeks: number | null;
  paid_to_school_amount: number;
  paid_to_school_at: string | null;
  commission_basis: string | null;
  commission_type: string | null;
  commission_value: number | null;
  commission_amount: number;
  issue_date: string | null;
  due_date: string | null;
  sent_at: string | null;
  sent_to: string[] | null;
  received_amount: number;
  paid_at: string | null;
  notes: string | null;
  school_expected_at: string | null;
  school_note: string | null;
  school_note_at: string | null;
  created_by: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

export type FaturaLista = FaturaRow & {
  supplierNome: string | null;
  exibicao: StatusExibicao;
  diasAtraso: number;
  saldo: number;
};

// ── Emissor (tenant_config.fatura_emissor) ───────────────────────────────────

export async function obterEmissor(supabase: SupabaseClient, tenantId: string): Promise<EmissorFatura | null> {
  const { data } = await supabase.from("tenant_config").select("fatura_emissor").eq("tenant_id", tenantId).maybeSingle();
  const raw = (data as { fatura_emissor?: unknown } | null)?.fatura_emissor;
  if (!raw) return null;
  const r = normalizarEmissor(raw);
  return r.ok ? r.valor : null;
}

export async function salvarEmissor(
  supabase: SupabaseClient,
  args: { tenantId: string; adminUser: string; ip?: string | null; entrada: unknown },
): Promise<Resultado> {
  const r = normalizarEmissor(args.entrada);
  if (!r.ok) return { ok: false, erro: r.erro };
  const anterior = await obterEmissor(supabase, args.tenantId);
  const { error } = await supabase
    .from("tenant_config")
    .upsert({ tenant_id: args.tenantId, fatura_emissor: r.valor, atualizado_em: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) {
    console.error("[comissao] salvar emissor:", error.message);
    return { ok: false, erro: "Não foi possível salvar os dados da fatura." };
  }
  // Trilha: quais campos mudaram e o hash curto das instrucoes de pagamento antes/depois
  // (dado bancario sai em todo PDF/e-mail: troca silenciosa e vetor de desvio de pagamento).
  const campos = (Object.keys(r.valor) as (keyof EmissorFatura)[]).filter((k) => !anterior || anterior[k] !== r.valor[k]);
  const h = (v: string | undefined) => (v ? createHash("sha256").update(v).digest("hex").slice(0, 12) : null);
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.adminUser,
    acao: "financeiro.fatura_emissor.definir",
    alvo: args.tenantId,
    detalhe: { campos_alterados: campos, instrucoes_hash_antes: h(anterior?.paymentInstructions), instrucoes_hash_depois: h(r.valor.paymentInstructions) },
    ip: args.ip ?? null,
  });
  return { ok: true };
}

// ── Sugestao para o formulario ───────────────────────────────────────────────

export type SugestaoFatura = {
  supplierId: string;
  supplierNome: string | null;
  contratoId: string;
  studentName: string | null;
  programName: string | null;
  startDate: string | null;
  currency: string | null;
  valorContrato: number | null;
  acordo: { basis: string; type: string; value: number; currency: string | null } | null;
  jaTemFatura: boolean;
};

type ContratoComSupplier = {
  id: string;
  estudante_nome: string | null;
  nome: string | null;
  valor_total: number | null;
  moeda: string | null;
  data_inicio: string | null;
  supplier_id: string | null;
  supplier: { id: string; display_name: string | null; tenant_id: string } | { id: string; display_name: string | null; tenant_id: string }[] | null;
};

function umSupplier(c: ContratoComSupplier) {
  return Array.isArray(c.supplier) ? c.supplier[0] ?? null : c.supplier;
}

async function acordoVigente(supabase: SupabaseClient, supplierId: string, hoje: string) {
  const { data } = await supabase
    .from("supplier_agreement")
    .select("commission_basis, commission_type, commission_value, currency, valid_from, valid_until")
    .eq("supplier_id", supplierId)
    .is("archived_at", null)
    .order("valid_from", { ascending: false });
  for (const a of (data ?? []) as { commission_basis: string; commission_type: string; commission_value: number; currency: string | null; valid_from: string; valid_until: string | null }[]) {
    if (a.valid_from > hoje) continue;
    if (a.valid_until && String(a.valid_until) < hoje) continue;
    return { basis: a.commission_basis, type: a.commission_type, value: Number(a.commission_value), currency: a.currency };
  }
  return null;
}

export async function sugerirDoCaso(supabase: SupabaseClient, tenantId: string, contratoId: string): Promise<SugestaoFatura | null> {
  const { data } = await supabase
    .from("contratos")
    .select("id, estudante_nome, nome, valor_total, moeda, data_inicio, supplier_id, supplier:supplier(id, display_name, tenant_id)")
    .eq("id", contratoId)
    .maybeSingle();
  const c = data as ContratoComSupplier | null;
  const sup = c ? umSupplier(c) : null;
  if (!c || !sup || sup.tenant_id !== tenantId) return null;
  const [acordo, existente] = await Promise.all([
    acordoVigente(supabase, sup.id, hojeISO()),
    supabase.from("comissao_fatura").select("id").eq("tenant_id", tenantId).eq("contrato_id", contratoId).neq("status", "cancelada").limit(1),
  ]);
  return {
    supplierId: sup.id,
    supplierNome: sup.display_name,
    contratoId: c.id,
    studentName: c.estudante_nome,
    programName: c.nome,
    startDate: c.data_inicio,
    currency: c.moeda,
    valorContrato: c.valor_total != null ? Number(c.valor_total) : null,
    acordo,
    jaTemFatura: (existente.data ?? []).length > 0,
  };
}

export async function listarCasosParaFatura(supabase: SupabaseClient, tenantId: string): Promise<{ id: string; rotulo: string; supplierNome: string | null }[]> {
  const { data } = await supabase
    .from("contratos")
    .select("id, estudante_nome, nome, supplier_id, cancelado_em, supplier:supplier(id, display_name, tenant_id)")
    .not("supplier_id", "is", null)
    .is("cancelado_em", null)
    .order("created_at", { ascending: false });
  return ((data ?? []) as (ContratoComSupplier & { cancelado_em: string | null })[])
    .filter((c) => umSupplier(c)?.tenant_id === tenantId)
    .map((c) => ({
      id: c.id,
      rotulo: `${c.estudante_nome || "(sem nome)"}${c.nome ? " — " + c.nome : ""}`,
      supplierNome: umSupplier(c)?.display_name ?? null,
    }));
}

export async function listarEscolas(supabase: SupabaseClient, tenantId: string): Promise<{ id: string; nome: string }[]> {
  const { data } = await supabase
    .from("supplier")
    .select("id, display_name")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("display_name", { ascending: true });
  return ((data ?? []) as { id: string; display_name: string }[]).map((s) => ({ id: s.id, nome: s.display_name }));
}

// ── Criar ────────────────────────────────────────────────────────────────────

export async function criarFatura(
  supabase: SupabaseClient,
  args: { tenantId: string; adminUser: string; ip?: string | null; entrada: EntradaNovaFatura },
): Promise<Resultado<{ id: string; numero: string }>> {
  // Itens sem regra informada recebem a regra aplicavel (produto > tipo > padrao da escola),
  // resolvida AQUI no servidor a partir do banco — nao do que a tela diz.
  const entrada = await preencherRegrasDosItens(supabase, args.tenantId, args.entrada);
  const v = validarNovaFatura(entrada);
  if (!v.ok) return { ok: false, erro: v.erro };
  const f = v.valor;

  // Posse: a escola e do tenant; o caso (se houver) e dessa escola.
  const { data: sup } = await supabase.from("supplier").select("id, tenant_id").eq("id", f.supplierId).maybeSingle();
  if (!sup || (sup as { tenant_id: string }).tenant_id !== args.tenantId) return { ok: false, erro: "Escola não encontrada." };
  if (f.contratoId) {
    const { data: ctr } = await supabase.from("contratos").select("id, supplier_id").eq("id", f.contratoId).maybeSingle();
    if (!ctr || (ctr as { supplier_id: string | null }).supplier_id !== f.supplierId) {
      return { ok: false, erro: "O caso não pertence a esta escola." };
    }
  }

  const { data, error } = await supabase
    .from("comissao_fatura")
    .insert({
      tenant_id: args.tenantId,
      supplier_id: f.supplierId,
      contrato_id: f.contratoId,
      currency: f.currency,
      student_name: f.studentName,
      program_name: f.programName,
      start_date: f.startDate,
      end_date: f.endDate,
      weeks: f.weeks,
      paid_to_school_amount: f.paidToSchoolAmount,
      paid_to_school_at: f.paidToSchoolAt,
      commission_basis: f.commissionBasis,
      commission_type: f.commissionType,
      commission_value: f.commissionValue,
      commission_amount: f.commissionAmount,
      notes: f.notes,
      created_by: args.adminUser,
    })
    .select("id, numero")
    .single();
  if (error || !data) {
    if (error && (error as { code?: string }).code === "23505") {
      return { ok: false, erro: "Já existe uma fatura ativa para este caso. Cancele a anterior para criar outra." };
    }
    console.error("[comissao] criar:", error?.message);
    return { ok: false, erro: "Não foi possível criar a fatura." };
  }
  const faturaId = (data as { id: string }).id;
  if (f.itens.length > 0) {
    // Confere que cada produto citado e da escola (posse) antes de gravar as linhas.
    const ids = [...new Set(f.itens.map((i) => i.productId).filter((x): x is string => !!x))];
    if (ids.length > 0) {
      const dono = await produtosDaEscolaPorIds(supabase, f.supplierId, ids);
      if (dono.size !== ids.length) {
        await supabase.from("comissao_fatura").delete().eq("id", faturaId).eq("tenant_id", args.tenantId);
        return { ok: false, erro: "Um dos produtos informados não pertence a esta escola." };
      }
    }
    const { error: eItens } = await supabase.from("comissao_fatura_item").insert(
      f.itens.map((it, idx) => ({
        tenant_id: args.tenantId,
        fatura_id: faturaId,
        sort: idx,
        kind: it.kind,
        product_id: it.productId,
        description: it.description,
        base_amount: it.baseAmount,
        commission_basis: it.commissionBasis,
        commission_type: it.commissionType,
        commission_value: it.commissionValue,
        rule_source: it.ruleSource,
        commission_amount: it.commissionAmount,
      })),
    );
    if (eItens) {
      // Sem transacao no cliente: desfaz a fatura para nao ficar um total sem as linhas.
      await supabase.from("comissao_fatura").delete().eq("id", faturaId).eq("tenant_id", args.tenantId);
      console.error("[comissao] itens:", eItens.message);
      return { ok: false, erro: "Não foi possível criar os itens da fatura." };
    }
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.adminUser,
    acao: "financeiro.fatura_comissao.criar",
    alvo: faturaId,
    detalhe: { numero: (data as { numero: string }).numero, supplierId: f.supplierId, contratoId: f.contratoId, currency: f.currency, comissao: f.commissionAmount, itens: f.itens.length },
    ip: args.ip ?? null,
  });
  return { ok: true, id: (data as { id: string }).id, numero: (data as { numero: string }).numero };
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type ItemFaturaRow = {
  id: string;
  sort: number;
  kind: string | null;
  product_id: string | null;
  description: string;
  base_amount: number;
  commission_basis: string | null;
  commission_type: string | null;
  commission_value: number | null;
  rule_source: string | null;
  commission_amount: number;
};

export async function itensDaFatura(supabase: SupabaseClient, tenantId: string, faturaId: string): Promise<ItemFaturaRow[]> {
  const { data } = await supabase
    .from("comissao_fatura_item")
    .select("id, sort, kind, product_id, description, base_amount, commission_basis, commission_type, commission_value, rule_source, commission_amount")
    .eq("tenant_id", tenantId)
    .eq("fatura_id", faturaId)
    .order("sort", { ascending: true });
  return ((data ?? []) as ItemFaturaRow[]).map((i) => ({ ...i, base_amount: Number(i.base_amount), commission_amount: Number(i.commission_amount), commission_value: i.commission_value != null ? Number(i.commission_value) : null }));
}

export async function obterFatura(supabase: SupabaseClient, tenantId: string, id: string): Promise<(FaturaRow & { supplierNome: string | null; supplierLegalName: string | null; supplierPais: string | null }) | null> {
  const { data } = await supabase
    .from("comissao_fatura")
    .select(`${SEL_FATURA}, supplier:supplier(display_name, legal_name, country_code)`)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as FaturaRow & { supplier: { display_name: string | null; legal_name: string | null; country_code: string | null } | { display_name: string | null; legal_name: string | null; country_code: string | null }[] | null };
  const s = Array.isArray(r.supplier) ? r.supplier[0] : r.supplier;
  const { supplier: _s, ...resto } = r;
  void _s;
  return { ...(resto as FaturaRow), supplierNome: s?.display_name ?? null, supplierLegalName: s?.legal_name ?? null, supplierPais: s?.country_code ?? null };
}

function paraLista(r: FaturaRow & { supplier?: unknown }, hoje: string): FaturaLista {
  const s = Array.isArray(r.supplier) ? (r.supplier as { display_name: string | null }[])[0] : (r.supplier as { display_name: string | null } | null);
  const ex = statusExibicao(r, hoje);
  return { ...(r as FaturaRow), supplierNome: s?.display_name ?? null, exibicao: ex.status, diasAtraso: ex.diasAtraso, saldo: saldoFatura(r) };
}

export async function listarFaturas(
  supabase: SupabaseClient,
  tenantId: string,
  filtros: { supplierId?: string | null } = {},
): Promise<FaturaLista[]> {
  let q = supabase
    .from("comissao_fatura")
    .select(`${SEL_FATURA}, supplier:supplier(display_name)`)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (filtros.supplierId) q = q.eq("supplier_id", filtros.supplierId);
  const { data } = await q;
  const hoje = hojeISO();
  return ((data ?? []) as unknown as (FaturaRow & { supplier?: unknown })[]).map((r) => paraLista(r, hoje));
}

export type RecebimentoRow = { id: string; amount: number; received_at: string; reference: string | null; notes: string | null; proof_filename: string | null; proof_storage_path: string | null; registered_by: string | null; created_at: string };

export async function listarRecebimentos(supabase: SupabaseClient, tenantId: string, faturaId: string): Promise<RecebimentoRow[]> {
  const { data } = await supabase
    .from("comissao_recebimento")
    .select("id, amount, received_at, reference, notes, proof_filename, proof_storage_path, registered_by, created_at")
    .eq("tenant_id", tenantId)
    .eq("fatura_id", faturaId)
    .order("received_at", { ascending: true });
  return (data ?? []) as RecebimentoRow[];
}

// Totais em aberto por moeda (admin): saldo das faturas emitidas/enviadas e quanto ja venceu.
export function totaisPorMoeda(faturas: FaturaLista[]): { moeda: string; emAberto: number; vencido: number }[] {
  const m = new Map<string, { emAberto: number; vencido: number }>();
  for (const f of faturas) {
    if (f.status !== "emitida" && f.status !== "enviada") continue;
    const t = m.get(f.currency) ?? { emAberto: 0, vencido: 0 };
    t.emAberto += f.saldo;
    if (f.exibicao === "vencida") t.vencido += f.saldo;
    m.set(f.currency, t);
  }
  return [...m.entries()].map(([moeda, t]) => ({ moeda, emAberto: Math.round(t.emAberto * 100) / 100, vencido: Math.round(t.vencido * 100) / 100 })).sort((a, b) => a.moeda.localeCompare(b.moeda));
}

// ── Emitir / enviar ──────────────────────────────────────────────────────────

type Destinatario = { email: string; nome: string };

// Contatos financeiros ativos da escola (papel finance ou supplier_admin).
export async function destinatariosDaEscola(supabase: SupabaseClient, supplierId: string): Promise<Destinatario[]> {
  const { data } = await supabase
    .from("supplier_user")
    .select("email, name, role")
    .eq("supplier_id", supplierId)
    .eq("active", true)
    .is("archived_at", null);
  const vistos = new Set<string>();
  const out: Destinatario[] = [];
  for (const u of (data ?? []) as { email: string | null; name: string | null; role: string }[]) {
    if (!u.email || (u.role !== "finance" && u.role !== "supplier_admin")) continue;
    const e = u.email.toLowerCase();
    if (vistos.has(e)) continue;
    vistos.add(e);
    out.push({ email: e, nome: u.name || "" });
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
}

function fmtMoedaEn(v: number, moeda: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: moeda }).format(v);
  } catch {
    return `${moeda} ${v.toFixed(2)}`;
  }
}
function fmtDataEn(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const meses = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${meses[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** Gera o PDF da fatura (para download ou anexo). Exige os dados do emissor. */
export async function gerarPdfDaFatura(supabase: SupabaseClient, tenantId: string, id: string): Promise<{ ok: true; pdf: Buffer; numero: string } | { ok: false; erro: string }> {
  const f = await obterFatura(supabase, tenantId, id);
  if (!f) return { ok: false, erro: "Fatura não encontrada." };
  const emissor = await obterEmissor(supabase, tenantId);
  if (!emissor) return { ok: false, erro: "Cadastre os dados do emissor (razão social, e-mail e dados bancários) antes de gerar a fatura." };
  const itens = await itensDaFatura(supabase, tenantId, id);
  const { gerarFaturaComissaoPdf } = await import("@/lib/comissao-fatura-pdf");
  const pdf = await gerarFaturaComissaoPdf({
    itens: itens.map((i) => ({
      kind: i.kind,
      description: i.description,
      baseAmount: i.base_amount,
      commissionType: i.commission_type,
      commissionValue: i.commission_value,
      commissionBasis: i.commission_basis,
      commissionAmount: i.commission_amount,
    })),
    tenantSlug: process.env.CATALOGO_TENANT_SLUG ?? "forio",
    numero: f.numero,
    issueDate: f.issue_date,
    dueDate: f.due_date,
    currency: f.currency,
    emissor,
    escola: { nome: f.supplierNome ?? "School", legalName: f.supplierLegalName, pais: f.supplierPais },
    studentName: f.student_name,
    programName: f.program_name,
    startDate: f.start_date,
    endDate: f.end_date,
    weeks: f.weeks != null ? Number(f.weeks) : null,
    paidToSchoolAmount: Number(f.paid_to_school_amount),
    paidToSchoolAt: f.paid_to_school_at,
    commissionBasis: f.commission_basis,
    commissionType: f.commission_type,
    commissionValue: f.commission_value != null ? Number(f.commission_value) : null,
    commissionAmount: Number(f.commission_amount),
    receivedAmount: Number(f.received_amount),
    notes: f.notes,
  });
  return { ok: true, pdf, numero: f.numero };
}

async function enviarPorEmail(
  supabase: SupabaseClient,
  tenantId: string,
  f: FaturaRow & { supplierNome: string | null },
  emissor: EmissorFatura,
  destinatarios: Destinatario[],
): Promise<{ enviados: string[]; falhas: string[] }> {
  const gerado = await gerarPdfDaFatura(supabase, tenantId, f.id);
  if (!gerado.ok) return { enviados: [], falhas: destinatarios.map((d) => d.email) };
  const { enviarFaturaComissaoEmail } = await import("@/lib/email");
  const enviados: string[] = [];
  const falhas: string[] = [];
  for (const d of destinatarios) {
    try {
      await enviarFaturaComissaoEmail(d.email, d.nome, {
        numero: f.numero,
        escolaNome: f.supplierNome ?? "your school",
        valorFormatado: fmtMoedaEn(saldoFatura(f), f.currency),
        vencimentoFormatado: fmtDataEn(f.due_date),
        alunoNome: f.student_name,
        programa: f.program_name,
        emissorNome: emissor.legalName,
        emissorEmail: emissor.email,
        portalUrl: appBase() ? `${appBase()}/fornecedor/faturas` : null,
        pdf: gerado.pdf,
        tenantSlug: process.env.CATALOGO_TENANT_SLUG ?? "forio",
      });
      enviados.push(d.email);
    } catch {
      falhas.push(d.email); // o motivo ja fica em email_logs
    }
  }
  return { enviados, falhas };
}

/**
 * Emite a fatura (rascunho -> emitida) e, se pedido, envia por e-mail (-> enviada).
 * Reenvio: fatura ja emitida/enviada com `enviar` reenvia sem mudar emissao/vencimento.
 */
export async function emitirFatura(
  supabase: SupabaseClient,
  args: { tenantId: string; adminUser: string; ip?: string | null; id: string; enviar: boolean; destinatariosExtras?: string[] },
): Promise<Resultado<{ status: StatusFatura; enviados: string[]; falhas: string[]; semDestinatario: boolean }>> {
  const f = await obterFatura(supabase, args.tenantId, args.id);
  if (!f) return { ok: false, erro: "Fatura não encontrada." };
  if (f.status === "cancelada" || f.status === "paga") return { ok: false, erro: "Esta fatura não pode ser emitida." };
  const emissor = await obterEmissor(supabase, args.tenantId);
  if (!emissor) return { ok: false, erro: "Cadastre os dados do emissor (razão social, e-mail e dados bancários) antes de emitir." };

  let atual = f;
  if (f.status === "rascunho") {
    const emissao = hojeISO();
    const venc = vencimentoPadrao(emissao, emissor.paymentTermsDays);
    const { data, error } = await supabase
      .from("comissao_fatura")
      .update({ status: "emitida", issue_date: emissao, due_date: venc, updated_at: new Date().toISOString() })
      .eq("id", f.id)
      .eq("tenant_id", args.tenantId)
      .eq("status", "rascunho")
      .select("id");
    if (error || !data || data.length === 0) return { ok: false, erro: "Não foi possível emitir a fatura (o estado mudou). Atualize a página." };
    atual = { ...f, status: "emitida", issue_date: emissao, due_date: venc };
    await registrarAuditoriaAdmin(supabase, { usuario: args.adminUser, acao: "financeiro.fatura_comissao.emitir", alvo: f.id, detalhe: { numero: f.numero, issue_date: emissao, due_date: venc }, ip: args.ip ?? null });
  }

  if (!args.enviar) return { ok: true, status: atual.status, enviados: [], falhas: [], semDestinatario: false };

  const base = await destinatariosDaEscola(supabase, f.supplier_id);
  const extras = (args.destinatariosExtras ?? []).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));
  const vistos = new Set(base.map((d) => d.email));
  const todos = [...base, ...extras.filter((e) => !vistos.has(e)).map((email) => ({ email, nome: "" }))];
  if (todos.length === 0) return { ok: true, status: atual.status, enviados: [], falhas: [], semDestinatario: true };

  const r = await enviarPorEmail(supabase, args.tenantId, atual, emissor, todos);
  let status: StatusFatura = atual.status;
  if (r.enviados.length > 0) {
    await supabase
      .from("comissao_fatura")
      .update({ status: atual.status === "emitida" ? "enviada" : atual.status, sent_at: new Date().toISOString(), sent_to: r.enviados, updated_at: new Date().toISOString() })
      .eq("id", f.id)
      .eq("tenant_id", args.tenantId)
      .in("status", ["emitida", "enviada"]);
    status = "enviada";
  }
  await registrarAuditoriaAdmin(supabase, { usuario: args.adminUser, acao: "financeiro.fatura_comissao.enviar", alvo: f.id, detalhe: { numero: f.numero, enviados: r.enviados.length, falhas: r.falhas.length }, ip: args.ip ?? null });
  return { ok: true, status, enviados: r.enviados, falhas: r.falhas, semDestinatario: false };
}

// ── Recebimento (unica mudanca de dinheiro) ──────────────────────────────────

const ERROS_RPC: Record<string, string> = {
  fatura_nao_encontrada: "Fatura não encontrada.",
  fatura_nao_recebivel: "Só é possível registrar recebimento de fatura emitida ou enviada.",
  valor_invalido: "Valor inválido.",
  valor_excede_saldo: "O valor excede o saldo em aberto da fatura.",
};

export async function registrarRecebimento(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    adminUser: string;
    ip?: string | null;
    faturaId: string;
    amount: unknown;
    receivedAt: unknown;
    reference?: string | null;
    notes?: string | null;
    proofStoragePath?: string | null;
    proofFilename?: string | null;
  },
): Promise<Resultado<{ recebimentoId: string; recebidoTotal: number; status: StatusFatura }>> {
  const valor = typeof args.amount === "number" ? args.amount : Number(String(args.amount ?? "").replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Informe o valor recebido." };
  const data = typeof args.receivedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.receivedAt) ? args.receivedAt : hojeISO();
  if (data > hojeISO()) return { ok: false, erro: "A data do recebimento não pode ser futura." };

  const { data: r, error } = await supabase.rpc("registrar_recebimento_comissao", {
    p_tenant: args.tenantId,
    p_fatura: args.faturaId,
    p_amount: Math.round(valor * 100) / 100,
    p_received_at: data,
    p_reference: args.reference ? String(args.reference).slice(0, 200) : null,
    p_notes: args.notes ? String(args.notes).slice(0, 1000) : null,
    p_proof_path: args.proofStoragePath ?? null,
    p_proof_name: args.proofFilename ?? null,
    p_user: args.adminUser,
  });
  if (error) {
    const chave = Object.keys(ERROS_RPC).find((k) => error.message.includes(k));
    if (chave) return { ok: false, erro: ERROS_RPC[chave] };
    console.error("[comissao] receber:", error.message);
    return { ok: false, erro: "Não foi possível registrar o recebimento." };
  }
  const linha = (Array.isArray(r) ? r[0] : r) as { recebimento_id: string; received_total: number | string; status: StatusFatura } | null;
  if (!linha) return { ok: false, erro: "Não foi possível registrar o recebimento." };
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.adminUser,
    acao: "financeiro.fatura_comissao.receber",
    alvo: args.faturaId,
    detalhe: { valor, data, status: linha.status, comprovante: !!args.proofStoragePath },
    ip: args.ip ?? null,
  });
  return { ok: true, recebimentoId: linha.recebimento_id, recebidoTotal: Number(linha.received_total), status: linha.status };
}

// ── Cancelar ─────────────────────────────────────────────────────────────────

export async function cancelarFatura(
  supabase: SupabaseClient,
  args: { tenantId: string; adminUser: string; ip?: string | null; id: string; motivo: unknown },
): Promise<Resultado> {
  const motivo = typeof args.motivo === "string" ? args.motivo.trim().slice(0, 500) : "";
  if (motivo.length < 3) return { ok: false, erro: "Informe o motivo do cancelamento." };
  const { data, error } = await supabase
    .from("comissao_fatura")
    .update({ status: "cancelada", cancelled_at: new Date().toISOString(), cancel_reason: motivo, updated_at: new Date().toISOString() })
    .eq("id", args.id)
    .eq("tenant_id", args.tenantId)
    .in("status", ["rascunho", "emitida", "enviada"])
    .eq("received_amount", 0)
    .select("id, numero");
  if (error) {
    console.error("[comissao] cancelar:", error.message);
    return { ok: false, erro: "Não foi possível cancelar a fatura." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Só é possível cancelar fatura sem recebimentos que ainda não esteja paga." };
  await registrarAuditoriaAdmin(supabase, { usuario: args.adminUser, acao: "financeiro.fatura_comissao.cancelar", alvo: args.id, detalhe: { motivo }, ip: args.ip ?? null });
  return { ok: true };
}

// ── Lado da escola (portal do fornecedor) ────────────────────────────────────
// A escola ve e baixa as faturas dela e INFORMA a previsao/observacao de
// pagamento. Nao marca como paga: dinheiro so muda pelo registro do financeiro.

// O que a ESCOLA enxerga: so os campos que a tela dela usa. Nada interno (quem criou,
// ids de tenant/caso, motivo de cancelamento, observacoes internas).
const SEL_FATURA_ESCOLA =
  "id, numero, status, currency, student_name, program_name, commission_amount, received_amount, issue_date, due_date, school_expected_at, school_note";

export type FaturaEscola = {
  id: string;
  numero: string;
  status: StatusFatura;
  currency: string;
  student_name: string | null;
  program_name: string | null;
  commission_amount: number;
  received_amount: number;
  issue_date: string | null;
  due_date: string | null;
  school_expected_at: string | null;
  school_note: string | null;
  exibicao: StatusExibicao;
  diasAtraso: number;
  saldo: number;
};

export async function listarFaturasDaEscola(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<FaturaEscola[]> {
  const { data } = await supabase
    .from("comissao_fatura")
    .select(SEL_FATURA_ESCOLA)
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .in("status", ["emitida", "enviada", "paga"])
    .order("created_at", { ascending: false })
    .limit(200);
  const hoje = hojeISO();
  return ((data ?? []) as unknown as Omit<FaturaEscola, "exibicao" | "diasAtraso" | "saldo">[]).map((r) => {
    const ex = statusExibicao(r, hoje);
    return { ...r, commission_amount: Number(r.commission_amount), received_amount: Number(r.received_amount), exibicao: ex.status, diasAtraso: ex.diasAtraso, saldo: saldoFatura(r) };
  });
}

// Posse: a fatura e da escola da sessao e esta visivel a ela (emitida/enviada/paga).
export async function faturaDaEscola(supabase: SupabaseClient, tenantId: string, supplierId: string, id: string): Promise<boolean> {
  const { data } = await supabase
    .from("comissao_fatura")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .in("status", ["emitida", "enviada", "paga"])
    .maybeSingle();
  return !!data;
}

export async function informarPagamentoDaEscola(
  supabase: SupabaseClient,
  args: { tenantId: string; supplierId: string; supplierUserEmail: string; id: string; expectedAt: unknown; note: unknown },
): Promise<Resultado> {
  const expected = typeof args.expectedAt === "string" && args.expectedAt.trim() ? args.expectedAt.trim() : null;
  if (expected && !/^\d{4}-\d{2}-\d{2}$/.test(expected)) return { ok: false, erro: "Data inválida." };
  const nota = typeof args.note === "string" ? args.note.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 1000) : "";
  if (!expected && !nota) return { ok: false, erro: "Informe a data prevista de pagamento ou uma observação." };
  const { data, error } = await supabase
    .from("comissao_fatura")
    .update({
      school_expected_at: expected,
      school_note: nota || null,
      school_note_at: new Date().toISOString(),
      school_note_by: args.supplierUserEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .eq("tenant_id", args.tenantId)
    .eq("supplier_id", args.supplierId)
    .in("status", ["emitida", "enviada"])
    .select("id");
  if (error) {
    console.error("[comissao] informar pagamento:", error.message);
    return { ok: false, erro: "Não foi possível salvar." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Fatura não encontrada ou já encerrada." };
  return { ok: true };
}

/** Gera o PDF para a escola (checando posse pelo supplier_id da sessao). */
export async function pdfDaFaturaParaEscola(supabase: SupabaseClient, tenantId: string, supplierId: string, id: string) {
  if (!(await faturaDaEscola(supabase, tenantId, supplierId, id))) return { ok: false as const, erro: "Fatura não encontrada." };
  return gerarPdfDaFatura(supabase, tenantId, id);
}

// ── Lembretes (cron) ─────────────────────────────────────────────────────────

/**
 * Envia os lembretes devidos HOJE (a vencer em 3 dias, vence hoje, 1/15/30 dias de atraso).
 * Idempotente: cada marco de cada fatura fica registrado em `events` (chave unica),
 * entao rodar o cron duas vezes no dia nao duplica e-mail.
 */
export async function enviarLembretesDoDia(
  supabase: SupabaseClient,
  tenantId: string,
  hoje: string = hojeISO(),
): Promise<{ avaliadas: number; lembretes: number; semDestinatario: number; falhas: number }> {
  const emissor = await obterEmissor(supabase, tenantId);
  const { data } = await supabase
    .from("comissao_fatura")
    .select(`${SEL_FATURA}, supplier:supplier(display_name)`)
    .eq("tenant_id", tenantId)
    .in("status", ["emitida", "enviada"]);
  const faturas = (data ?? []) as unknown as (FaturaRow & { supplier?: unknown })[];
  let lembretes = 0;
  let semDestinatario = 0;
  let falhas = 0;
  if (!emissor) return { avaliadas: faturas.length, lembretes, semDestinatario, falhas };
  const { enviarLembreteFaturaComissaoEmail } = await import("@/lib/email");

  for (const f of faturas) {
    const marco: TipoLembrete | null = lembreteDevido(f, hoje);
    if (!marco) continue;
    const chave = `comissao:lembrete:${f.id}:${marco}`;
    const { error: eEv } = await supabase.from("events").insert({ source: "comissao", event_type: "lembrete", external_id: f.id, idempotency_key: chave, payload: { marco, hoje }, status: "processado" });
    if (eEv) {
      // 23505 = marco ja enviado (idempotencia). Qualquer outro erro: loga e nao arrisca duplicar.
      if ((eEv as { code?: string }).code !== "23505") console.error("[comissao] lembrete: falha ao reivindicar marco:", eEv.message);
      continue;
    }
    // Reivindicou o marco: se nada sair (sem contato ativo ou todos os envios falharem),
    // libera a chave para a proxima execucao tentar de novo (o marco continua devido).
    const liberarMarco = async () => {
      await supabase.from("events").delete().eq("idempotency_key", chave);
    };
    const dests = await destinatariosDaEscola(supabase, f.supplier_id);
    if (dests.length === 0) {
      semDestinatario++;
      await liberarMarco();
      continue;
    }
    let enviouAlgum = false;
    const s = Array.isArray(f.supplier) ? (f.supplier as { display_name: string | null }[])[0] : (f.supplier as { display_name: string | null } | null);
    const atraso = f.due_date ? Math.max(0, diferencaDias(f.due_date, hoje) ?? 0) : 0;
    const situacao = marco === "a_vencer" ? "a_vencer" : marco === "vence_hoje" ? "vence_hoje" : "vencida";
    for (const d of dests) {
      try {
        await enviarLembreteFaturaComissaoEmail(d.email, d.nome, {
          numero: f.numero,
          escolaNome: s?.display_name ?? "your school",
          saldoFormatado: fmtMoedaEn(saldoFatura(f), f.currency),
          vencimentoFormatado: fmtDataEn(f.due_date),
          situacao,
          diasAtraso: atraso,
          emissorEmail: emissor.email,
          portalUrl: appBase() ? `${appBase()}/fornecedor/faturas` : null,
          tenantSlug: process.env.CATALOGO_TENANT_SLUG ?? "forio",
        });
        lembretes++;
        enviouAlgum = true;
      } catch {
        falhas++;
      }
    }
    if (!enviouAlgum) await liberarMarco();
  }
  return { avaliadas: faturas.length, lembretes, semDestinatario, falhas };
}

// ── Regras de comissao por escola / tipo / produto ───────────────────────────

const SEL_REGRA = "id, scope, kind, product_id, commission_basis, commission_type, commission_value, currency, valid_from, valid_until, notes, created_at";

export type RegraLinha = RegraArmazenada & { id: string; notes: string | null; created_at: string; productNome?: string | null };

export async function carregarRegrasDaEscola(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
): Promise<{ padrao: (RegraComissao & { id: string; valid_from: string; valid_until: string | null; notes: string | null }) | null; regras: RegraLinha[] }> {
  const [{ data: regras }, { data: acordos }] = await Promise.all([
    supabase.from("supplier_commission_rule").select(SEL_REGRA).eq("tenant_id", tenantId).eq("supplier_id", supplierId).is("archived_at", null).order("created_at", { ascending: true }),
    supabase
      .from("supplier_agreement")
      .select("id, commission_basis, commission_type, commission_value, currency, valid_from, valid_until, notes")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .is("archived_at", null)
      .order("valid_from", { ascending: false }),
  ]);
  const hoje = hojeISO();
  let padrao = null as null | (RegraComissao & { id: string; valid_from: string; valid_until: string | null; notes: string | null });
  for (const a of (acordos ?? []) as { id: string; commission_basis: string; commission_type: string; commission_value: number; currency: string | null; valid_from: string; valid_until: string | null; notes: string | null }[]) {
    if (a.valid_from > hoje) continue;
    if (a.valid_until && String(a.valid_until) < hoje) continue;
    padrao = { id: a.id, basis: a.commission_basis as RegraComissao["basis"], type: a.commission_type as RegraComissao["type"], value: Number(a.commission_value), currency: a.currency, valid_from: a.valid_from, valid_until: a.valid_until, notes: a.notes };
    break;
  }
  const linhas = ((regras ?? []) as RegraLinha[]).map((r) => ({ ...r, commission_value: Number(r.commission_value) }));
  const prodIds = [...new Set(linhas.map((r) => r.product_id).filter((x): x is string => !!x))];
  if (prodIds.length > 0) {
    const { data: ps } = await supabase.from("product").select("id, name").in("id", prodIds);
    const nome = new Map(((ps ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
    for (const l of linhas) if (l.product_id) l.productNome = nome.get(l.product_id) ?? null;
  }
  return { padrao, regras: linhas };
}

/** Para cada item sem regra informada, resolve produto > tipo > padrao e preenche. */
async function preencherRegrasDosItens(supabase: SupabaseClient, tenantId: string, entrada: EntradaNovaFatura): Promise<EntradaNovaFatura> {
  if (!Array.isArray(entrada.itens) || entrada.itens.length === 0) return entrada;
  const supplierId = typeof entrada.supplierId === "string" ? entrada.supplierId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(supplierId)) return entrada;
  const { padrao, regras } = await carregarRegrasDaEscola(supabase, tenantId, supplierId);
  const hoje = hojeISO();
  const itens = (entrada.itens as Record<string, unknown>[]).map((raw) => {
    const it = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const jaTem = (it.commissionAmount !== undefined && it.commissionAmount !== null && it.commissionAmount !== "") || (it.commissionType && it.commissionValue !== undefined && it.commissionValue !== "") || it.commissionBasis === "none";
    if (jaTem) return it;
    const r = resolverRegra({ kind: typeof it.kind === "string" ? it.kind : null, productId: typeof it.productId === "string" ? it.productId : null, hoje, regras, padrao: padrao ? { basis: padrao.basis, type: padrao.type, value: padrao.value, currency: padrao.currency } : null });
    if (!r) return it;
    return { ...it, commissionBasis: r.basis, commissionType: r.type, commissionValue: r.value, commissionCurrency: r.currency, ruleSource: r.origem };
  });
  return { ...entrada, itens };
}

/** Resolve a regra de cada {kind, productId} para a tela mostrar o percentual de cada linha. */
export async function resolverRegrasParaTela(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  itens: { kind: string | null; productId: string | null }[],
) {
  const { padrao, regras } = await carregarRegrasDaEscola(supabase, tenantId, supplierId);
  const hoje = hojeISO();
  const base = padrao ? { basis: padrao.basis, type: padrao.type, value: padrao.value, currency: padrao.currency } : null;
  return itens.map((i) => resolverRegra({ kind: i.kind, productId: i.productId, hoje, regras, padrao: base }));
}

export type ProdutoDaEscola = { id: string; name: string; kind: string };

/** Produtos ativos da escola (todos os campi), para escolher o item/regra por produto. */
export async function listarProdutosDaEscola(supabase: SupabaseClient, tenantId: string, supplierId: string): Promise<ProdutoDaEscola[]> {
  const { data: camps } = await supabase.from("campus").select("id").eq("supplier_id", supplierId).is("archived_at", null);
  const campusIds = ((camps ?? []) as { id: string }[]).map((c) => c.id);
  if (campusIds.length === 0) return [];
  const { data } = await supabase
    .from("product")
    .select("id, name, kind, tenant_id")
    .in("campus_id", campusIds)
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .eq("status", "active")
    .order("kind", { ascending: true })
    .order("name", { ascending: true })
    .limit(1000);
  return ((data ?? []) as { id: string; name: string; kind: string }[]).map((p) => ({ id: p.id, name: p.name, kind: p.kind }));
}

async function produtosDaEscolaPorIds(supabase: SupabaseClient, supplierId: string, ids: string[]): Promise<Set<string>> {
  const { data: camps } = await supabase.from("campus").select("id").eq("supplier_id", supplierId);
  const campusIds = ((camps ?? []) as { id: string }[]).map((c) => c.id);
  if (campusIds.length === 0) return new Set();
  const { data } = await supabase.from("product").select("id").in("id", ids).in("campus_id", campusIds);
  return new Set(((data ?? []) as { id: string }[]).map((p) => p.id));
}

export async function salvarRegra(
  supabase: SupabaseClient,
  args: { tenantId: string; adminUser: string; ip?: string | null; supplierId: string; entrada: unknown },
): Promise<Resultado<{ id: string }>> {
  const v = validarRegra((args.entrada && typeof args.entrada === "object" ? args.entrada : {}) as Record<string, unknown>);
  if (!v.ok) return { ok: false, erro: v.erro };
  const r = v.valor;
  const { data: sup } = await supabase.from("supplier").select("id, tenant_id").eq("id", args.supplierId).maybeSingle();
  if (!sup || (sup as { tenant_id: string }).tenant_id !== args.tenantId) return { ok: false, erro: "Escola não encontrada." };
  if (r.productId) {
    const dono = await produtosDaEscolaPorIds(supabase, args.supplierId, [r.productId]);
    if (!dono.has(r.productId)) return { ok: false, erro: "O produto não pertence a esta escola." };
  }
  // Uma regra ativa por tipo/produto: arquiva a anterior (fica no historico) e grava a nova.
  // Se a gravacao falhar, a anterior e restaurada para a escola nao ficar sem regra.
  const agora = new Date().toISOString();
  let q = supabase.from("supplier_commission_rule").update({ archived_at: agora }).eq("tenant_id", args.tenantId).eq("supplier_id", args.supplierId).eq("scope", r.scope).is("archived_at", null);
  q = r.scope === "kind" ? q.eq("kind", r.kind as string) : q.eq("product_id", r.productId as string);
  const { data: arquivadas, error: eArq } = await q.select("id");
  if (eArq) {
    console.error("[comissao] arquivar regra anterior:", eArq.message);
    return { ok: false, erro: "Não foi possível salvar a regra." };
  }
  const idsArquivados = ((arquivadas ?? []) as { id: string }[]).map((x) => x.id);
  const { data, error } = await supabase
    .from("supplier_commission_rule")
    .insert({
      tenant_id: args.tenantId,
      supplier_id: args.supplierId,
      scope: r.scope,
      kind: r.kind,
      product_id: r.productId,
      commission_basis: r.basis,
      commission_type: r.type,
      commission_value: r.value,
      currency: r.currency,
      valid_from: r.validFrom ?? hojeISO(),
      valid_until: r.validUntil,
      notes: r.notes,
      created_by: args.adminUser,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[comissao] salvar regra:", error?.message);
    if (idsArquivados.length > 0) {
      const { error: eRest } = await supabase.from("supplier_commission_rule").update({ archived_at: null }).in("id", idsArquivados).eq("tenant_id", args.tenantId);
      if (eRest) console.error("[comissao] restaurar regra anterior:", eRest.message);
    }
    return { ok: false, erro: "Não foi possível salvar a regra." };
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.adminUser,
    acao: "financeiro.comissao_regra.definir",
    alvo: (data as { id: string }).id,
    detalhe: { supplierId: args.supplierId, scope: r.scope, kind: r.kind, productId: r.productId, basis: r.basis, type: r.type, value: r.value },
    ip: args.ip ?? null,
  });
  return { ok: true, id: (data as { id: string }).id };
}

export async function arquivarRegra(
  supabase: SupabaseClient,
  args: { tenantId: string; adminUser: string; ip?: string | null; supplierId: string; regraId: string },
): Promise<Resultado> {
  const { data, error } = await supabase
    .from("supplier_commission_rule")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", args.regraId)
    .eq("tenant_id", args.tenantId)
    .eq("supplier_id", args.supplierId)
    .is("archived_at", null)
    .select("id");
  if (error) {
    console.error("[comissao] arquivar regra:", error.message);
    return { ok: false, erro: "Não foi possível remover a regra." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Regra não encontrada." };
  await registrarAuditoriaAdmin(supabase, { usuario: args.adminUser, acao: "financeiro.comissao_regra.remover", alvo: args.regraId, detalhe: { supplierId: args.supplierId }, ip: args.ip ?? null });
  return { ok: true };
}

/** Define o acordo PADRAO da escola (arquiva o vigente e grava o novo com vigencia). */
export async function salvarAcordoPadrao(
  supabase: SupabaseClient,
  args: { tenantId: string; adminUser: string; ip?: string | null; supplierId: string; entrada: Record<string, unknown> },
): Promise<Resultado<{ id: string }>> {
  const v = validarRegra({ ...args.entrada, scope: "kind", kind: "program" });
  if (!v.ok) return { ok: false, erro: v.erro };
  const r = v.valor;
  const { data: sup } = await supabase.from("supplier").select("id, tenant_id").eq("id", args.supplierId).maybeSingle();
  if (!sup || (sup as { tenant_id: string }).tenant_id !== args.tenantId) return { ok: false, erro: "Escola não encontrada." };
  const { data: acordosArq, error: eArq } = await supabase
    .from("supplier_agreement")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("tenant_id", args.tenantId)
    .eq("supplier_id", args.supplierId)
    .is("archived_at", null)
    .select("id");
  const idsAcordos = ((acordosArq ?? []) as { id: string }[]).map((x) => x.id);
  if (eArq) {
    console.error("[comissao] arquivar acordo:", eArq.message);
    return { ok: false, erro: "Não foi possível salvar o acordo." };
  }
  const { data, error } = await supabase
    .from("supplier_agreement")
    .insert({
      tenant_id: args.tenantId,
      supplier_id: args.supplierId,
      valid_from: r.validFrom ?? hojeISO(),
      valid_until: r.validUntil,
      commission_basis: r.basis,
      commission_type: r.type,
      commission_value: r.value,
      currency: r.currency,
      notes: r.notes,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[comissao] salvar acordo:", error?.message);
    if (idsAcordos.length > 0) {
      const { error: eRest } = await supabase.from("supplier_agreement").update({ archived_at: null }).in("id", idsAcordos).eq("tenant_id", args.tenantId);
      if (eRest) console.error("[comissao] restaurar acordo anterior:", eRest.message);
    }
    return { ok: false, erro: "Não foi possível salvar o acordo." };
  }
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.adminUser,
    acao: "financeiro.acordo_comissao.definir",
    alvo: (data as { id: string }).id,
    detalhe: { supplierId: args.supplierId, basis: r.basis, type: r.type, value: r.value },
    ip: args.ip ?? null,
  });
  return { ok: true, id: (data as { id: string }).id };
}

export { calcularComissaoFatura };
