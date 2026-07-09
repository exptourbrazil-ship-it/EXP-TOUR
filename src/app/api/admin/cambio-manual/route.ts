import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Rota de fallback manual para moedas que nao possuem fonte automatica
// confiavel (por exemplo, o NZD, que o BCB nao publica no boletim PTAX e
// cujo cross-rate via Reserve Bank of New Zealand e bloqueado para
// requisicoes automatizadas). A equipe da EXP Tour informa o cambio
// comercial do dia (ex: cotacao vista em um site de referencia) e esta
// rota aplica a mesma formula de spread + IOF usada no cron automatico,
// gravando o resultado na mesma tabela cotacoes_cambio.
// Protegida por um segredo simples (ADMIN_CAMBIO_SECRET), pois a
// autenticacao real de staff ainda nao foi construida.

export async function POST(request: Request) {
  const adminSecret = process.env.ADMIN_CAMBIO_SECRET;
  const authHeader = request.headers.get("authorization");
  if (adminSecret && authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const moeda = body?.moeda ? String(body.moeda).toUpperCase() : null;
  const cambioComercial = body?.cambioComercial ? Number(body.cambioComercial) : null;

  if (!moeda || !cambioComercial || Number.isNaN(cambioComercial) || cambioComercial <= 0) {
    return NextResponse.json(
      { ok: false, erro: "Informe 'moeda' e 'cambioComercial' (numero maior que zero)" },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const spreadPercentual = Number(process.env.SPREAD_CAMBIO_PERCENTUAL || "0.066");
  const iofPercentual = Number(process.env.IOF_CAMBIO_PERCENTUAL || "0.035");
  const hojeISO = new Date().toISOString().slice(0, 10);

  const cotacaoVet = Math.round(cambioComercial * (1 + spreadPercentual) * (1 + iofPercentual) * 1e6) / 1e6;

  const { error } = await supabase
    .from("cotacoes_cambio")
    .upsert(
      { moeda, data: hojeISO, cotacao_vet: cotacaoVet },
      { onConflict: "moeda,data" }
    );

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, moeda, data: hojeISO, cambioComercial, cotacaoVet });
}
