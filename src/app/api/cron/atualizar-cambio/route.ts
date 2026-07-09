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
//
// O BCB nao publica cotacao PTAX para NZD (Dolar da Nova Zelandia). Para
// essa moeda, aproximamos o cambio comercial por uma conversao cruzada,
// usando a taxa NZD/USD publicada diariamente e gratuitamente pelo
// Reserve Bank of New Zealand (fonte oficial, sem autenticacao) e a
// cotacao USD/BRL do proprio BCB: NZD/BRL = (NZD/USD do RBNZ) x (USD/BRL do BCB).
// Essa camada extra de aproximacao deve ser levada em conta ao validar o NZD.

const MOEDAS_SUPORTADAS: string[] = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD"];

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

// Busca a taxa NZD/USD (quantos USD equivalem a 1 NZD) na tabela diaria
// publicada pelo Reserve Bank of New Zealand (pagina publica, sem
// autenticacao). A tabela mostra as ultimas datas em colunas; usamos a
// ultima coluna (data mais recente publicada).
async function buscarTaxaNZDUSDRBNZ(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://www.rbnz.govt.nz/statistics/series/exchange-and-interest-rates/exchange-rates-and-the-trade-weighted-index"
    );
    if (!res.ok) return null;
    const html = await res.text();

    const linhaMatch = html.match(/<tr>\s*<td>United States dollar<\/td>([\s\S]*?)<\/tr>/);
    if (!linhaMatch) return null;

    const valores = Array.from(linhaMatch[1].matchAll(/<td[^>]*>([\d.,]+)<\/td>/g)).map((m) =>
      Number(m[1].replace(",", "."))
    );
    if (valores.length === 0) return null;

    return valores[valores.length - 1];
  } catch {
    return null;
  }
}

async function buscarCambioComercial(moeda: string): Promise<number | null> {
  if (moeda === "NZD") {
    const cambioUSD = await buscarCambioComercialBCB("USD");
    const taxaNzdUsd = await buscarTaxaNZDUSDRBNZ();
    if (cambioUSD === null || taxaNzdUsd === null) return null;
    return cambioUSD * taxaNzdUsd;
  }
  return buscarCambioComercialBCB(moeda);
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
    const cambioComercial = await buscarCambioComercial(moeda);

    if (cambioComercial === null) {
      resultados[moeda] = "sem cotacao disponivel";
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
