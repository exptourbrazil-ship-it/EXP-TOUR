import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCobrancaPix } from "@/lib/mercadopago";

// Gera (ou reaproveita) uma cobranca Pix para uma parcela especifica e grava
// o QR code / codigo copia-e-cola de volta na tabela parcelas.
export async function POST(request: Request, { params }: { params: { id: string } }) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: parcela, error } = await supabase
      .from("parcelas")
      .select("*")
      .eq("id", params.id)
      .single();

  if (error || !parcela) {
        return NextResponse.json({ ok: false, erro: "Parcela nao encontrada" }, { status: 404 });
  }

  if (parcela.status === "pago") {
        return NextResponse.json({ ok: false, erro: "Parcela ja esta paga" }, { status: 400 });
  }

  try {
        const cobranca = await criarCobrancaPix({
                valor: Number(parcela.valor_atual),
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
          })
          .eq("id", params.id);

      return NextResponse.json({
              ok: true,
              qrCodeUrl,
              copiaECola: cobranca.qrCode,
              paymentId: cobranca.paymentId,
      });
  } catch (err) {
        return NextResponse.json({ ok: false, erro: String(err) }, { status: 500 });
  }
}
