const MP_API_URL = "https://api.mercadopago.com";

// URL de notificacao enviada junto com cada cobranca.
//
// Historico do bug: a entrega das notificacoes dependia exclusivamente do
// webhook cadastrado no painel da aplicacao no Mercado Pago. O painel estava
// configurado na aplicacao errada (o access token pertencia a outra), entao o
// MP nunca tinha para onde avisar e nenhum pagamento aprovado chegava ao
// portal. Mandando notification_url na propria cobranca, a entrega deixa de
// depender de configuracao manual de painel.
//
// O MP recusa a criacao do pagamento se a URL nao for https publica, entao em
// dev (localhost) ou sem NEXT_PUBLIC_APP_URL simplesmente omitimos o campo.
export function notificationUrl(): string | null {
  const base = (process.env.MP_NOTIFICATION_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (!base) return null;
  const url = process.env.MP_NOTIFICATION_URL
    ? base
    : `${base.replace(/\/$/, "")}/api/webhooks/mercadopago`;
  if (!url.startsWith("https://")) return null;
  if (/^https:\/\/(localhost|127\.0\.0\.1)/i.test(url)) return null;
  return url;
}

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

  // A chave de idempotencia precisa variar com o VALOR, nao so com a parcela.
  // Se usar apenas o id da parcela, ao regerar a cobranca com um valor diferente
  // (ex.: apos o cliente ajustar a parcela) o Mercado Pago devolve a cobranca
  // ANTIGA (mesmo QR/valor) em vez de criar uma nova — o QR ficaria cobrando o
  // valor velho enquanto o sistema registra o novo. Incluindo o valor na chave,
  // um valor diferente gera uma cobranca nova; o mesmo valor continua idempotente
  // (protege contra duplo-clique).
  const idempotencyKey = `${params.externalReference}:${params.valor.toFixed(2)}`;

  const response = await fetch(`${MP_API_URL}/v1/payments`, {
        method: "POST",
        headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
                "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
                transaction_amount: params.valor,
                description: params.descricao,
                payment_method_id: "pix",
                external_reference: params.externalReference,
                ...(notificationUrl() ? { notification_url: notificationUrl() } : {}),
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

// Cancela um pagamento Pix pendente no Mercado Pago. Usado ao regerar uma
// cobranca com valor diferente: a cobranca antiga (QR com o valor velho)
// precisa ser invalidada para o cliente nao conseguir pagar o valor errado.
// Melhor esforco: lanca em caso de falha, mas o chamador trata (nao deve
// impedir a criacao da nova cobranca).
export async function cancelarPagamento(paymentId: string) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
          throw new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado");
    }

  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
        method: "PUT",
        headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
  });

  if (!response.ok) {
        const erro = await response.text();
        throw new Error(`Erro ao cancelar cobranca Pix: ${erro}`);
  }

  return response.json();
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
