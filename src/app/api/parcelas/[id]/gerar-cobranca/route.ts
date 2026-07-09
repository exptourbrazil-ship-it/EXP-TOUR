import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCobrancaPix } from "@/lib/mercadopago";

// Gera (ou reaproveita) uma cobranca Pix para uma parcela especifica e grava
// o QR code / codigo copia-e-cola de volta na tabela parcelas.
//
// A divida (contrato/parcela) fica sempre na moeda do produto (ex: CAD). Como
// o Pix so pode ser cobrado em BRL, este endpoint converte o valor da
// parcela para BRL usando a cotacao VET do dia (cadastrada manualmente pela
// equipe na tabela "cotacoes_cambio"), no momento em que a cobranca e
// gerada -- ou seja, a cotacao aplicada e a do dia do pagamento, e nao a do
// dia em que o contrato foi criado.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: parcela, error } = await supabase
    .from("parcelas")
    .select("*, contrato:contratos(moeda)")
    .eq("id", params.id)
    .single();

  if (error || !parcela) {
    return NextResponse.json({ ok: false, erro: "Parcela nao encontrada" }, { status: 404 });
  }

  if (parcela.status === "pago") {
    return NextResponse.json({ ok: false, erro: "Parcela ja esta paga" }, { status: 400 });
  }

  const moeda = (parcela as any).contrato?.moeda || "BRL";
  let valorCobranca = Number(parcela.valor_original);
  let cotacaoAplicada: number | null = null;

  if (moeda !== "BRL") {
    const hojeISO = new Date().toISOString().slice(0, 10);

    const { data: cotacao } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet, data")
      .eq("moeda", moeda)
      .lte("data", hojeISO)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cotacao) {
      return NextResponse.json(
        {
          ok: false,
          erro: `Falta cadastrar a cotacao VET de hoje para ${moeda} na tabela "cotacoes_cambio" antes de gerar o Pix desta parcela.`,
        },
        { status: 422 }
      );
    }

    cotacaoAplicada = Number(cotacao.cotacao_vet);
    valorCobranca = Math.round(Number(parcela.valor_original) * cotacaoAplicada * 100) / 100;
  }

  try {
    const cobranca = await criarCobrancaPix({
      valor: valorCobranca,
      descricao: parcela.descricao,
      externalReference: parcela.id,
    });

    const qrCodeUrl = cobranca.qrCodeBase64
      ? `data:image/png;base64,${cobranca.qrCodeBase64}`
      : null;

    await supabase
      .from("parcelas")
      .update({
        payment_link: cobranca.qrCode || cobranca.ticketUrl || null,
        qr_code_url: qrCodeUrl,
        external_payment_id: cobranca.paymentId,
        valor_atual: valorCobranca,
        cotacao_aplicada: cotacaoAplicada,
      })
      .eq("id", params.id);

    return NextResponse.json({
      ok: true,
      qrCodeUrl,
      copiaECola: cobranca.qrCode,
      paymentId: cobranca.paymentId,
      valorCobrancaBRL: valorCobranca,
      cotacaoAplicada,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, erro: String(err) }, { status: 500 });
  }
}
