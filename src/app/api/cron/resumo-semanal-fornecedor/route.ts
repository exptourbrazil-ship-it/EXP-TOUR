import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dadosResumoSemanal } from "@/lib/fornecedor-dados";
import { montarResumoSemanal, conteudoResumo, semanaISO, chaveResumo } from "@/lib/resumo-semanal";
import { enviarAlertaFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alerta 9 (doc 06): resumo semanal ao fornecedor — segunda-feira, SE houver
// atividade (pendências abertas / novos estudantes / novos documentos na semana).
// Um e-mail por fornecedor, para TODOS os usuários ativos, com botão "Abrir meu
// painel". Idempotente por (fornecedor + semana ISO): reivindica a chave no
// ledger events ANTES de enviar, então uma semana só vira e-mail UMA vez. Falha
// FECHADO: sem CRON_SECRET, recusa.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");

  const agora = new Date();
  const hojeISO = agora.toISOString().slice(0, 10);
  const semana = semanaISO(hojeISO);
  const desdeISO = new Date(agora.getTime() - 7 * 86_400_000).toISOString(); // últimos 7 dias

  const dados = await dadosResumoSemanal(supabase, desdeISO);
  const resultado = { fornecedores: dados.length, com_atividade: 0, enviados: 0, ja_enviados: 0, erros: 0 };

  for (const d of dados) {
    const resumo = montarResumoSemanal(d);
    if (!resumo.temAtividade) continue;
    const destinatarios = d.usuarios.filter((u) => u.email);
    if (destinatarios.length === 0) continue;
    resultado.com_atividade++;

    // Reivindica a chave da semana ANTES de enviar (dedupe + anti-concorrência).
    const { error: erroClaim } = await supabase.from("events").insert({
      source: "portal_fornecedor",
      event_type: "resumo_semanal",
      idempotency_key: chaveResumo(d.supplierId, semana),
      external_id: d.supplierId,
      payload: { supplier_id: d.supplierId, semana, ...resumo.contagem },
      status: "processado",
      processed_at: new Date().toISOString(),
    });
    if (erroClaim) {
      // 23505 (já enviado nesta semana) ou outra falha -> não reenvia.
      resultado.ja_enviados++;
      continue;
    }

    for (const u of destinatarios) {
      const c = conteudoResumo(resumo, u.language || "en");
      try {
        await enviarAlertaFornecedorEmail(u.email as string, u.name || "", u.language || "en", {
          subject: c.subject,
          titulo: c.titulo,
          contexto: c.contexto,
          botaoLabel: c.botaoLabel,
          botaoUrl: `${base}/fornecedor`,
        });
        resultado.enviados++;
      } catch {
        // Não logar o erro cru (pode conter o e-mail). Falha fica em email_logs.
        resultado.erros++;
      }
    }
  }

  return NextResponse.json({ ok: true, semana, ...resultado });
}
