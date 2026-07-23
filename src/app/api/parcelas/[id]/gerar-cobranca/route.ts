import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCobrancaPix } from "@/lib/mercadopago";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";

// Gera (ou reaproveita) uma cobranca Pix para uma parcela especifica e grava
// o QR code / codigo copia-e-cola de volta na tabela parcelas.
//
// A divida (contrato/parcela) fica sempre na moeda do produto (ex: CAD). Como
// o Pix so pode ser cobrado em BRL, este endpoint converte o valor da
// parcela para BRL usando a cotacao VET do dia (calculada automaticamente
// todo dia a partir do cambio comercial oficial do Banco Central via a rota
// /api/cron/atualizar-cambio, e gravada na tabela "cotacoes_cambio"), no
// momento em que a cobranca e gerada -- ou seja, a cotacao aplicada e a do
// dia do pagamento, e nao a do dia em que o contrato foi criado. Uma taxa
// administrativa fixa (mesma logica aplicada pela casa de cambio de
// referencia) e somada uma unica vez por cobranca, e nao multiplicada pela
// quantidade de moeda.
//
// So o titular autenticado (sessao de CPF + WhatsApp) que e dono do contrato
// pode gerar a cobranca da propria parcela.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const cookieStore = await cookies();
    const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);

  if (!sessao) {
        return NextResponse.json({ ok: false, erro: "Sessao nao autenticada" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: parcela, error } = await supabase
      .from("parcelas")
      .select("*, contrato:contratos(moeda, titular_id)")
      .eq("id", id)
      .single();

  if (error || !parcela) {
        return NextResponse.json({ ok: false, erro: "Parcela nao encontrada" }, { status: 404 });
  }

  if ((parcela as any).contrato?.titular_id !== sessao.titularId) {
        return NextResponse.json(
          { ok: false, erro: "Esta parcela nao pertence ao titular autenticado" },
          { status: 403 }
              );
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
                            erro: `Falta a cotacao VET de hoje para ${moeda} na tabela "cotacoes_cambio" (a busca automatica diaria roda via cron, mas ainda nao encontrou nenhuma cotacao registrada).`,
                },
                { status: 422 }
                      );
      }

      cotacaoAplicada = Number(cotacao.cotacao_vet);
        const taxaAdministrativa = Number(process.env.TAXA_ADMINISTRATIVA_CAMBIO_BRL || "4.99");
        valorCobranca = Math.round((Number(parcela.valor_original) * cotacaoAplicada + taxaAdministrativa) * 100) / 100;
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
          .eq("id", id);

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
