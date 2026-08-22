import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { montarIdempotencyKey } from "@/lib/mp-events";
import { processarPagamentoMercadoPago } from "@/lib/mp-processar-pagamento";
import { tratarDisputaLedger } from "@/lib/disputa-service";

export const runtime = "nodejs";

// Rede de seguranca do webhook do Mercado Pago.
//
// Por que existe: em agosto/2026 o webhook ficou semanas sem entregar nada
// (cadastrado na aplicacao errada no painel do MP) e oito pagamentos aprovados,
// somando R$ 13.116,18, ficaram como "pendente" no portal. Ninguem percebeu
// porque o sistema so descobria um pagamento se o MP avisasse.
//
// Este cron inverte a direcao: em vez de esperar a notificacao, ele varre as
// parcelas que tem cobranca gerada e ainda nao estao pagas e PERGUNTA ao MP o
// status de cada uma. Se o webhook falhar de novo — secret trocado, aplicacao
// errada, indisponibilidade do MP — o pior caso passa a ser um atraso de um dia
// em vez de silencio indefinido.
//
// Idempotente de ponta a ponta: reaproveita processarPagamentoMercadoPago (a
// mesma funcao do webhook), que nunca marca a mesma parcela como paga duas
// vezes, e grava o resultado no ledger `events` com a mesma idempotency_key do
// webhook — entao webhook e cron nunca duplicam efeito um do outro.

// Teto por execucao: protege contra um lote inesperadamente grande estourar o
// tempo da funcao.
//
// Atencao: a ordenacao e estavel (vencimento crescente), entao o que fica de
// fora do teto NAO entra sozinho na proxima execucao — seria sempre o mesmo
// prefixo. Por isso o excedente e logado como erro: se isso comecar a aparecer,
// o teto precisa subir ou a varredura precisa de cursor. Com o volume atual
// (dezenas de parcelas em aberto) a margem e enorme.
const LIMITE_POR_EXECUCAO = 200;

export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // Falha FECHADO. Antes era `if (cronSecret && ...)`: se a variavel sumisse,
  // fosse renomeada ou ficasse vazia, a guarda era pulada e a rota virava
  // publica, sem nenhum sinal. Configuracao faltante agora recusa.
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: parcelas, error } = await supabase
    .from("parcelas")
    .select("id, external_payment_id")
    .neq("status", "pago")
    .not("external_payment_id", "is", null)
    .order("vencimento", { ascending: true })
    .limit(LIMITE_POR_EXECUCAO);

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  if ((parcelas ?? []).length >= LIMITE_POR_EXECUCAO) {
    console.error(
      `[conciliar-pagamentos] teto de ${LIMITE_POR_EXECUCAO} parcelas atingido. ` +
        `As parcelas alem do teto NAO sao verificadas por nenhuma execucao. Aumentar o teto ou paginar.`
    );
  }

  // Um mesmo paymentId pode aparecer em mais de uma parcela; consultamos o MP
  // uma vez so por pagamento.
  const paymentIds = [
    ...new Set((parcelas ?? []).map((p) => String(p.external_payment_id)).filter(Boolean)),
  ];

  const resumo = { verificados: 0, conciliados: 0, aindaPendentes: 0, disputas: 0, erros: 0 };
  const detalhes: Array<{ paymentId: string; resultado: string; parcelas?: number; erro?: string }> = [];

  for (const paymentId of paymentIds) {
    const idempotencyKey = montarIdempotencyKey("mercadopago", "payment", paymentId);

    // Se o webhook ja processou este pagamento, nao ha o que conciliar: pula
    // sem gastar uma chamada a API do MP.
    const { data: existente } = await supabase
      .from("events")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existente?.status === "processado") continue;

    resumo.verificados++;
    const resultado = await processarPagamentoMercadoPago(supabase, paymentId);

    if (resultado.status === "erro") {
      resumo.erros++;
      detalhes.push({ paymentId, resultado: "erro", erro: resultado.erro });
      await registrarEvento(supabase, existente?.id, idempotencyKey, paymentId, "erro", resultado.erro);
      continue;
    }

    if (resultado.status === "disputa") {
      // So alcancavel quando a parcela AINDA nao esta paga e o MP ja retorna
      // disputa (a varredura filtra status != pago). O caso comum — contestacao
      // DEPOIS da aprovacao — nao entra aqui (parcela fica 'pago'); esse e
      // coberto pelo webhook e pela 2a passada abaixo (reprocessa disputas
      // presas). Idempotente via ledger dispute:<id>.
      const res = await tratarDisputaLedger(supabase, paymentId, resultado.paymentStatus, {
        origem: "cron:conciliar-pagamentos",
      });
      if (res.outcome === "erro") {
        resumo.erros++;
        detalhes.push({ paymentId, resultado: "disputa:erro", erro: res.erro });
      } else {
        resumo.disputas++;
        detalhes.push({ paymentId, resultado: `disputa:${resultado.paymentStatus}` });
      }
      continue;
    }

    if (resultado.status === "ignorado") {
      // Pagamento existe no MP mas ainda nao esta aprovado (pendente, expirado,
      // cancelado). Nada a fazer: quando aprovar, o webhook ou a proxima
      // execucao deste cron resolve.
      //
      // Se ja existe evento para esta chave, NAO escrevemos: um "ignorado" do
      // cron nao pode apagar um "erro" que o webhook registrou (o alerta
      // sumiria de /admin/sistema) nem sobrescrever o payload bruto guardado
      // para auditoria/replay.
      resumo.aindaPendentes++;
      detalhes.push({ paymentId, resultado: `ignorado:${resultado.paymentStatus}` });
      if (!existente) {
        await registrarEvento(supabase, undefined, idempotencyKey, paymentId, "ignorado", null);
      }
      continue;
    }

    resumo.conciliados++;
    detalhes.push({ paymentId, resultado: "processado", parcelas: resultado.parcelasAtualizadas });
    await registrarEvento(supabase, existente?.id, idempotencyKey, paymentId, "processado", null);
  }

  // 2a passada — rede de seguranca das DISPUTAS: reprocessa eventos de disputa
  // que ficaram presos ('erro'/'pendente') porque o webhook detectou a
  // contestacao mas a abertura do E9 falhou (erro transitorio). E o caminho real
  // de recuperacao do E9, ja que a 1a passada nao reve parcelas 'pago' (o caso
  // comum de contestacao pos-aprovacao). Idempotente via tratarDisputaLedger.
  const { data: disputasPresas } = await supabase
    .from("events")
    .select("id, external_id")
    .eq("source", "mercadopago")
    .eq("event_type", "dispute")
    .in("status", ["pendente", "erro"])
    .limit(LIMITE_POR_EXECUCAO);

  for (const d of disputasPresas ?? []) {
    const pid = d.external_id ? String(d.external_id) : "";
    if (!pid) continue;
    // Reconsulta o status atual no MP (a disputa pode ter evoluido).
    const chk = await processarPagamentoMercadoPago(supabase, pid);
    if (chk.status === "erro") {
      // Erro transitorio na consulta: deixa preso para o proximo cron retentar.
      continue;
    }
    if (chk.status !== "disputa") {
      // A disputa saiu de disputa no MP (ex.: resolvida -> approved/refunded). O
      // E9 nao se aplica mais por este caminho: encerra o evento como 'ignorado'
      // para sair da fila de retry (senao seria reconsultado todo dia p/ sempre).
      await supabase
        .from("events")
        .update({
          status: "ignorado",
          erro: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);
      detalhes.push({ paymentId: pid, resultado: `disputa:retry:encerrada:${chk.status}` });
      continue;
    }
    const res = await tratarDisputaLedger(supabase, pid, chk.paymentStatus, {
      origem: "cron:conciliar-pagamentos:retry",
    });
    if (res.outcome === "erro") {
      resumo.erros++;
      detalhes.push({ paymentId: pid, resultado: "disputa:retry:erro", erro: res.erro });
    } else if (res.outcome !== "duplicado") {
      resumo.disputas++;
      detalhes.push({ paymentId: pid, resultado: `disputa:retry:${res.outcome}` });
    }
  }

  // Um pagamento conciliado aqui e, por definicao, um que o webhook deixou
  // passar. Deixa barulhento no log para nao virar normalidade silenciosa.
  if (resumo.conciliados > 0) {
    console.warn(
      `[conciliar-pagamentos] ${resumo.conciliados} pagamento(s) aprovado(s) so foram detectados pela conciliacao, ` +
        `nao pelo webhook. Verificar a configuracao de webhook da aplicacao no painel do Mercado Pago.`
    );
  }

  return NextResponse.json({ ok: true, resumo, detalhes });
}

// Grava o resultado no mesmo ledger do webhook.
//
// Quando o evento ja existe (eventId presente) fazemos UPDATE de campos
// especificos em vez de upsert do objeto inteiro: `payload` guarda o corpo
// bruto recebido do MP, para auditoria e replay, e um upsert do cron o
// substituiria por metadado proprio, destruindo o registro original.
async function registrarEvento(
  supabase: SupabaseClient,
  eventId: string | undefined,
  idempotencyKey: string,
  paymentId: string,
  status: "processado" | "ignorado" | "erro",
  erro: string | null
) {
  const agora = new Date().toISOString();
  try {
    const { error } = eventId
      ? await supabase
          .from("events")
          .update({
            status,
            erro,
            ...(status === "processado" ? { processed_at: agora } : {}),
            updated_at: agora,
          })
          .eq("id", eventId)
      : await supabase.from("events").insert({
          source: "mercadopago",
          event_type: "payment",
          idempotency_key: idempotencyKey,
          external_id: paymentId,
          payload: { origem: "cron:conciliar-pagamentos" },
          status,
          erro,
          processed_at: status === "processado" ? agora : null,
          updated_at: agora,
        });

    // supabase-js devolve o erro em `error` e nao lanca: sem este check a rota
    // responderia ok:true com o ledger dessincronizado.
    if (error) {
      console.error("[conciliar-pagamentos] falha ao registrar evento:", error.message);
    }
  } catch (err) {
    console.error("[conciliar-pagamentos] falha ao registrar evento:", err);
  }
}
