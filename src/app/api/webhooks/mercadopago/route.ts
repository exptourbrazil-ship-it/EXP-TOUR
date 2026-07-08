import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { consultarPagamento } from "@/lib/mercadopago";

// Webhook do Mercado Pago: recebido quando o status de um pagamento muda.
// Ao confirmar que um pagamento Pix foi aprovado, atualiza a parcela
// correspondente (via external_payment_id) para status "pago".
export async function POST(request: Request) {
    const body = await request.json().catch(() => null);
    const paymentId = body?.data?.id;

  if (!paymentId) {
        return NextResponse.json({ ok: true });
  }

  let pagamento;
    try {
          pagamento = await consultarPagamento(String(paymentId));
    } catch {
          return NextResponse.json({ ok: true });
    }

  if (pagamento.status !== "approved") {
        return NextResponse.json({ ok: true });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  await supabase
      .from("parcelas")
      .update({ status: "pago", paid_at: new Date().toISOString() })
      .eq("external_payment_id", String(paymentId));

  return NextResponse.json({ ok: true });
}
