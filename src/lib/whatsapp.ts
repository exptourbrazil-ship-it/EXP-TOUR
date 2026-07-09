// Funções auxiliares para envio de mensagens via WhatsApp Cloud API (Meta).
// Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api

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
        throw new Error(`Erro ao enviar WhatsApp: ${JSON.stringify(data)}`);
  }

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
        throw new Error(`Erro ao enviar código via WhatsApp: ${JSON.stringify(data)}`);
  }

  return data;
}
