import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { dadosParaAlertasFornecedor } from "@/lib/fornecedor-dados";
import { montarAlertas, conteudoAlerta } from "@/lib/fornecedor-alertas";
import { enviarAlertaFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron de alertas do Portal do Fornecedor (matriz 1-4 da doc 06). Uma vez por
// dia, deriva as pendencias de cada fornecedor e envia os e-mails que ainda nao
// sairam, no idioma de cada usuario, com UM botao que leva a tela certa.
//
// Cadencia/idempotencia: cada alerta tem uma CHAVE deterministica (LOA em D+3 e
// D+7 sao chaves distintas; documento devolvido por id do doc; etc.). A chave e
// gravada no ledger `events` (idempotency_key unica): "reivindicamos" a chave
// ANTES de enviar, entao uma pendencia so vira e-mail UMA vez — e uma pendencia
// resolvida simplesmente deixa de existir na proxima varredura (nao ha o que
// reenviar). Falha FECHADO: sem CRON_SECRET, recusa.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");

  const dados = await dadosParaAlertasFornecedor(supabase);

  const resultado = { fornecedores: dados.length, itens: 0, enviados: 0, ja_enviados: 0, erros: 0 };

  for (const d of dados) {
    const itens = montarAlertas(d.pendencias, d.usuarios);
    for (const item of itens) {
      resultado.itens++;

      // Reivindica a chave no ledger ANTES de enviar (dedupe + anti-concorrencia).
      const { error: erroClaim } = await supabase.from("events").insert({
        source: "portal_fornecedor",
        event_type: "alerta",
        idempotency_key: item.chave,
        external_id: item.pendencia.contratoId,
        payload: {
          tipo: item.pendencia.tipo,
          contrato_id: item.pendencia.contratoId,
          destinatarios: item.destinatarios.map((x) => x.email),
        },
        status: "processado",
        processed_at: new Date().toISOString(),
      });
      if (erroClaim) {
        // Conflito de unicidade (ja enviado) ou outra falha -> nao reenvia.
        resultado.ja_enviados++;
        continue;
      }

      const botaoUrl = `${base}${item.caminho}`;
      for (const dest of item.destinatarios) {
        const c = conteudoAlerta(item.pendencia, dest.language);
        try {
          await enviarAlertaFornecedorEmail(dest.email, dest.name, dest.language, {
            subject: c.subject,
            titulo: c.titulo,
            contexto: c.contexto,
            botaoLabel: c.botaoLabel,
            botaoUrl,
          });
          resultado.enviados++;
        } catch {
          // Nao logar o erro cru (pode conter o e-mail). Falha ja fica em email_logs.
          resultado.erros++;
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
