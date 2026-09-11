// NB: modulo server-only (service role). So deve ser importado por rotas de API.
//
// Servico da MATRICULA vinda do orcamento lead-facing (/orcamento). Mutacao
// nomeada unica: valida -> cria/acha o TITULAR pelo CPF (login da Area do
// Cliente) SEM sobrescrever um titular existente -> grava o LEAD (com o
// participante/aluno e o programa escolhido) -> evento em `events` -> auditoria.
// NAO cria contrato nem cobranca aqui (isso e o proximo passo: cotacao -> PIX).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizarCpf, validarCpf } from "@/lib/cpf";
import { tenantIdAtual } from "@/lib/catalog-service";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";

export class MatriculaInvalida extends Error {
  codigo: string;
  constructor(codigo: string, mensagem?: string) {
    super(mensagem || codigo);
    this.name = "MatriculaInvalida";
    this.codigo = codigo;
  }
}

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
}

const validarEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());
const normTel = (t: string) => (t || "").replace(/\D/g, "");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corta = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

export type EntradaMatricula = {
  // Titular (responsavel financeiro = futura conta da Area do Cliente).
  titularNome: string;
  cpf: string;
  email: string;
  telefone?: string | null;
  // Participante (aluno) quando != titular.
  participanteNome?: string | null;
  // Programa escolhido + contexto do orcamento.
  programaId: string;
  programaNome?: string | null;
  escola?: string | null;
  params?: Record<string, unknown> | null;
  // Aceite dos Termos & Condicoes (LGPD) — obrigatorio.
  aceite: boolean;
  ip?: string | null;
};

export type ResultadoMatricula = { ok: true; titularId: string | null; leadId: string };

// Grava o LEAD do funil (com PII do titular + participante). NAO cria conta
// login-capavel a partir desta superficie publica nao verificada — isso seria
// tomada de conta (CPF alheio + e-mail do atacante -> codigos de acesso vao para
// ele). Apenas VINCULA a um titular que JA exista (nao cria, nao sobrescreve). A
// conta e criada num passo VERIFICADO depois (consultor processa o lead /
// conversao da cotacao com token). O aceite dos T&C fica registrado no lead.
export async function registrarMatricula(args: EntradaMatricula): Promise<ResultadoMatricula> {
  const nome = corta(args.titularNome, 120);
  const cpf = normalizarCpf(args.cpf);
  const email = corta(args.email, 254);
  const telefone = normTel(args.telefone ?? "").slice(0, 20) || null;
  const participante = args.participanteNome ? corta(args.participanteNome, 120) : null;
  const programaNome = args.programaNome ? corta(args.programaNome, 200) : null;
  const escola = args.escola ? corta(args.escola, 200) : null;

  if (!nome) throw new MatriculaInvalida("nome_obrigatorio", "Informe o nome do titular.");
  if (!validarCpf(cpf)) throw new MatriculaInvalida("cpf_invalido", "CPF invalido.");
  if (!validarEmail(email)) throw new MatriculaInvalida("email_invalido", "E-mail invalido.");
  if (!UUID_RE.test(String(args.programaId || ""))) throw new MatriculaInvalida("programa_invalido", "Programa invalido.");
  if (args.aceite !== true) throw new MatriculaInvalida("aceite_obrigatorio", "E preciso aceitar os termos.");

  const supabase = getSupabase();
  const tenantId = await tenantIdAtual(supabase); // falha fechada se nao resolver

  // VINCULA a um titular existente (por CPF, unico global — mesma identidade de
  // login), sem CRIAR nem SOBRESCREVER. Se nao existe, o lead fica sem titular
  // ate o passo verificado que criara a conta.
  const { data: existente } = await supabase.from("titulares").select("id").eq("cpf", cpf).maybeSingle();
  const titularId = (existente?.id as string) ?? null;

  // params: limita tamanho do jsonb do cliente e injeta o consentimento server-side.
  let paramsCliente: Record<string, unknown> = {};
  try {
    const bruto = args.params && typeof args.params === "object" ? args.params : {};
    const json = JSON.stringify(bruto);
    if (json.length <= 8000) paramsCliente = bruto as Record<string, unknown>;
  } catch { /* ignora params malformado */ }
  const params = { ...paramsCliente, aceite_termos: { aceito: true, em: new Date().toISOString(), ip: args.ip ?? null } };

  const { data: lead, error: erroLead } = await supabase
    .from("lead")
    .insert({
      tenant_id: tenantId,
      titular_id: titularId,
      nome,
      cpf,
      email,
      telefone,
      participante_nome: participante,
      programa_id: args.programaId,
      programa_nome: programaNome,
      escola,
      origem: "orcamento",
      status: "novo",
      params,
      ip: args.ip ?? null,
    })
    .select("id")
    .single();
  if (erroLead || !lead) throw new MatriculaInvalida("falha_lead", "Falha ao registrar o pedido.");
  const leadId = lead.id as string;

  // Evento (ledger) + auditoria — best-effort, nao derrubam o pedido ja gravado.
  try {
    await supabase.from("events").insert({
      source: "orcamento",
      event_type: "Matricula_Solicitada",
      idempotency_key: `matricula:${leadId}`,
      payload: { lead_id: leadId, titular_id: titularId, programa_id: args.programaId, programa_nome: args.programaNome ?? null, participante_nome: participante },
      status: "processado",
      processed_at: new Date().toISOString(),
    });
  } catch { /* best-effort */ }
  try {
    await registrarAuditoriaAdmin(supabase, {
      usuario: "lead",
      acao: "orcamento.matricula.solicitada",
      alvo: leadId,
      detalhe: { titular_id: titularId, titular_vinculado: !!titularId, programa_id: args.programaId, participante_nome: participante },
      ip: args.ip ?? null,
    });
  } catch { /* best-effort */ }

  return { ok: true, titularId, leadId };
}
