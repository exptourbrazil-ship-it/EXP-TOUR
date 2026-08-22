// NB: modulo server-only (usa a service role do Supabase). So deve ser
// importado por rotas de API e server components — NUNCA por codigo client.
//
// Servico dos PROCESSOS DE EXCECAO (doc 01, Secao 4). Cada mutacao segue o
// padrao do doc 07, Secao 4: valida (a rota checa o papel) -> executa ->
// grava evento em `events` (barramento; futuros consumidores como o Zoho leem
// dali) -> grava trilha em `admin_audit`. A NOTIFICACAO ao cliente e por tipo
// (o tom de E1 e de E7 sao produtos diferentes) e fica para o item de cada
// tipo — nao disparamos um e-mail generico aqui.
//
// A maquina de estados e o vocabulario sao puros e testados em src/lib/excecao.ts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import {
  tipoExcecaoValido,
  suspendePadraoDoTipo,
  sanitizarSuspensoes,
  transicaoPermitida,
  desfechoValido,
  excecaoAtiva,
  type StatusExcecao,
  type DesfechoExcecao,
} from "@/lib/excecao";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Erro de negocio do servico (mapeado para HTTP 4xx pela rota). Distingue-se de
// falhas inesperadas (que viram 500).
export class ExcecaoBloqueada extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ExcecaoBloqueada";
    this.codigo = codigo;
  }
}

export type ExcecaoRegistro = {
  id: string;
  contrato_id: string;
  titular_id: string;
  tipo: string;
  status: StatusExcecao;
  suspende: string[];
  etapa: string | null;
  motivo: string | null;
  desfecho: string | null;
  resolucao: string | null;
  aberta_por: string | null;
  resolvida_por: string | null;
  aberta_em: string | null;
  resolvida_em: string | null;
  atualizada_em: string | null;
};

// Grava o evento de dominio no barramento. Chave naturalmente unica (id da
// excecao + acao + instante), pois cada mutacao e um evento distinto. Best-
// effort: uma falha de ledger nao desfaz a mutacao ja aplicada.
async function registrarEventoExcecao(
  supabase: SupabaseClient,
  acao: string,
  excecaoId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    await supabase.from("events").insert({
      source: "admin",
      event_type: "excecao." + acao,
      idempotency_key: `admin:excecao:${excecaoId}:${acao}:${agora}`,
      external_id: excecaoId,
      payload,
      status: "processado",
      processed_at: agora,
    });
  } catch (err) {
    console.error("Falha ao registrar evento de excecao no barramento", err);
  }
}

type ContextoAutor = { autor: string; ip?: string | null };

// Abre um processo de excecao num contrato. Impede duplicata do MESMO tipo
// ainda ativa (um processo por tipo por contrato); tipos diferentes podem
// coexistir (ex.: hold de fraude + deferral).
export async function abrirExcecao(args: {
  contratoId: string;
  tipo: string;
  motivo?: string | null;
  suspende?: unknown; // opcional; default = suspensoes padrao do tipo
  etapa?: string | null;
  // Posse esperada: quando informado, o contrato TEM de ser deste titular. A
  // validacao vive na funcao de mutacao (doc 07 §4), nao so na rota, para
  // reforcar a posse mesmo se outro chamador (cron/webhook) reusar o servico.
  titularIdEsperado?: string;
  autor: string;
  ip?: string | null;
}): Promise<ExcecaoRegistro> {
  if (!tipoExcecaoValido(args.tipo)) {
    throw new ExcecaoBloqueada("tipo_invalido", "Tipo de excecao invalido");
  }
  const supabase = getSupabase();

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!contrato) {
    throw new ExcecaoBloqueada("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (args.titularIdEsperado && contrato.titular_id !== args.titularIdEsperado) {
    throw new ExcecaoBloqueada(
      "contrato_de_outro_titular",
      "O contrato nao pertence a este titular"
    );
  }

  // Ja existe uma excecao desse tipo ativa neste contrato?
  const { data: existentes } = await supabase
    .from("case_exceptions")
    .select("id, status")
    .eq("contrato_id", args.contratoId)
    .eq("tipo", args.tipo)
    .in("status", ["aberta", "em_andamento"]);
  if ((existentes || []).length > 0) {
    throw new ExcecaoBloqueada(
      "excecao_ja_aberta",
      "Ja existe uma excecao desse tipo em aberto neste contrato"
    );
  }

  // Suspensoes: usa as informadas (sanitizadas) ou o padrao do tipo.
  const suspende =
    args.suspende === undefined
      ? suspendePadraoDoTipo(args.tipo)
      : sanitizarSuspensoes(args.suspende);
  const motivo = typeof args.motivo === "string" ? args.motivo.trim().slice(0, 2000) || null : null;
  const etapa = typeof args.etapa === "string" ? args.etapa.trim().slice(0, 200) || null : null;

  const { data: inserida, error } = await supabase
    .from("case_exceptions")
    .insert({
      contrato_id: contrato.id,
      titular_id: contrato.titular_id,
      tipo: args.tipo,
      status: "aberta",
      suspende,
      etapa,
      motivo,
      aberta_por: args.autor,
    })
    .select("*")
    .single();
  if (error || !inserida) {
    // 23505 = violacao do indice unico parcial (uma excecao ativa por tipo por
    // contrato). Fecha a janela de corrida do pre-check acima com erro amigavel.
    if (error?.code === "23505") {
      throw new ExcecaoBloqueada(
        "excecao_ja_aberta",
        "Ja existe uma excecao desse tipo em aberto neste contrato"
      );
    }
    throw new Error("Falha ao abrir a excecao");
  }

  await registrarEventoExcecao(supabase, "abrir", inserida.id, {
    contrato_id: contrato.id,
    titular_id: contrato.titular_id,
    tipo: args.tipo,
    suspende,
    aberta_por: args.autor,
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "excecao.abrir",
    alvo: inserida.id,
    detalhe: { contrato_id: contrato.id, titular_id: contrato.titular_id, tipo: args.tipo, suspende },
    ip: args.ip ?? null,
  });

  return inserida as ExcecaoRegistro;
}

// Muda o status de uma excecao pela maquina de estados (assumir, resolver,
// cancelar, reabrir). Ao resolver exige desfecho valido + resolucao. Permite,
// no mesmo passo, ajustar `etapa` e `suspende`.
export async function mudarStatusExcecao(args: {
  id: string;
  para: StatusExcecao;
  etapa?: string | null;
  suspende?: unknown;
  desfecho?: string | null;
  resolucao?: string | null;
  autor: string;
  ip?: string | null;
}): Promise<ExcecaoRegistro> {
  const supabase = getSupabase();

  const { data: atual } = await supabase
    .from("case_exceptions")
    .select("*")
    .eq("id", args.id)
    .maybeSingle();
  if (!atual) {
    throw new ExcecaoBloqueada("nao_encontrada", "Excecao nao encontrada");
  }

  const de = atual.status as StatusExcecao;
  if (!transicaoPermitida(de, args.para)) {
    throw new ExcecaoBloqueada(
      "transicao_invalida",
      `Transicao invalida: ${de} -> ${args.para}`
    );
  }

  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { status: args.para, atualizada_em: agora };

  if (args.etapa !== undefined) {
    patch.etapa = typeof args.etapa === "string" ? args.etapa.trim().slice(0, 200) || null : null;
  }
  if (args.suspende !== undefined) {
    patch.suspende = sanitizarSuspensoes(args.suspende);
  }

  if (args.para === "resolvida") {
    if (!desfechoValido(args.desfecho)) {
      throw new ExcecaoBloqueada("desfecho_invalido", "Informe um desfecho valido para resolver");
    }
    const resolucao =
      typeof args.resolucao === "string" ? args.resolucao.trim().slice(0, 2000) : "";
    if (!resolucao) {
      throw new ExcecaoBloqueada("resolucao_obrigatoria", "Informe a resolucao");
    }
    patch.desfecho = args.desfecho as DesfechoExcecao;
    patch.resolucao = resolucao;
    patch.resolvida_por = args.autor;
    patch.resolvida_em = agora;
  }

  // Ao sair de um estado terminal (reabrir) ou entrar em nao-terminal, limpa os
  // campos de resolucao para nao deixar um desfecho "fantasma" numa excecao que
  // voltou a ficar ativa.
  if (excecaoAtiva(args.para) && (de === "resolvida" || de === "cancelada")) {
    patch.desfecho = null;
    patch.resolucao = null;
    patch.resolvida_por = null;
    patch.resolvida_em = null;
  }

  const { data: linhas, error } = await supabase
    .from("case_exceptions")
    .update(patch)
    .eq("id", args.id)
    .eq("status", de) // guarda otimista: so muda se o status nao mudou sob nossos pes
    .select("*");
  if (error) {
    throw new Error("Falha ao atualizar a excecao");
  }
  const atualizada = (linhas || [])[0];
  // 0 linhas = o status mudou sob nossos pes entre o load e o update (corrida).
  // Nao e erro do servidor: e conflito de estado — o chamador deve recarregar.
  if (!atualizada) {
    throw new ExcecaoBloqueada(
      "conflito_estado",
      "O estado da excecao mudou; recarregue a pagina e tente de novo"
    );
  }

  await registrarEventoExcecao(supabase, "status", args.id, {
    de,
    para: args.para,
    desfecho: patch.desfecho ?? null,
    por: args.autor,
  });
  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "excecao.status",
    alvo: args.id,
    detalhe: {
      contrato_id: atual.contrato_id,
      titular_id: atual.titular_id,
      tipo: atual.tipo,
      de,
      para: args.para,
      ...(patch.desfecho ? { desfecho: patch.desfecho } : {}),
    },
    ip: args.ip ?? null,
  });

  return atualizada as ExcecaoRegistro;
}
