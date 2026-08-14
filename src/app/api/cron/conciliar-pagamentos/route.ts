import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { montarIdempotencyKey } from "@/lib/mp-events";
import { processarPagamentoMercadoPago } from "@/lib/mp-processar-pagamento";

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

// Teto por execucao: protege contra um lote inesperadamente grande consumir o
// tempo da funcao. O que sobrar entra na proxima execucao.
const LIMITE_POR_EXECUCAO = 200;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
    .limit(LIMITE_POR_EXECUCAO);

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  // Um mesmo paymentId pode aparecer em mais de uma parcela; consultamos o MP
  // uma vez so por pagamento.
  const paymentIds = [
    ...new Set((parcelas ?? []).map((p) => String(p.external_payment_id)).filter(Boolean)),
  ];

  const resumo = { verificados: 0, conciliados: 0, aindaPendentes: 0, erros: 0 };
  const detalhes: Array<{ paymentId: string; resultado: string; parcelas?: number; erro?: string }> = [];

  for (const paymentId of paymentIds) {
    resumo.verificados++;
    const idempotencyKey = montarIdempotencyKey("mercadopago", "payment", paymentId);

    const resultado = await processarPagamentoMercadoPago(supabase, paymentId);

    if (resultado.status === "erro") {
      resumo.erros++;
      detalhes.push({ paymentId, resultado: "erro", erro: resultado.erro });
      await registrarEvento(supabase, idempotencyKey, paymentId, "erro", resultado.erro);
      continue;
    }

    if (resultado.status === "ignorado") {
      // Pagamento existe no MP mas ainda nao esta aprovado (pendente, expirado,
      // cancelado). Nada a fazer: quando aprovar, o webhook ou a proxima
      // execucao deste cron resolve.
      resumo.aindaPendentes++;
      detalhes.push({ paymentId, resultado: `ignorado:${resultado.paymentStatus}` });
      await registrarEvento(supabase, idempotencyKey, paymentId, "ignorado", null);
      continue;
    }

    resumo.conciliados++;
    detalhes.push({ paymentId, resultado: "processado", parcelas: resultado.parcelasAtualizadas });
    await registrarEvento(supabase, idempotencyKey, paymentId, "processado", null);
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

async function registrarEvento(
  supabase: SupabaseClient,
  idempotencyKey: string,
  paymentId: string,
  status: "processado" | "ignorado" | "erro",
  erro: string | null
) {
  const agora = new Date().toISOString();
  try {
    await supabase.from("events").upsert(
      {
        source: "mercadopago",
        event_type: "payment",
        idempotency_key: idempotencyKey,
        external_id: paymentId,
        payload: { origem: "cron:conciliar-pagamentos" },
        status,
        erro,
        processed_at: status === "processado" ? agora : null,
        updated_at: agora,
      },
      { onConflict: "idempotency_key" }
    );
  } catch (err) {
    console.error("[conciliar-pagamentos] falha ao registrar evento:", err);
  }
}
