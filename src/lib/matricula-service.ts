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

export type EntradaMatricula = {
  // Titular (responsavel financeiro = conta da Area do Cliente).
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
  ip?: string | null;
};

export type ResultadoMatricula = { ok: true; titularId: string; leadId: string; titularNovo: boolean };

// Cria/acha o titular pelo CPF (nao sobrescreve um existente) e grava o lead.
export async function registrarMatricula(args: EntradaMatricula): Promise<ResultadoMatricula> {
  const nome = String(args.titularNome ?? "").trim();
  const cpf = normalizarCpf(args.cpf);
  const email = String(args.email ?? "").trim();
  const telefone = normTel(args.telefone ?? "") || null;
  const participante = args.participanteNome ? String(args.participanteNome).trim() : null;

  if (!nome) throw new MatriculaInvalida("nome_obrigatorio", "Informe o nome do titular.");
  if (!validarCpf(cpf)) throw new MatriculaInvalida("cpf_invalido", "CPF invalido.");
  if (!validarEmail(email)) throw new MatriculaInvalida("email_invalido", "E-mail invalido.");
  if (!args.programaId) throw new MatriculaInvalida("programa_obrigatorio", "Programa nao informado.");

  const supabase = getSupabase();
  const tenantId = await tenantIdAtual(supabase); // falha fechada se nao resolver

  // Titular por CPF: se ja existe (qualquer tenant), REUSA (nao sobrescreve os
  // dados de uma conta existente). Senao, cria no tenant do deploy.
  let titularNovo = false;
  let titularId: string;
  const { data: existente } = await supabase.from("titulares").select("id").eq("cpf", cpf).maybeSingle();
  if (existente) {
    titularId = existente.id as string;
  } else {
    const { data: inserido, error } = await supabase
      .from("titulares")
      .insert({ nome_completo: nome, cpf, email, telefone, tenant_id: tenantId })
      .select("id")
      .single();
    if (error || !inserido) {
      // Corrida: outro request criou o mesmo CPF entre o select e o insert.
      if ((error as { code?: string } | null)?.code === "23505") {
        const { data: agora } = await supabase.from("titulares").select("id").eq("cpf", cpf).maybeSingle();
        if (!agora) throw new MatriculaInvalida("falha_titular", "Falha ao criar o titular.");
        titularId = agora.id as string;
      } else {
        throw new MatriculaInvalida("falha_titular", "Falha ao criar o titular.");
      }
    } else {
      titularId = inserido.id as string;
      titularNovo = true;
    }
  }

  // Lead do funil comercial.
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
      programa_nome: args.programaNome ?? null,
      escola: args.escola ?? null,
      origem: "orcamento",
      status: "novo",
      params: args.params ?? null,
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
      detalhe: { titular_id: titularId, titular_novo: titularNovo, programa_id: args.programaId, participante_nome: participante },
      ip: args.ip ?? null,
    });
  } catch { /* best-effort */ }

  return { ok: true, titularId, leadId, titularNovo };
}
