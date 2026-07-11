// Funções auxiliares para envio de mensagens via WhatsApp Cloud API (Meta).
// Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api

import { createClient } from "@supabase/supabase-js";

const GRAPH_API_VERSION = "v21.0";

function getConfig() {
        const accessToken = process.env.WHATSAPP_ACCESS_TOKEN as string;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID as string;

    if (!accessToken || !phoneNumberId) {
                throw new Error(
                                "WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurados"
                            );
    }

    return { accessToken, phoneNumberId };
}

// Grava o resultado de uma tentativa de envio na tabela whatsapp_logs,
// para permitir auditoria posterior (mesmo quando o chamador ignora o erro).
async function registrarLog(
        destinatario: string,
        tipoMensagem: string,
        sucesso: boolean,
        erro?: string
    ) {
        try {
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
                    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
                    const supabase = createClient(supabaseUrl, serviceRoleKey);

            await supabase.from("whatsapp_logs").insert({
                            destinatario,
                            tipo_mensagem: tipoMensagem,
                            sucesso,
                            erro: erro ?? null,
            });
        } catch (logErr) {
                    console.error("Falha ao registrar log de WhatsApp", logErr);
        }
}

// Envia uma mensagem de texto livre via WhatsApp.
// Observação: fora da janela de 24h de atendimento, o WhatsApp só permite
// o envio de "message templates" pré-aprovados, não texto livre.
export async function enviarMensagemTexto(numeroDestino: string, texto: string) {
        const { accessToken, phoneNumberId } = getConfig();

    const response = await fetch(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
                        method: "POST",
                        headers: {
                                            Authorization: `Bearer ${accessToken}`,
                                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                                            messaging_product: "whatsapp",
                                            to: numeroDestino,
                                            type: "text",
                                            text: { body: texto },
                        }),
        }
            );

    const data = await response.json();

    if (!response.ok) {
                await registrarLog(numeroDestino, "texto_livre", false, JSON.stringify(data));
                throw new Error(`Erro ao enviar mensagem via WhatsApp: ${JSON.stringify(data)}`);
    }

    await registrarLog(numeroDestino, "texto_livre", true);
        return data;
}

// Envia um código de acesso (OTP) via template pré-aprovado no WhatsApp Manager.
// IMPORTANTE: o template "codigo_acesso" precisa ser criado e aprovado
// no WhatsApp Manager antes de usar esta função (Step 3 / Message templates).
export async function enviarCodigoAcesso(numeroDestino: string, codigo: string) {
        const { accessToken, phoneNumberId } = getConfig();

    const response = await fetch(
                `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
        {
                        method: "POST",
                        headers: {
                                            Authorization: `Bearer ${accessToken}`,
                                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                                            messaging_product: "whatsapp",
                                            to: numeroDestino,
                                            type: "template",
                                            template: {
                                                                    name: "codigo_acesso",
                                                                    language: { code: "pt_BR" },
                                                                    components: [
                                                                        {
                                                                                                        type: "body",
                                                                                                        parameters: [{ type: "text", text: codigo }],
                                                                        },
                                                                                            ],
                                            },
                        }),
        }
            );

    const data = await response.json();

    if (!response.ok) {
                await registrarLog(numeroDestino, "codigo_acesso", false, JSON.stringify(data));
                throw new Error(`Erro ao enviar código via WhatsApp: ${JSON.stringify(data)}`);
    }

    await registrarLog(numeroDestino, "codigo_acesso", true);
        return data;
}
