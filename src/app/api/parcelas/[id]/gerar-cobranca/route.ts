import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarCobrancaPix, cancelarPagamento } from "@/lib/mercadopago";
import { cookies } from "next/headers";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { converterParaBRL } from "@/lib/cambio";
import { valorProgramaAtual } from "@/lib/parcelas";

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
        return NextResponse.json({ ok: false, erro: "Sessão não autenticada" }, { status: 401 });
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
        return NextResponse.json({ ok: false, erro: "Parcela não encontrada" }, { status: 404 });
  }

  if ((parcela as any).contrato?.titular_id !== sessao.titularId) {
        return NextResponse.json(
          { ok: false, erro: "Esta parcela não pertence ao titular autenticado" },
          { status: 403 }
              );
  }

  if (parcela.status === "pago") {
        return NextResponse.json({ ok: false, erro: "Parcela já está paga" }, { status: 400 });
  }

  const moeda = (parcela as any).contrato?.moeda || "BRL";
    // Base da cobranca = valor efetivo na moeda do programa (com ajustes do
    // cliente), nao o valor_original. Antes da cobranca ser gerada isso e o
    // valor_atual; assim o Pix cobra exatamente o que o cliente ve na tela.
    let valorCobranca = valorProgramaAtual(parcela as any);
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
        // A cotacao_vet ja embute o cambio BACEN do dia + spread + IOF
        // (ver cron atualizar-cambio). O valor cobrado e apenas a conversao,
        // sem taxa administrativa fixa.
        valorCobranca = converterParaBRL(valorProgramaAtual(parcela as any), cotacaoAplicada);
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

      // Se havia uma cobranca anterior e a nova e diferente (valor mudou),
      // cancela a antiga no MP para o cliente nao pagar o QR/valor velho.
      // Melhor esforco: uma falha aqui nao deve impedir a nova cobranca.
      const idAnterior = (parcela as any).external_payment_id as string | null;
      if (idAnterior && idAnterior !== cobranca.paymentId) {
              try {
                        await cancelarPagamento(idAnterior);
              } catch {
                        // ignora: a nova cobranca ja e a valida exibida ao cliente
              }
      }

      await supabase
          .from("parcelas")
          .update({
                    payment_link: cobranca.qrCode || cobranca.ticketUrl || null,
                    qr_code_url: qrCodeUrl,
                    external_payment_id: cobranca.paymentId,
                    // valor_atual NAO e tocado: continua na moeda do programa.
                    // O BRL cobrado vai para a coluna dedicada.
                    valor_cobrado_brl: valorCobranca,
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
