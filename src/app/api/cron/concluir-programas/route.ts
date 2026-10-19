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
} from "@/lib/conclusao-programa";
import { enviarAlertaFornecedorEmail, enviarAvisoInternoEmail } from "@/lib/email";

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

// Promove o claim de `pendente` para `processado` (e-mail confirmado). Best-effort:
// se falhar, o claim fica `pendente`; a conclusão terminal ainda evita reenvio no
// caso comum, e só uma dupla falha (este update + a conclusão) levaria a um reenvio
// na próxima varredura.
async function marcarPedidoEnviado(supabase: SupabaseClient, chave: string): Promise<void> {
  await supabase
    .from("events")
    .update({ status: "processado", processed_at: new Date().toISOString() })
    .eq("idempotency_key", chave);
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
  try {
    const escopo = await resolverEscopoTenant(supabase);
    contratoIds = await contratoIdsDoTenant(supabase, escopo);
  } catch (err) {
    console.error("[concluir-programas] falha ao resolver tenant:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Tenant nao resolvido" }, { status: 500 });
  }

  const resultado = { candidatos: 0, concluidos: 0, emails_escola: 0, sem_contato: 0, erros: 0 };
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

    // Decide se ESTA execução deve (tentar) enviar o e-mail.
    let enviarAgora: boolean;
    if (!claimErro) {
      enviarAgora = true; // ganhamos o claim
    } else if (ehConflitoUnicidade(claimErro as { code?: string })) {
      // Já existe um claim: decide pelo status/idade (ver cabeçalho).
      const { data: ex, error: exErro } = await supabase
        .from("events")
        .select("status, created_at")
        .eq("idempotency_key", chave)
        .maybeSingle();
      if (exErro) {
        console.error("[concluir-programas] falha ao ler claim do pedido:", exErro.message);
        resultado.erros++;
        continue;
      }
      if (ex?.status === "processado") {
        enviarAgora = false; // e-mail já confirmado numa varredura anterior
      } else {
        const idadeMs = ex?.created_at ? Date.now() - new Date(ex.created_at).getTime() : Infinity;
        enviarAgora = idadeMs >= PENDENTE_OBSOLETO_MS; // reenvia só se o pendente é antigo
      }
    } else {
      // Erro transitório (não-23505): não processa este contrato agora; a próxima
      // varredura tenta de novo (não arrisca concluir/enviar sem base).
      console.error("[concluir-programas] falha ao reivindicar pedido:", (claimErro as { message?: string }).message);
      resultado.erros++;
      continue;
    }

    if (enviarAgora) {
      const estudante = c.estudante_nome || "o estudante";
      const programa = c.nome || "";
      const dataFimBR = dataBR((c.data_fim ?? "").slice(0, 10));
      const botaoUrl = `${base}/fornecedor`;

      // Contatos da escola p/ o pedido de certificado: admissões + admin do
      // fornecedor, ativos e com e-mail (mesma regra dos alertas de fornecedor,
      // fornecedor-alertas.ts, e do alerta 5 em confirmacao-service.ts). Muitas
      // escolas só têm o papel supplier_admin cadastrado — filtrar só "admissions"
      // deixaria o pedido sem destinatário.
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
        // Sem contato da escola: conclui mesmo assim (decisão do produto) e alerta a
        // equipe para pedir manualmente. Marca o pedido como enviado p/ não re-alertar.
        resultado.sem_contato++;
        try {
          await enviarAvisoInternoEmail(
            "Programa concluído sem contato da escola",
            `O contrato ${c.id} foi concluído automaticamente na data de término, mas a escola não tem contato de admissões cadastrado. Solicite a imagem do certificado e o report manualmente.`,
          );
        } catch {
          // best-effort: o aviso interno não deve bloquear a conclusão.
        }
        await marcarPedidoEnviado(supabase, chave);
      } else {
        // Envia o pedido a cada contato. Só seguimos para concluir se AO MENOS UM
        // e-mail saiu — se TODOS falharem, o claim fica `pendente` e NÃO concluímos:
        // o contrato continua elegível e a próxima varredura tenta de novo.
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
        if (!algumSucesso) {
          continue; // nenhum e-mail saiu -> não conclui; reprocessa na próxima varredura
        }
        // Cópia interna (equipe) — não há consultor-dono por contrato no banco.
        try {
          await enviarAvisoInternoEmail(
            "Programa concluído — certificado solicitado à escola",
            `O contrato ${c.id} foi concluído automaticamente na data de término e o pedido de certificado + report foi enviado à escola.`,
          );
        } catch {
          // best-effort
        }
        await marcarPedidoEnviado(supabase, chave);
      }
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

  return NextResponse.json({ ok: true, ...resultado });
}
