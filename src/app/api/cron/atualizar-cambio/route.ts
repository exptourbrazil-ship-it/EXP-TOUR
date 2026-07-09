import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Busca automaticamente, uma vez por dia, a cotacao comercial oficial do
// Banco Central do Brasil (PTAX, olinda.bcb.gov.br - fonte publica e sem
// autenticacao) para cada moeda usada nos produtos, e aplica um spread
// (SPREAD_CAMBIO_PERCENTUAL) para simular a diferenca entre o cambio
// comercial/interbancario (PTAX) e o cambio de moeda em especie (papel
// moeda) cobrado por casas de cambio como a Confidence Cambio, e em
// seguida aplica o IOF (IOF_CAMBIO_PERCENTUAL) sobre esse valor, assim
// aproximando a cotacao VET do dia.
// A taxa administrativa fixa e somada separadamente no momento de gerar
// a cobranca Pix (rota gerar-cobranca), e nao aqui, pois ela e um valor
// fixo por transacao e nao por unidade de moeda.

const MOEDAS_SUPORTADAS: string[] = ["USD", "CAD", "EUR"];

function formatarDataBCB(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

async function buscarCambioComercialBCB(moeda: string): Promise<number | null> {
  for (let i = 0; i < 10; i++) {
    const data = new Date();
    data.setDate(data.getDate() - i);
    const dataBCB = formatarDataBCB(data);

    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${moeda}'&@dataCotacao='${dataBCB}'&$format=json`;

    const res = await fetch(url);
    if (!res.ok) continue;

    const json: any = await res.json();
    const valores: Array<{ cotacaoVenda: number }> | undefined = json?.value;
    if (valores && valores.length > 0) {
      return Number(valores[valores.length - 1].cotacaoVenda);
    }
  }
  return null;
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

  const spreadPercentual = Number(process.env.SPREAD_CAMBIO_PERCENTUAL || "0.066");
  const iofPercentual = Number(process.env.IOF_CAMBIO_PERCENTUAL || "0.035");
  const hojeISO = new Date().toISOString().slice(0, 10);

  const resultados: Record<string, number | string> = {};

  for (const moeda of MOEDAS_SUPORTADAS) {
    const cambioComercial = await buscarCambioComercialBCB(moeda);

    if (cambioComercial === null) {
      resultados[moeda] = "sem cotacao disponivel no BCB";
      continue;
    }

    const cotacaoVet = Math.round(cambioComercial * (1 + spreadPercentual) * (1 + iofPercentual) * 1e6) / 1e6;

    const { error } = await supabase
      .from("cotacoes_cambio")
      .upsert(
        { moeda, data: hojeISO, cotacao_vet: cotacaoVet },
        { onConflict: "moeda,data" }
      );

    resultados[moeda] = error ? `erro ao gravar: ${error.message}` : cotacaoVet;
  }

  return NextResponse.json({ ok: true, data: hojeISO, resultados });
}
