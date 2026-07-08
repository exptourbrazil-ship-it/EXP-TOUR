const MP_API_URL = "https://api.mercadopago.com";

type CobrancaPixParams = {
    valor: number;
    descricao: string;
    externalReference: string;
    payerEmail?: string;
};

// Gera uma cobranca Pix dinamica via API do Mercado Pago (QR Code, sem taxa
// segundo o simulador da conta), nao usa Checkout Pro nem Link de pagamento.
export async function criarCobrancaPix(params: CobrancaPixParams) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
          throw new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado");
    }

  const response = await fetch(`${MP_API_URL}/v1/payments`, {
        method: "POST",
        headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
                "X-Idempotency-Key": params.externalReference,
        },
        body: JSON.stringify({
                transaction_amount: params.valor,
                description: params.descricao,
                payment_method_id: "pix",
                external_reference: params.externalReference,
                payer: {
                          email: params.payerEmail || "cliente@exp-tour.com",
                },
        }),
  });

  if (!response.ok) {
        const erro = await response.text();
        throw new Error(`Erro ao criar cobranca Pix: ${erro}`);
  }

  const data = await response.json();
    const transactionData = data.point_of_interaction?.transaction_data;

  return {
        paymentId: String(data.id),
        qrCodeBase64: transactionData?.qr_code_base64 as string | undefined,
        qrCode: transactionData?.qr_code as string | undefined,
        ticketUrl: transactionData?.ticket_url as string | undefined,
  };
}

// Consulta o status atual de um pagamento no Mercado Pago (usado pelo webhook).
export async function consultarPagamento(paymentId: string) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
          throw new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado");
    }

  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
        throw new Error("Nao foi possivel consultar o pagamento");
  }

  return response.json();
}
