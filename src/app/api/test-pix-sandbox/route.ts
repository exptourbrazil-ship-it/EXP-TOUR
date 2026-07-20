import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = process.env.MERCADOPAGO_TEST_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MERCADOPAGO_TEST_ACCESS_TOKEN nao configurado" }, { status: 500 });
  }
  const searchParams = request.nextUrl.searchParams;
  const payerEmail = searchParams.get("email") || "test_user_123456@testuser.com";
  const idempotencyKey = "sandbox-test-" + Date.now();
  const response = await fetch("https://api.mercadopago.com/v1/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + accessToken,
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: 10,
      description: "Teste sandbox Pix EXP Tour",
      payment_method_id: "pix",
      payer: { email: payerEmail },
    }),
  });
  const data = await response.json();
  return NextResponse.json({
    httpStatus: response.status,
    paymentId: data.id,
    paymentStatus: data.status,
    statusDetail: data.status_detail,
    hasQrCode: Boolean(data.point_of_interaction && data.point_of_interaction.transaction_data && data.point_of_interaction.transaction_data.qr_code),
    qrCode: data.point_of_interaction && data.point_of_interaction.transaction_data ? data.point_of_interaction.transaction_data.qr_code : null,
    error: data.error || null,
    message: data.message || null,
    payerEmailUsed: payerEmail,
  });
}
