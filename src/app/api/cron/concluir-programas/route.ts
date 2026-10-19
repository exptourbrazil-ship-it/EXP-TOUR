import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bearerConfere } from "@/lib/segredo";
import { createClient } from "@supabase/supabase-js";
import { resolverEscopoTenant, contratoIdsDoTenant, emLotes } from "@/lib/cron-tenant";
import { estadoDoContrato, registrarTransicao } from "@/lib/contrato-estado-service";
import {
  elegivelParaConclusao,
  folgaConclusaoDias,
  conteudoPedidoCertificado,
  adicionarDiasISO,
  avisoFimJanelaDias,
} from "@/lib/conclusao-programa";
import {
  enviarAlertaFornecedorEmail,
  enviarAvisoInternoEmail,
  enviarAvisoFimProgramaEmail,
} from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron diário de CONCLUSÃO AUTOMÁTICA do programa na data de término
// (contratos.data_fim + folga). Quando o término chega e o contrato está em
// execução (em_programa/retorno), ele vira "concluido" (transição registrada no
// ledger) e a escola (contatos de admissões do supplier) recebe um e-mail pedindo
// a IMAGEM do certificado e o REPORT final, no idioma do contato. Uma cópia
// interna vai para a equipe (não há "consultor dono" por contrato no banco). Sem
// contato da escola -> conclui mesmo assim e alerta a equipe para pedir manual.
//
// Idempotência do E-MAIL (ledger `events`, chave `conclusao_certificado:<id>`):
//  - O claim é ATÔMICO: inserimos a chave como `pendente` (o UNIQUE serializa
//    execuções concorrentes — só uma ganha, as outras veem o conflito 23505). Isso
//    evita e-mail DUPLICADO sob sobreposição de execuções.
//  - A chave só vira `processado` DEPOIS que ao menos um e-mail sai. Assim, se o
//    processo cair entre o claim e o envio, o e-mail NÃO se perde: na conflito
//    23505 olhamos o status — `processado` significa "já enviado" (pula); `pendente`
//    antigo (execução anterior que caiu) é reenviado; `pendente` recente é um irmão
//    concorrente (pula para não duplicar).
//  - Se TODOS os e-mails falham, o claim fica `pendente` e NÃO concluímos — a
//    próxima varredura reprocessa (nada de pedido perdido).
// A conclusão, por ser terminal, tira o contrato da elegibilidade e evita
// reprocessamento no caso comum. Falha FECHADO: sem CRON_SECRET, recusa.

// Janela que separa um irmão concorrente (segundos) de uma execução anterior que
// caiu antes de confirmar o envio (>= 1 dia, já que o cron é diário).
const PENDENTE_OBSOLETO_MS = 60 * 60 * 1000; // 1h

function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
// Conflito de unicidade do Postgres (chave `idempotency_key` já reivindicada).
function ehConflitoUnicidade(err: { code?: string } | null): boolean {
  return err?.code === "23505";
}

// Promove o claim de `pendente` para `processado` (e-mail confirmado). É o que
// impede um REENVIO na próxima varredura; por isso insiste (até 3 tentativas) num
// blip transitório do banco, em vez de deixar o claim `pendente` (que reabriria o
// envio depois de PENDENTE_OBSOLETO_MS). Como o 2º passo reprocessa os concluídos
// recentes (pedido à escola E aviso ao aluno) enquanto estão na janela, a conclusão
// terminal NÃO é mais backstop para esses envios — esta confirmação é o único guarda
// contra duplicata. Retorna true se marcou; false se, mesmo após as tentativas, não
// confirmou (o chamador conta como erro para dar visibilidade).
async function marcarPedidoEnviado(supabase: SupabaseClient, chave: string): Promise<boolean> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { error } = await supabase
      .from("events")
      .update({ status: "processado", processed_at: new Date().toISOString() })
      .eq("idempotency_key", chave);
    if (!error) return true;
    console.error(`[concluir-programas] falha ao marcar pedido enviado (tentativa ${tentativa + 1}):`, error.message);
  }
  return false;
}

// Reivindica uma chave de e-mail e decide se ESTA execução deve (tentar) enviar —
// mesmo padrão robusto do pedido à escola: claim ATÔMICO como `pendente` (o UNIQUE
// serializa execuções concorrentes); em conflito (23505), decide por status/idade
// (`processado` = já enviado; `pendente` antigo = execução que caiu, reenvia;
// `pendente` recente = irmão concorrente, pula). Erro transitório -> "erro".
async function reivindicarEnvio(
  supabase: SupabaseClient,
  chave: string,
  source: string,
  eventType: string,
  externalId: string,
  payload: Record<string, unknown>,
): Promise<"enviar" | "pular" | "erro"> {
  const { error: claimErro } = await supabase.from("events").insert({
    source,
    event_type: eventType,
    idempotency_key: chave,
    external_id: externalId,
    payload,
    status: "pendente",
  });
  if (!claimErro) return "enviar";
  if (ehConflitoUnicidade(claimErro as { code?: string })) {
    const { data: ex, error: exErro } = await supabase
      .from("events")
      .select("status, created_at")
      .eq("idempotency_key", chave)
      .maybeSingle();
    if (exErro) return "erro";
    if (ex?.status === "processado") return "pular";
    const idadeMs = ex?.created_at ? Date.now() - new Date(ex.created_at).getTime() : Infinity;
    return idadeMs >= PENDENTE_OBSOLETO_MS ? "enviar" : "pular";
  }
  return "erro";
}

// Pede à ESCOLA o certificado + relatório de um contrato concluído, idempotente
// pela chave `conclusao_certificado:<id>`. Usado pelo 1º passo (conclusão na data)
// E pelo 2º passo (contratos concluídos por qualquer caminho, inclusive o botão
// "Concluir" do admin) — a chave única garante UM envio só, não importa quem chegar
// primeiro. Envia a admissões + admin do fornecedor (ativos, com e-mail), com o
// botão de upload direto na página do estudante. Sem contato -> alerta interno.
// Retorna "retry" quando nada saiu por falha transitória (todos os e-mails falharam
// ou erro de claim) para o 1º passo NÃO concluir ainda; "ok" caso contrário.
async function pedirCertificadoEscola(
  supabase: SupabaseClient,
  c: { id: string; supplier_id: string | null; estudante_nome: string | null; nome: string | null; data_fim: string | null },
  base: string,
  resultado: { emails_escola: number; sem_contato: number; erros: number },
): Promise<"ok" | "retry"> {
  const chave = `conclusao_certificado:${c.id}`;

  // Claim ATÔMICO do pedido de certificado (status `pendente` até o e-mail sair).
  const { error: claimErro } = await supabase.from("events").insert({
    source: "conclusao_programa",
    event_type: "pedido_certificado",
    idempotency_key: chave,
    external_id: c.id,
    payload: { contrato_id: c.id, supplier_id: c.supplier_id ?? null },
    status: "pendente",
  });

  let enviarAgora: boolean;
  if (!claimErro) {
    enviarAgora = true; // ganhamos o claim
  } else if (ehConflitoUnicidade(claimErro as { code?: string })) {
    // Já existe um claim: decide pelo status/idade.
    const { data: ex, error: exErro } = await supabase
      .from("events")
      .select("status, created_at")
      .eq("idempotency_key", chave)
      .maybeSingle();
    if (exErro) {
      console.error("[concluir-programas] falha ao ler claim do pedido:", exErro.message);
      resultado.erros++;
      return "retry";
    }
    if (ex?.status === "processado") {
      enviarAgora = false; // e-mail já confirmado numa varredura anterior
    } else {
      const idadeMs = ex?.created_at ? Date.now() - new Date(ex.created_at).getTime() : Infinity;
      enviarAgora = idadeMs >= PENDENTE_OBSOLETO_MS; // reenvia só se o pendente é antigo
    }
  } else {
    console.error("[concluir-programas] falha ao reivindicar pedido:", (claimErro as { message?: string }).message);
    resultado.erros++;
    return "retry";
  }

  if (!enviarAgora) return "ok"; // já pedido numa varredura anterior

  const estudante = c.estudante_nome || "o estudante";
  const programa = c.nome || "";
  const dataFimBR = dataBR((c.data_fim ?? "").slice(0, 10));
  // Deep-link direto para a pagina do estudante no Portal do Fornecedor, onde a
  // escola faz o upload do certificado e do relatorio ([id] = contrato_id).
  const botaoUrl = `${base}/fornecedor/estudantes/${c.id}`;

  // Contatos da escola: admissões + admin do fornecedor, ativos e com e-mail.
  let contatos: Array<{ email: string; name: string | null; language: string | null }> = [];
  if (c.supplier_id) {
    const { data: us } = await supabase
      .from("supplier_user")
      .select("email, name, language")
      .eq("supplier_id", c.supplier_id)
      .eq("active", true)
      .in("role", ["admissions", "supplier_admin"]);
    contatos = ((us ?? []) as Array<{ email: string | null; name: string | null; language: string | null }>)
      .filter((u): u is { email: string; name: string | null; language: string | null } => !!u.email);
  }

  if (contatos.length === 0) {
    // Sem contato da escola: alerta a equipe para pedir manualmente e marca o
    // pedido como tratado p/ não re-alertar a cada dia.
    resultado.sem_contato++;
    try {
      await enviarAvisoInternoEmail(
        "Programa concluído sem contato da escola",
        `O contrato ${c.id} foi concluído, mas a escola não tem contato de admissões cadastrado. Solicite a imagem do certificado e o report manualmente.`,
      );
    } catch {
      // best-effort
    }
    if (!(await marcarPedidoEnviado(supabase, chave))) resultado.erros++;
    return "ok";
  }

  // Envia o pedido a cada contato. Só marcamos (e, no 1º passo, concluímos) se AO
  // MENOS UM e-mail saiu — se TODOS falharem, o claim fica `pendente` e a próxima
  // varredura tenta de novo.
  let algumSucesso = false;
  for (const u of contatos) {
    const ct = conteudoPedidoCertificado(u.language || "en", { estudante, programa, dataFimBR });
    try {
      await enviarAlertaFornecedorEmail(u.email, u.name || "", u.language || "en", {
        subject: ct.subject,
        titulo: ct.titulo,
        contexto: ct.contexto,
        botaoLabel: ct.botaoLabel,
        botaoUrl,
      });
      algumSucesso = true;
      resultado.emails_escola++;
    } catch {
      // Não logar o erro cru (pode conter o e-mail). Falha já fica em email_logs.
      resultado.erros++;
    }
  }
  if (!algumSucesso) return "retry";
  // Cópia interna (equipe) — não há consultor-dono por contrato no banco.
  try {
    await enviarAvisoInternoEmail(
      "Programa concluído — certificado solicitado à escola",
      `O contrato ${c.id} foi concluído e o pedido de certificado + report foi enviado à escola.`,
    );
  } catch {
    // best-effort
  }
  if (!(await marcarPedidoEnviado(supabase, chave))) resultado.erros++;
  return "ok";
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (!bearerConfere(request.headers.get("authorization"), cronSecret)) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");
  const hoje = hojeBrasilISO();
  const folga = folgaConclusaoDias();
  // Filtro grosso no SQL: contratos com data_fim <= (hoje − folga) já venceram o
  // prazo de término + folga. O motor puro reconfirma por contrato.
  const limiteISO = adicionarDiasISO(hoje, -folga) ?? hoje;

  // Multi-tenant: só os contratos do tenant do deploy. Falha fechada.
  let contratoIds: string[];
  let tenantSlug: string;
  try {
    const escopo = await resolverEscopoTenant(supabase);
    tenantSlug = escopo.slug;
    contratoIds = await contratoIdsDoTenant(supabase, escopo);
  } catch (err) {
    console.error("[concluir-programas] falha ao resolver tenant:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Tenant nao resolvido" }, { status: 500 });
  }

  const resultado = {
    candidatos: 0,
    concluidos: 0,
    emails_escola: 0,
    sem_contato: 0,
    avisos_aluno: 0,
    avisos_aluno_sem_email: 0,
    erros: 0,
  };
  if (contratoIds.length === 0) return NextResponse.json({ ok: true, ...resultado });

  type LinhaContrato = {
    id: string;
    supplier_id: string | null;
    estudante_nome: string | null;
    nome: string | null;
    data_fim: string | null;
    cancelado_em: string | null;
  };
  const candidatos: LinhaContrato[] = [];
  for (const lote of emLotes(contratoIds, 500)) {
    const { data, error } = await supabase
      .from("contratos")
      .select("id, supplier_id, estudante_nome, nome, data_fim, cancelado_em")
      .in("id", lote)
      .is("cancelado_em", null)
      .not("data_fim", "is", null)
      .lte("data_fim", limiteISO);
    if (error) {
      console.error("[concluir-programas] falha ao ler contratos:", error.message);
      return NextResponse.json({ ok: false, erro: "Falha ao ler contratos" }, { status: 500 });
    }
    for (const c of (data ?? []) as LinhaContrato[]) candidatos.push(c);
  }

  for (const c of candidatos) {
    const estado = await estadoDoContrato(supabase, c.id);
    if (!elegivelParaConclusao({ dataFimISO: c.data_fim, estado, canceladoEm: c.cancelado_em }, hoje, folga)) {
      continue;
    }
    resultado.candidatos++;

    // Pedido de certificado à escola (idempotente). Se nada saiu por falha
    // transitória, NÃO conclui ainda — a próxima varredura tenta de novo.
    if ((await pedirCertificadoEscola(supabase, c, base, resultado)) === "retry") {
      continue;
    }

    // Conclusão idempotente: relê o estado imediatamente antes (guarda contra uma
    // execução concorrente que já concluiu) e só então registra a transição. Entre
    // as varreduras diárias, o estado terminal "concluido" já tira o contrato da
    // elegibilidade, então o caso comum nunca duplica; a janela residual de
    // concorrência é a mesma de qualquer chamador de registrarTransicao.
    const estadoAtual = await estadoDoContrato(supabase, c.id);
    if (!estadoAtual || estadoAtual === "concluido" || estadoAtual === "cancelado") {
      continue; // já finalizado (por outro processo) — nada a concluir
    }
    const tr = await registrarTransicao(supabase, {
      contratoId: c.id,
      de: estadoAtual,
      para: "concluido",
      origem: "sistema",
      autor: "cron:concluir-programas",
      motivo: "Conclusão automática na data de término do programa",
      override: true,
    });
    if (tr.ok) resultado.concluidos++;
    else resultado.erros++;
  }

  // ============================================================================
  // 2º PASSO: aviso de FIM de intercâmbio ao ALUNO (convite ao /retorno).
  // Dispara para contratos concluídos por QUALQUER caminho (este cron OU o botão
  // "Concluir" do admin), então varre os concluídos — não depende do loop acima.
  // JANELA: só conclusões recentes (contrato_transicoes para='concluido' dentro de
  // AVISO_FIM_JANELA_DIAS) — evita disparo retroativo a ex-alunos antigos.
  // Idempotência: chave `fim_intercambio_aluno:<id>` (mesmo padrão robusto do
  // pedido à escola). Sem e-mail do aluno -> conta e pula (sem erro, sem claim).
  // ============================================================================
  const janelaDias = avisoFimJanelaDias();
  const corteISO = adicionarDiasISO(hoje, -janelaDias) ?? hoje;
  const portalRetorno = `${base}/retorno`;

  type LinhaConcluido = {
    id: string;
    titular_id: string | null;
    supplier_id: string | null;
    estudante_nome: string | null;
    estudante_email: string | null;
    nome: string | null;
    data_fim: string | null;
  };
  // Filtra JÁ NO SQL os contratos cuja conclusão (transição para 'concluido') caiu
  // dentro da janela — evita varrer todos os concluídos históricos (custo O(janela),
  // não O(concluídos-de-sempre)) e não escala com o acúmulo de ex-alunos. Escopo do
  // tenant via contratoIds.
  const idsRecentes = new Set<string>();
  for (const lote of emLotes(contratoIds, 500)) {
    const { data, error } = await supabase
      .from("contrato_transicoes")
      .select("contrato_id")
      .in("contrato_id", lote)
      .eq("para", "concluido")
      .gte("created_at", corteISO);
    if (error) {
      console.error("[concluir-programas] falha ao ler transicoes de conclusao:", error.message);
      break;
    }
    for (const r of (data ?? []) as { contrato_id: string }[]) idsRecentes.add(r.contrato_id);
  }

  const concluidos: LinhaConcluido[] = [];
  for (const lote of emLotes([...idsRecentes], 500)) {
    const { data, error } = await supabase
      .from("contratos")
      .select("id, titular_id, supplier_id, estudante_nome, estudante_email, nome, data_fim")
      .in("id", lote)
      .is("cancelado_em", null)
      .eq("estado", "concluido");
    if (error) {
      // Não derruba o 1º passo já concluído; retorna o que houver.
      console.error("[concluir-programas] falha ao ler concluidos:", error.message);
      break;
    }
    for (const c of (data ?? []) as LinhaConcluido[]) concluidos.push(c);
  }

  for (const c of concluidos) {
    // Janela já aplicada no SQL acima (idsRecentes). Dois envios por contrato:
    // (a) pedido de certificado à ESCOLA — idempotente pela chave
    // `conclusao_certificado:<id>`, então se o 1º passo (conclusão na data) já pediu,
    // isto pula; se a conclusão foi MANUAL (botão do admin, sem passar pelo 1º passo),
    // é AQUI que o pedido à escola sai. Cobre "toda vez que o aluno terminar".
    await pedirCertificadoEscola(supabase, c, base, resultado);

    // (b) E-mail ao aluno: estudante -> titular (fallback). Sem e-mail, pula só o
    // aviso ao aluno (o pedido à escola acima já foi feito).
    let email = (c.estudante_email || "").trim();
    if (!email && c.titular_id) {
      const { data: tit } = await supabase
        .from("titulares")
        .select("email")
        .eq("id", c.titular_id)
        .maybeSingle();
      email = (((tit?.email as string) || "")).trim();
    }
    if (!email) {
      resultado.avisos_aluno_sem_email++;
      continue;
    }

    const chave = `fim_intercambio_aluno:${c.id}`;
    const decisao = await reivindicarEnvio(
      supabase,
      chave,
      "fim_intercambio",
      "aviso_aluno",
      c.id,
      { contrato_id: c.id },
    );
    if (decisao === "erro") {
      resultado.erros++;
      continue;
    }
    if (decisao === "pular") continue;

    try {
      await enviarAvisoFimProgramaEmail(
        email,
        { nome: c.estudante_nome || "", programa: c.nome || "", portalUrl: portalRetorno },
        tenantSlug,
      );
      resultado.avisos_aluno++;
      // Confirma o claim. Se não confirmar (mesmo após retries), conta como erro
      // para ficar visível — o claim segue 'pendente' e poderia reenviar na próxima
      // varredura dentro da janela (duplicata rara, preferível a um envio perdido).
      if (!(await marcarPedidoEnviado(supabase, chave))) resultado.erros++;
    } catch {
      // Não logar o erro cru (pode conter o e-mail). Fica em email_logs. O claim
      // segue 'pendente' -> a próxima varredura reenvia (dentro da janela).
      resultado.erros++;
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
