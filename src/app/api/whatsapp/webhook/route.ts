import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

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

// Confere a assinatura HMAC-SHA256 que a Meta envia em X-Hub-Signature-256.
//
// Antes o POST nao verificava nada: qualquer um que soubesse a URL podia
// injetar eventos forjados. O handshake do GET valida um token, mas o POST
// nao herdava nada disso. Hoje o handler so registra log, entao o dano seria
// poluicao de log — mas o TODO abaixo preve usar este canal para confirmar CPF
// e validar codigo de acesso, e ai um evento forjado vira bypass de
// autenticacao. A verificacao entra antes disso, nao depois.
//
// Precisa do corpo BRUTO: assinatura sobre o texto exato recebido. Por isso
// lemos request.text() e so depois damos JSON.parse — com request.json() o
// corpo original se perde e a conferencia fica impossivel.
function assinaturaValida(raw: string, header: string | null): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
          console.error("WHATSAPP_APP_SECRET nao configurado: webhook recusado.");
          return false;
        }
    if (!header || !header.startsWith("sha256=")) return false;

    const esperado = Buffer.from(
          "sha256=" + crypto.createHmac("sha256", appSecret).update(raw, "utf8").digest("hex")
        );
    const recebido = Buffer.from(header);
    if (esperado.length !== recebido.length) return false;
    return crypto.timingSafeEqual(esperado, recebido);
  }

export async function POST(request: Request) {
    const raw = await request.text();

    if (!assinaturaValida(raw, request.headers.get("x-hub-signature-256"))) {
          return NextResponse.json({ ok: false, erro: "assinatura invalida" }, { status: 401 });
        }

    let body: any = null;
    try {
          body = raw ? JSON.parse(raw) : null;
        } catch {
          body = null;
        }

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
                            // Nao logamos telefone nem conteudo da mensagem: isso e PII do
                            // cliente, e ia em claro para a retencao de logs da Vercel.
                            // O que serve para diagnostico e saber QUE chegou, e o id.
                            console.log(`Mensagem recebida (id ${mensagem.id ?? "?"})`);
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
