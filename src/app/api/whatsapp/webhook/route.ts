import { NextResponse } from "next/server";

// Webhook do WhatsApp Cloud API (Meta).
// GET: usado pela Meta para verificar a URL do webhook (handshake inicial).
// POST: recebe eventos de mensagens/status enviados pelo WhatsApp.

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe" && token && token === verifyToken) {
          return new NextResponse(challenge, { status: 200 });
        }

    return new NextResponse("Forbidden", { status: 403 });
  }

export async function POST(request: Request) {
    const body = await request.json().catch(() => null);

    if (!body) {
          return NextResponse.json({ ok: true });
        }

    // Estrutura padrao dos eventos do WhatsApp Cloud API:
    // body.entry[].changes[].value.messages[] (mensagens recebidas)
    // body.entry[].changes[].value.statuses[] (status de entrega/leitura)
    try {
          const entry = body.entry?.[0];
          const change = entry?.changes?.[0];
          const value = change?.value;
          const mensagens = value?.messages;

          if (mensagens && mensagens.length > 0) {
                  for (const mensagem of mensagens) {
                            const de = mensagem.from;
                            const texto = mensagem.text?.body;
                            console.log(`Mensagem recebida de ${de}: ${texto}`);
                            // TODO: tratar comandos/respostas do cliente (ex: confirmar CPF,
                                                                                   // validar codigo de acesso, etc.) integrando com a tabela
                            // `titulares` / fluxo de autenticacao no Supabase.
                          }
                }
        } catch (error) {
          console.error("Erro ao processar webhook do WhatsApp:", error);
        }

    return NextResponse.json({ ok: true });
  }
