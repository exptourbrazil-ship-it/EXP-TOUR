// NB: as MUTACOES deste modulo sao server-only (usam a service role do
// Supabase). So devem ser importadas por rotas de API / server components —
// NUNCA por codigo client. Os VALIDADORES no topo sao PUROS (sem rede/DB) e
// podem ser importados/testados livremente.
//
// Edicao dos dados cadastrais do cliente pelo admin (Caso 360). Tres frentes:
//   1. contato do titular (nome/telefone/email)   — casos.gerir
//   2. dados do estudante, POR CONTRATO           — casos.gerir
//   3. CPF do titular (muda a identidade de login) — override + justificativa
// Segue o padrao de mutacao (doc 07 §4): valida -> carrega o "antes" -> aplica
// -> grava a trilha em admin_audit com antes/depois. Nada de update solto.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EntradaAuditoria } from "@/lib/admin-audit";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Carregamento tardio da trilha de auditoria. O import do alias @/ nao e
// resolvido pelo runner de teste do Node; deixando-o dinamico (so avaliado ao
// executar uma mutacao, nunca nos testes dos validadores puros), este modulo
// continua carregavel por `node --test` para cobrir os validadores sem mocks.
async function registrarAuditoria(supabase: SupabaseClient, entrada: EntradaAuditoria): Promise<void> {
  const { registrarAuditoriaAdmin } = await import("@/lib/admin-audit");
  await registrarAuditoriaAdmin(supabase, entrada);
}

// Erro de negocio (a rota mapeia para 400/409). O `codigo` distingue os casos:
// "duplicado" -> 409 (CPF ja usado por outro titular); qualquer outro -> 400.
export class CadastroInvalido extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "CadastroInvalido";
    this.codigo = codigo;
  }
}

// ---- Validadores PUROS (testaveis, sem rede/DB) -----------------------------

// Mantem so os digitos (remove pontuacao de CPF/telefone).
// NB: mesmo algoritmo em @/lib/cpf (client-safe, usado no checkout do orcamento).
export function normalizarCpf(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

// Valida um CPF: 11 digitos, nao pode ser uma sequencia igual (000..., 111...)
// e os dois digitos verificadores tem que bater. Aceita CPF ja normalizado ou
// com mascara.
export function validarCpf(cpf: unknown): boolean {
  const d = normalizarCpf(cpf);
  if (d.length !== 11) return false;
  // Rejeita sequencias iguais (00000000000, 11111111111, ...): passam nos
  // digitos verificadores, mas nunca sao CPFs reais.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const calcDigito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const dig1 = calcDigito(d.slice(0, 9), 10);
  if (dig1 !== Number(d[9])) return false;
  const dig2 = calcDigito(d.slice(0, 10), 11);
  if (dig2 !== Number(d[10])) return false;
  return true;
}

// Valida um e-mail de forma pragmatica (algo@algo.tld, sem espacos).
export function validarEmail(e: unknown): boolean {
  const s = String(e ?? "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Mantem so os digitos do telefone (guardamos normalizado).
export function normalizarTelefone(t: unknown): string {
  return String(t ?? "").replace(/\D/g, "");
}

// Valida uma data de nascimento no formato AAAA-MM-DD: precisa ser uma data
// real (mes/dia validos), nao pode ser futura e o ano tem que ser >= 1900.
export function validarDataNascimento(s: unknown, hojeISO?: string): boolean {
  const v = String(s ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [ano, mes, dia] = v.split("-").map(Number);
  if (ano < 1900) return false;
  if (mes < 1 || mes > 12) return false;
  if (dia < 1 || dia > 31) return false;
  // Data real: reconstroi e confere que nao houve "overflow" (ex.: 31/02).
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return false;
  }
  // Nao pode ser futura (comparacao lexical de AAAA-MM-DD funciona).
  const hoje = (hojeISO ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (v > hoje) return false;
  return true;
}

// ---- Mutacoes (impuras: service role + auditoria) ---------------------------

// Edita o contato do titular: nome_completo (obrigatorio), telefone e email
// (validados se presentes). Guarda o telefone normalizado (so digitos).
export async function atualizarContatoTitular(args: {
  titularId: string;
  nome_completo: string;
  telefone?: string | null;
  email?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<{ titularId: string }> {
  const nome = String(args.nome_completo ?? "").trim();
  if (!nome) {
    throw new CadastroInvalido("invalido", "O nome completo e obrigatorio");
  }

  const patch: Record<string, unknown> = { nome_completo: nome };

  // email: se veio vazio, limpa; se veio preenchido, valida.
  const emailBruto = args.email == null ? null : String(args.email).trim();
  if (emailBruto) {
    if (!validarEmail(emailBruto)) {
      throw new CadastroInvalido("invalido", "E-mail invalido");
    }
    patch.email = emailBruto;
  } else if (args.email !== undefined) {
    patch.email = null;
  }

  // telefone: normaliza e valida um minimo de digitos se veio preenchido.
  if (args.telefone !== undefined) {
    const telNorm = normalizarTelefone(args.telefone);
    if (telNorm && telNorm.length < 10) {
      throw new CadastroInvalido("invalido", "Telefone invalido");
    }
    patch.telefone = telNorm || null;
  }

  const supabase = getSupabase();

  const { data: antes } = await supabase
    .from("titulares")
    .select("id, nome_completo, telefone, email")
    .eq("id", args.titularId)
    .maybeSingle();
  if (!antes) {
    throw new CadastroInvalido("nao_encontrado", "Titular nao encontrado");
  }

  const { error } = await supabase.from("titulares").update(patch).eq("id", args.titularId);
  if (error) {
    throw new Error("Falha ao atualizar o contato do titular");
  }

  await registrarAuditoria(supabase, {
    usuario: args.autor,
    acao: "titular.contato.editar",
    alvo: args.titularId,
    detalhe: {
      antes: { nome_completo: antes.nome_completo, telefone: antes.telefone, email: antes.email },
      depois: {
        nome_completo: patch.nome_completo ?? antes.nome_completo,
        telefone: "telefone" in patch ? patch.telefone : antes.telefone,
        email: "email" in patch ? patch.email : antes.email,
      },
    },
    ip: args.ip ?? null,
  });

  return { titularId: args.titularId };
}

// Edita o CPF do titular. Acao SENSIVEL (muda a identidade de login): exige
// justificativa e capacidade override na rota. Valida o CPF e garante a
// unicidade (nao pode colidir com OUTRO titular) -> CadastroInvalido/duplicado.
export async function atualizarCpfTitular(args: {
  titularId: string;
  cpf: string;
  justificativa: string;
  autor: string;
  ip?: string | null;
}): Promise<{ titularId: string }> {
  const cpf = normalizarCpf(args.cpf);
  if (!validarCpf(cpf)) {
    throw new CadastroInvalido("invalido", "CPF invalido");
  }
  const justificativa = String(args.justificativa ?? "").trim();
  if (justificativa.length < 5) {
    throw new CadastroInvalido("invalido", "Justificativa obrigatoria (minimo 5 caracteres)");
  }

  const supabase = getSupabase();

  const { data: antes } = await supabase
    .from("titulares")
    .select("id, cpf")
    .eq("id", args.titularId)
    .maybeSingle();
  if (!antes) {
    throw new CadastroInvalido("nao_encontrado", "Titular nao encontrado");
  }

  // Unicidade: o CPF nao pode pertencer a OUTRO titular.
  const { data: colisao } = await supabase
    .from("titulares")
    .select("id")
    .eq("cpf", cpf)
    .neq("id", args.titularId)
    .maybeSingle();
  if (colisao) {
    throw new CadastroInvalido("duplicado", "CPF ja cadastrado para outro titular");
  }

  const { error } = await supabase.from("titulares").update({ cpf }).eq("id", args.titularId);
  if (error) {
    // Rede de seguranca: o UNIQUE do banco pode barrar uma corrida que passou
    // pela checagem acima.
    if ((error as { code?: string }).code === "23505") {
      throw new CadastroInvalido("duplicado", "CPF ja cadastrado para outro titular");
    }
    throw new Error("Falha ao atualizar o CPF do titular");
  }

  await registrarAuditoria(supabase, {
    usuario: args.autor,
    acao: "titular.cpf.editar",
    alvo: args.titularId,
    detalhe: {
      antes: { cpf: antes.cpf },
      depois: { cpf },
      justificativa,
    },
    ip: args.ip ?? null,
  });

  return { titularId: args.titularId };
}

// Sexos aceitos no schema (contratos.estudante_sexo check in ('F','M')).
const SEXOS_ESTUDANTE = new Set(["F", "M"]);

// Edita os dados do estudante de UM contrato. Verifica a posse (o contrato tem
// que ser do titular [id]). Campos ausentes (undefined) nao sao tocados; campos
// presentes e vazios sao limpos (null). Data e email validados se presentes.
export async function atualizarEstudanteContrato(args: {
  titularId: string;
  contratoId: string;
  estudante_nome?: string | null;
  estudante_sexo?: string | null;
  estudante_data_nascimento?: string | null;
  estudante_email?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<{ contratoId: string }> {
  if (!args.contratoId) {
    throw new CadastroInvalido("invalido", "Informe o contrato");
  }

  const supabase = getSupabase();

  const { data: antes } = await supabase
    .from("contratos")
    .select("id, titular_id, estudante_nome, estudante_sexo, estudante_data_nascimento, estudante_email")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!antes) {
    throw new CadastroInvalido("nao_encontrado", "Contrato nao encontrado");
  }
  // Posse: o contrato precisa pertencer a este titular.
  if (antes.titular_id !== args.titularId) {
    throw new CadastroInvalido("posse", "O contrato nao pertence a este titular");
  }

  const patch: Record<string, unknown> = {};

  if (args.estudante_nome !== undefined) {
    const nome = String(args.estudante_nome ?? "").trim();
    patch.estudante_nome = nome || null;
  }

  if (args.estudante_sexo !== undefined) {
    const sexo = String(args.estudante_sexo ?? "").trim().toUpperCase();
    if (sexo && !SEXOS_ESTUDANTE.has(sexo)) {
      throw new CadastroInvalido("invalido", "Sexo invalido (use F ou M)");
    }
    patch.estudante_sexo = sexo || null;
  }

  if (args.estudante_data_nascimento !== undefined) {
    const data = String(args.estudante_data_nascimento ?? "").trim();
    if (data) {
      if (!validarDataNascimento(data)) {
        throw new CadastroInvalido("invalido", "Data de nascimento invalida");
      }
      patch.estudante_data_nascimento = data;
    } else {
      patch.estudante_data_nascimento = null;
    }
  }

  if (args.estudante_email !== undefined) {
    const email = String(args.estudante_email ?? "").trim();
    if (email) {
      if (!validarEmail(email)) {
        throw new CadastroInvalido("invalido", "E-mail do estudante invalido");
      }
      patch.estudante_email = email;
    } else {
      patch.estudante_email = null;
    }
  }

  if (Object.keys(patch).length === 0) {
    throw new CadastroInvalido("invalido", "Nenhum campo do estudante para atualizar");
  }

  const { error } = await supabase.from("contratos").update(patch).eq("id", args.contratoId);
  if (error) {
    throw new Error("Falha ao atualizar os dados do estudante");
  }

  await registrarAuditoria(supabase, {
    usuario: args.autor,
    acao: "contrato.estudante.editar",
    alvo: args.contratoId,
    detalhe: {
      titular_id: args.titularId,
      antes: {
        estudante_nome: antes.estudante_nome,
        estudante_sexo: antes.estudante_sexo,
        estudante_data_nascimento: antes.estudante_data_nascimento,
        estudante_email: antes.estudante_email,
      },
      depois: {
        estudante_nome: "estudante_nome" in patch ? patch.estudante_nome : antes.estudante_nome,
        estudante_sexo: "estudante_sexo" in patch ? patch.estudante_sexo : antes.estudante_sexo,
        estudante_data_nascimento:
          "estudante_data_nascimento" in patch
            ? patch.estudante_data_nascimento
            : antes.estudante_data_nascimento,
        estudante_email: "estudante_email" in patch ? patch.estudante_email : antes.estudante_email,
      },
    },
    ip: args.ip ?? null,
  });

  return { contratoId: args.contratoId };
}

// ---- Validador PURO do novo titular (cadastro manual pelo admin) ------------

// Data AAAA-MM-DD que EXISTE de verdade (rejeita 2030-13-45), sem restringir
// passado/futuro — o inicio do programa pode ser futuro. Diferente de
// validarDataNascimento, que recusa datas futuras.
function ehDataReal(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [ano, mes, dia] = s.split("-").map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

// Valida os dados minimos para CRIAR um titular. Puro (testavel). Nome e CPF
// sao obrigatorios; email/telefone sao validados so quando presentes. O
// data_inicio (inicio do programa) PODE ser futuro — nao usa o validador de
// nascimento; so exige o formato AAAA-MM-DD quando informado.
export function validarDadosNovoTitular(args: {
  nome_completo?: unknown;
  cpf?: unknown;
  email?: unknown;
  telefone?: unknown;
  data_inicio?: unknown;
}): { ok: true } | { ok: false; motivo: string } {
  const nome = String(args.nome_completo ?? "").trim();
  if (!nome) return { ok: false, motivo: "nome_obrigatorio" };
  if (!validarCpf(args.cpf)) return { ok: false, motivo: "cpf_invalido" };
  const email = args.email == null ? "" : String(args.email).trim();
  if (email && !validarEmail(email)) return { ok: false, motivo: "email_invalido" };
  const tel = normalizarTelefone(args.telefone);
  if (tel && tel.length < 10) return { ok: false, motivo: "telefone_invalido" };
  const di = args.data_inicio == null ? "" : String(args.data_inicio).trim();
  if (di && !ehDataReal(di)) return { ok: false, motivo: "data_invalida" };
  return { ok: true };
}

// ---- Mutacoes de CADASTRO de titular (criar / arquivar / desarquivar) --------

// Cria um titular manualmente pelo admin (cliente sem contrato — o contrato vem
// depois). CPF ja existente NAO e sobrescrito: retorna `duplicado` (protege a
// conta de um cliente ja cadastrado). O tenant vem do deploy atual. Auditado.
export async function criarTitular(args: {
  nome_completo: string;
  cpf: string;
  email?: string | null;
  telefone?: string | null;
  data_inicio?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<{ titularId: string }> {
  const v = validarDadosNovoTitular(args);
  if (!v.ok) {
    const msg: Record<string, string> = {
      nome_obrigatorio: "O nome completo e obrigatorio",
      cpf_invalido: "CPF invalido",
      email_invalido: "E-mail invalido",
      telefone_invalido: "Telefone invalido",
      data_invalida: "Data de inicio invalida (use AAAA-MM-DD)",
    };
    throw new CadastroInvalido("invalido", msg[v.motivo] ?? "Dados invalidos");
  }

  const nome = String(args.nome_completo).trim();
  const cpf = normalizarCpf(args.cpf);
  const email = args.email == null ? null : String(args.email).trim() || null;
  const telefone = normalizarTelefone(args.telefone) || null;
  const dataInicio = args.data_inicio == null ? null : String(args.data_inicio).trim() || null;

  const supabase = getSupabase();

  // CPF ja cadastrado -> nao sobrescreve (protege a conta existente).
  const { data: existente } = await supabase
    .from("titulares")
    .select("id")
    .eq("cpf", cpf)
    .maybeSingle();
  if (existente) {
    throw new CadastroInvalido("duplicado", "Ja existe um cliente com este CPF");
  }

  // Tenant do deploy atual (import tardio: mantem os validadores puros
  // carregaveis pelo runner de teste sem resolver o alias @/). FALHA FECHADA: se
  // o tenant nao resolver, o erro PROPAGA (rota -> 500) em vez de gravar o
  // titular com tenant errado. `tenantIdAtual` sempre devolve um id ou lanca.
  const { tenantIdAtual } = await import("@/lib/catalog-service");
  const tenantId = await tenantIdAtual(supabase);

  const { data: inserido, error } = await supabase
    .from("titulares")
    .insert({ nome_completo: nome, cpf, email, telefone, data_inicio: dataInicio, tenant_id: tenantId })
    .select("id")
    .single();
  if (error || !inserido) {
    if ((error as { code?: string } | null)?.code === "23505") {
      throw new CadastroInvalido("duplicado", "Ja existe um cliente com este CPF");
    }
    throw new Error("Falha ao criar o titular");
  }

  await registrarAuditoria(supabase, {
    usuario: args.autor,
    acao: "titular.criar",
    alvo: inserido.id as string,
    detalhe: { nome_completo: nome, cpf, email, telefone, data_inicio: dataInicio, tenant_id: tenantId },
    ip: args.ip ?? null,
  });

  return { titularId: inserido.id as string };
}

// Arquiva um titular (soft-delete REVERSIVEL): some das listas operacionais, mas
// preserva TODO o historico. Idempotente (arquivar de novo nao muda nada).
export async function arquivarTitular(args: {
  titularId: string;
  motivo?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<{ titularId: string; jaEstava: boolean }> {
  const supabase = getSupabase();
  const { data: antes } = await supabase
    .from("titulares")
    .select("id, arquivado_em")
    .eq("id", args.titularId)
    .maybeSingle();
  if (!antes) throw new CadastroInvalido("nao_encontrado", "Titular nao encontrado");
  if (antes.arquivado_em) return { titularId: args.titularId, jaEstava: true };

  const motivo = args.motivo ? String(args.motivo).trim().slice(0, 500) : null;
  const { error } = await supabase
    .from("titulares")
    .update({ arquivado_em: new Date().toISOString(), arquivado_por: args.autor, arquivado_motivo: motivo })
    .eq("id", args.titularId)
    .is("arquivado_em", null);
  if (error) throw new Error("Falha ao arquivar o titular");

  await registrarAuditoria(supabase, {
    usuario: args.autor,
    acao: "titular.arquivar",
    alvo: args.titularId,
    detalhe: { motivo },
    ip: args.ip ?? null,
  });
  return { titularId: args.titularId, jaEstava: false };
}

// Desarquiva um titular (reverte o arquivamento).
export async function desarquivarTitular(args: {
  titularId: string;
  autor: string;
  ip?: string | null;
}): Promise<{ titularId: string }> {
  const supabase = getSupabase();
  const { data: antes } = await supabase
    .from("titulares")
    .select("id, arquivado_em")
    .eq("id", args.titularId)
    .maybeSingle();
  if (!antes) throw new CadastroInvalido("nao_encontrado", "Titular nao encontrado");

  const { error } = await supabase
    .from("titulares")
    .update({ arquivado_em: null, arquivado_por: null, arquivado_motivo: null })
    .eq("id", args.titularId);
  if (error) throw new Error("Falha ao desarquivar o titular");

  await registrarAuditoria(supabase, {
    usuario: args.autor,
    acao: "titular.desarquivar",
    alvo: args.titularId,
    detalhe: null,
    ip: args.ip ?? null,
  });
  return { titularId: args.titularId };
}
