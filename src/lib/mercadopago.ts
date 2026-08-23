const MP_API_URL = "https://api.mercadopago.com";

// Deriva a URL publica do webhook a partir do ambiente. MANTIDA como helper
// (testada em mercadopago.test.ts), mas NAO e mais enviada em cada cobranca
// (ver criarCobrancaPix).
//
// Historico: quando o webhook do painel estava cadastrado na aplicacao errada
// (o access token pertencia a outra), o MP nao tinha para onde avisar. Como
// paliativo, passamos a enviar notification_url na propria cobranca. Depois de
// cadastrar o webhook do painel na aplicacao DONA do pagamento, os dois canais
// passaram a entregar a MESMA notificacao: a do painel validava a assinatura e
// a do notification_url caia como "assinatura-invalida", poluindo o ledger de
// eventos e disparando o alerta diario a toa. Com um unico canal (o painel,
// cuja assinatura ja conferimos), o ruido some. A rede de seguranca contra
// webhook perdido passa a ser o cron de conciliacao, que reconsulta o MP
// independentemente de notificacao.
//
// O MP recusaria a criacao do pagamento se a URL nao fosse https publica, entao
// esta funcao retorna null em dev (localhost) ou sem NEXT_PUBLIC_APP_URL.
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
  //
  // O sufixo de versao entra na chave porque o FORMATO da requisicao ja mudou
  // duas vezes: v2 passou a enviar notification_url; v3 parou de envia-la (a
  // entrega ficou so no webhook do painel, evitando a notificacao duplicada que
  // caia como assinatura-invalida). Sem bumpar a versao, regerar a cobranca de
  // uma parcela no mesmo valor faria o MP devolver o pagamento ANTIGO (no
  // formato anterior) em vez de um novo. Ao mudar o formato de novo, incrementar.
  const idempotencyKey = `${params.externalReference}:${params.valor.toFixed(2)}:v3`;

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

// Estorna (refund) um pagamento no Mercado Pago (motor de acerto, Fatia C/D).
// `valorBRL` ausente/<=0 => estorno TOTAL; caso contrario, estorno PARCIAL do
// valor informado. `idempotencyKey` (X-Idempotency-Key) garante que um retry
// nao gere um segundo estorno para a mesma intencao. Retorna o corpo do MP
// (inclui `id` do refund e `status`). Dispara SO na Fatia D (execucao); aqui e
// so o wrapper.
export async function refundPayment(
  paymentId: string,
  valorBRL?: number,
  idempotencyKey?: string
) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (idempotencyKey) headers["X-Idempotency-Key"] = idempotencyKey;

  const parcial = typeof valorBRL === "number" && valorBRL > 0;
  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}/refunds`, {
    method: "POST",
    headers,
    body: parcial ? JSON.stringify({ amount: Math.round(valorBRL * 100) / 100 }) : "{}",
  });

  if (!response.ok) {
    const erro = await response.text();
    throw new Error(`Erro ao estornar pagamento: ${erro}`);
  }
  return response.json();
}

// Consulta o status atual de um pagamento no Mercado Pago (usado pelo webhook).
// Retorna null quando o pagamento NAO existe (404); lanca nos demais erros.
export async function consultarPagamento(paymentId: string) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
          throw new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado");
    }

  const response = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Pagamento inexistente e condicao PERMANENTE, nao transitoria: retentar
  // nunca vai encontra-lo. Devolvemos null para o chamador tratar como
  // "ignorado" (200), em vez de lancar -> 500 -> MP reentregar em loop. Foi
  // isso que gerou as 3 tentativas do id ficticio 123456 do "Simular
  // notificacao" do painel.
  if (response.status === 404) {
        return null;
  }

  if (!response.ok) {
        throw new Error("Nao foi possivel consultar o pagamento");
  }

  return response.json();
}
