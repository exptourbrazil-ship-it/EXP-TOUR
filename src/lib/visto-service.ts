// NB: modulo server-only (service role). So deve ser importado por rotas de API
// / server components — NUNCA por codigo client.
//
// Automacao do processo E1 — VISTO NEGADO (doc 01 §4). Funcao de mutacao unica
// (padrao doc 07 §4): registra o resultado do visto num contrato e, na
// TRANSICAO para "negado", dispara — automatico e imediato — a resposta:
//   1. abre a excecao E1 (que ja pausa a regua de cobranca/lembretes, pois seu
//      suspende padrao inclui cobranca e lembretes — ver src/lib/excecao.ts e o
//      cron regua-cobranca);
//   2. cria uma tarefa prioritaria ao consultor (contato em 24h);
//   3. notifica o cliente com empatia e os proximos passos.
// Tudo best-effort no que e efeito colateral: o status ja fica gravado e a
// excecao aberta mesmo se o e-mail/tarefa falharem.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { statusVistoValido, disparaExcecaoVistoNegado, type StatusVisto } from "@/lib/visto";
import { abrirExcecao, ExcecaoBloqueada } from "@/lib/excecao-service";
import { enviarAvisoVistoNegadoEmail } from "@/lib/email";

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Erro de negocio (→ 400 na rota).
export class VistoBloqueado extends Error {
  codigo: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "VistoBloqueado";
    this.codigo = codigo;
  }
}

const MS_24H = 24 * 60 * 60 * 1000;

export type ResultadoStatusVisto = {
  status: StatusVisto;
  excecaoDisparada: boolean; // houve transicao para negado
  excecaoAberta: boolean; // E1 aberta agora (false se ja havia uma ativa)
  tarefaCriada: boolean;
  avisoEnviado: boolean;
};

export async function registrarStatusVisto(args: {
  contratoId: string;
  titularIdEsperado?: string;
  status: string;
  autor: string;
  ip?: string | null;
}): Promise<ResultadoStatusVisto> {
  if (!statusVistoValido(args.status)) {
    throw new VistoBloqueado("status_invalido", "Status de visto invalido");
  }
  const supabase = getSupabase();

  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, titular_id, estudante_nome, visto_status, titular:titulares(nome_completo, email)")
    .eq("id", args.contratoId)
    .maybeSingle();
  if (!contrato) {
    throw new VistoBloqueado("contrato_nao_encontrado", "Contrato nao encontrado");
  }
  if (args.titularIdEsperado && contrato.titular_id !== args.titularIdEsperado) {
    throw new VistoBloqueado("contrato_de_outro_titular", "O contrato nao pertence a este titular");
  }

  const anterior = (contrato.visto_status as string | null) ?? null;
  const novo = args.status as StatusVisto;

  const { error } = await supabase
    .from("contratos")
    .update({ visto_status: novo })
    .eq("id", args.contratoId);
  if (error) {
    throw new Error("Falha ao registrar o status do visto");
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: args.autor,
    acao: "visto.status.definir",
    alvo: args.contratoId,
    detalhe: { titular_id: contrato.titular_id, de: anterior, para: novo },
    ip: args.ip ?? null,
  });

  const resultado: ResultadoStatusVisto = {
    status: novo,
    excecaoDisparada: false,
    excecaoAberta: false,
    tarefaCriada: false,
    avisoEnviado: false,
  };

  // A PAUSA da cobranca nao pode ficar presa a transicao. Se uma tentativa
  // anterior gravou "negado" mas falhou ao abrir a excecao (erro transitorio),
  // o status ja e negado e regravar nao seria "transicao" — o E1 nunca abriria
  // e o cliente seguiria sendo cobrado. Por isso: SEMPRE que o status final for
  // "negado", garantimos o E1 aberto de forma idempotente (excecao_ja_aberta =
  // sucesso). Uma retentativa recupera o estado.
  resultado.excecaoDisparada = novo === "negado";
  if (novo !== "negado") {
    return resultado;
  }

  // 1. Garante o processo E1 (pausa a regua via suspende padrao). abrirExcecao
  // retorna a excecao nova; se ja houver uma ativa, lanca excecao_ja_aberta
  // (tratado como sucesso, sem reabrir/duplicar).
  let excecaoNova: Awaited<ReturnType<typeof abrirExcecao>> | null = null;
  try {
    excecaoNova = await abrirExcecao({
      contratoId: args.contratoId,
      tipo: "visto_negado",
      motivo: `Visto negado (registrado por ${args.autor})`,
      titularIdEsperado: contrato.titular_id,
      autor: args.autor,
      ip: args.ip ?? null,
    });
    resultado.excecaoAberta = true;
  } catch (err) {
    if (!(err instanceof ExcecaoBloqueada && err.codigo === "excecao_ja_aberta")) {
      // Falha inesperada ao abrir a excecao: nao mascaramos — o status ja foi
      // gravado, mas o chamador precisa saber que a automacao nao completou (e
      // uma retentativa cai aqui de novo, sem depender de "transicao").
      throw err;
    }
  }

  // E-mail e tarefa disparam quando ABRIMOS o E1 agora (excecaoNova != null):
  // transicao fresca, recuperacao de uma tentativa anterior, ou re-negacao apos
  // um E1 resolvido (abre um novo). NAO disparam quando o E1 ja estava ativo
  // (excecao_ja_aberta) — evita spam de e-mail e tarefa duplicada.
  const titular = Array.isArray(contrato.titular) ? contrato.titular[0] : contrato.titular;
  if (!excecaoNova) {
    return resultado;
  }

  // 2. Tarefa prioritaria ao consultor (contato em 24h). origem 'excecao' e a
  // dedupe por INSTANCIA da excecao (id): a mesma chave da fonte viva da fila, o
  // que evita listar o caso duas vezes e faz o materializador auto-concluir esta
  // tarefa quando a excecao E1 e resolvida/cancelada (a fonte deixa de existir).
  // Um E1 novo (apos o anterior resolvido) tem id novo -> recria a tarefa.
  try {
    const { data: taskInsert } = await supabase
      .from("tasks")
      .upsert(
        {
          categoria: "excecao",
          titulo: "Visto negado — contato em 24h",
          contexto: contrato.estudante_nome || titular?.nome_completo || null,
          alvo_tipo: "excecao",
          alvo_id: excecaoNova.id,
          href: `/admin/clientes/${contrato.titular_id}`,
          papel: "consultor",
          prazo: new Date(Date.now() + MS_24H).toISOString(),
          origem: "excecao",
          chave_dedupe: `excecao:${excecaoNova.id}`,
          criado_por: args.autor,
        },
        { onConflict: "chave_dedupe", ignoreDuplicates: true }
      )
      .select("id");
    resultado.tarefaCriada = !!(taskInsert && taskInsert.length > 0);
  } catch {
    // Mensagem fixa: o err cru de um insert em tasks pode ecoar valores de
    // coluna (nome do estudante/titular) — PII. Nao logamos o objeto.
    console.error("[visto] falha ao criar tarefa de contato do consultor");
  }

  // 3. Notifica o cliente (empatia + proximos passos). Best-effort.
  if (titular?.email) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
    try {
      await enviarAvisoVistoNegadoEmail(titular.email, titular.nome_completo || "", appUrl || null);
      resultado.avisoEnviado = true;
    } catch {
      // Nao logamos o erro cru (a mensagem do provedor pode conter o e-mail);
      // a falha ja fica em email_logs.
      console.error("[visto] falha ao avisar o titular sobre o visto negado (ver email_logs)");
    }
  }

  return resultado;
}
