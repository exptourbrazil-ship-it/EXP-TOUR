import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarAvisoInternoEmail } from "@/lib/email";
import { montarResumoAlerta, JANELA_ALERTA_HORAS } from "@/lib/alerta-eventos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alerta de eventos com erro (Vercel Cron, diario).
//
// Por que existe: nao havia canal de alerta nenhum no projeto. O unico sinal de
// que algo quebrou — assinatura invalida do webhook, falha ao processar um
// pagamento — era uma linha na tabela `events`, visivel apenas para quem
// abrisse /admin/sistema e olhasse. Foi exatamente essa cegueira que deixou 8
// pagamentos e R$ 13 mil passarem despercebidos por semanas: o webhook estava
// configurado na aplicacao errada do Mercado Pago, toda notificacao levava 401,
// e nada avisava ninguem.
//
// Este cron fecha o laco: uma vez por dia, se houver evento com status "erro"
// na janela, a equipe recebe um e-mail com o resumo. Nao substitui um APM de
// verdade, mas troca "alguem precisa lembrar de olhar" por "alguem e avisado".
//
// Alertar de novo no dia seguinte e proposital: evento que continua com erro
// continua sendo problema, e o silencio nao deve ser confundido com resolucao.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  const desdeISO = new Date(Date.now() - JANELA_ALERTA_HORAS * 3600 * 1000).toISOString();

  const { data: eventos, error } = await supabase
    .from("events")
    .select("id, source, event_type, external_id, erro, tentativas, updated_at")
    .eq("status", "erro")
    .gte("updated_at", desdeISO)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao ler eventos: " + error.message }, { status: 500 });
  }

  if (!eventos || eventos.length === 0) {
    return NextResponse.json({ ok: true, eventos: 0, alertado: false });
  }

  const texto = montarResumoAlerta(eventos as any, JANELA_ALERTA_HORAS);

  try {
    await enviarAvisoInternoEmail(
      `[EXP Tour] ${eventos.length} evento(s) com erro nas ultimas ${JANELA_ALERTA_HORAS}h`,
      texto
    );
  } catch (err) {
    // Falhar aqui e grave: o alerta e a ultima linha de defesa. Devolvemos 500
    // para o log da Vercel registrar, em vez de responder ok e sumir.
    console.error("[alertar-eventos] falha ao enviar o alerta:", err);
    return NextResponse.json(
      { ok: false, eventos: eventos.length, erro: "Falha ao enviar o alerta." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, eventos: eventos.length, alertado: true });
}
