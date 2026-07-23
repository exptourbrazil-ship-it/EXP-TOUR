import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { janelaLembrete, janelaEhAtraso } from "@/lib/regua";
import { enviarLembreteCobrancaEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Regua de cobranca (Vercel Cron, ver vercel.json).
//
// Uma vez por dia, varre as parcelas nao pagas e, quando o vencimento cai em
// uma das janelas (D-7, D-2, D+1, D+5), envia um lembrete por e-mail (Resend)
// com o valor, o vencimento e o codigo Pix (quando ja ha cobranca gerada).
//
// Idempotencia: cada (parcela, janela) so gera um lembrete. O envio e
// registrado em lembretes_cobranca (unique parcela_id+janela), evitando
// reenvio caso o cron rode mais de uma vez no mesmo dia. A cobranca cessa
// naturalmente porque parcelas pagas (status "pago" / paid_at) sao excluidas
// da varredura.

function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatarMoeda(valor: number, moeda: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);
  } catch {
    return `${moeda} ${valor.toFixed(2)}`;
  }
}

function isoMaisDias(base: Date, dias: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const hoje = new Date();
  const hojeISO = hoje.toISOString().slice(0, 10);
  // Janela de busca: cobre de D+5 (venceu ha 5 dias) ate D-7 (vence em 7 dias).
  const minISO = isoMaisDias(hoje, -5);
  const maxISO = isoMaisDias(hoje, 7);

  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || null;

  const { data: parcelas, error } = await supabase
    .from("parcelas")
    .select(
      "id, descricao, valor_atual, vencimento, status, payment_link, contrato:contratos(nome, moeda, titular:titulares(email, nome_completo))"
    )
    .neq("status", "pago")
    .is("paid_at", null)
    .gte("vencimento", minISO)
    .lte("vencimento", maxISO);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao ler parcelas: " + error.message }, { status: 500 });
  }

  const resultado = {
    data: hojeISO,
    analisadas: (parcelas || []).length,
    enviados: 0,
    fora_da_janela: 0,
    sem_email: 0,
    ja_enviados: 0,
    erros: 0,
  };

  for (const p of parcelas || []) {
    const janela = janelaLembrete(hojeISO, p.vencimento);
    if (!janela) {
      resultado.fora_da_janela++;
      continue;
    }

    const contrato = (p as any).contrato;
    const titular = contrato?.titular;
    if (!titular?.email) {
      resultado.sem_email++;
      continue;
    }

    // Idempotencia: ja enviamos este lembrete para esta parcela/janela?
    const { data: existente } = await supabase
      .from("lembretes_cobranca")
      .select("id")
      .eq("parcela_id", p.id)
      .eq("janela", janela)
      .maybeSingle();
    if (existente) {
      resultado.ja_enviados++;
      continue;
    }

    const moeda = contrato?.moeda || "BRL";
    try {
      await enviarLembreteCobrancaEmail(titular.email, titular.nome_completo, {
        descricao: p.descricao,
        valor: formatarMoeda(Number(p.valor_atual), moeda),
        vencimento: formatarData(p.vencimento),
        vencida: janelaEhAtraso(janela),
        pixCode: p.payment_link || null,
        portalUrl,
      });

      // Registra o envio (a constraint unique parcela_id+janela e a garantia
      // final contra duplicidade mesmo sob execucoes concorrentes).
      const { error: erroInsert } = await supabase
        .from("lembretes_cobranca")
        .insert({ parcela_id: p.id, janela });
      if (erroInsert) {
        // Provavel conflito de unicidade (ja registrado por outra execucao):
        // o e-mail pode ter saido, mas nao contabilizamos como novo envio.
        resultado.ja_enviados++;
        continue;
      }
      resultado.enviados++;
    } catch {
      resultado.erros++;
    }
  }

  return NextResponse.json({ ok: true, ...resultado });
}
