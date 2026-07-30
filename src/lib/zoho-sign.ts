// Cliente da API do Zoho Sign. Usa o MESMO OAuth do Zoho CRM (obterAccessTokenZoho)
// mas outro dominio de API. Codigo independente de credenciais — so executa de
// fato quando as envs do Zoho estao configuradas (getAccessToken lanca se nao).
//
// NB: endpoints conforme a API v1 do Zoho Sign; confirmar contra a documentacao
// e o datacenter da conta. O dominio e configuravel por ZOHO_SIGN_API_DOMAIN
// (padrao sign.zoho.com; contas .eu/.in usam outro dominio).
import { obterAccessTokenZoho } from "@/lib/zoho";

const ZOHO_SIGN_API_DOMAIN = process.env.ZOHO_SIGN_API_DOMAIN || "https://sign.zoho.com";

// Busca os dados de um request (envelope) de assinatura, para conferir status
// e metadados. Retorna o JSON bruto do Zoho Sign.
export async function getRequestSign(requestId: string): Promise<any> {
  const token = await obterAccessTokenZoho();
  const res = await fetch(`${ZOHO_SIGN_API_DOMAIN}/api/v1/requests/${requestId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Falha ao consultar request no Zoho Sign (status ${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

// Cria (e envia) um request de assinatura a partir de um TEMPLATE do Zoho Sign.
// `fieldTextData` mapeia nome-do-campo-no-template -> valor; `actions` liga cada
// papel do template (action_id) a um destinatario (nome/e-mail). Com
// quickSend=true, o Zoho envia o pedido imediatamente. Retorna o request_id.
//
// NB: shape conforme a API de templates do Zoho Sign; confirmar contra o
// template real (nomes dos campos e action_ids saem da definicao do template).
export async function criarEnvelopeDeTemplate(opts: {
  templateId: string;
  fieldTextData: Record<string, string>;
  actions: Array<{ action_id: string; recipient_name: string; recipient_email: string; action_type?: string }>;
  quickSend?: boolean;
}): Promise<{ requestId: string; raw: any }> {
  const token = await obterAccessTokenZoho();

  const data = {
    templates: {
      field_data: {
        field_text_data: opts.fieldTextData,
        field_boolean_data: {},
        field_date_data: {},
      },
      actions: opts.actions.map((a) => ({
        action_id: a.action_id,
        action_type: a.action_type || "SIGN",
        recipient_name: a.recipient_name,
        recipient_email: a.recipient_email,
      })),
    },
  };

  const form = new URLSearchParams();
  form.set("data", JSON.stringify(data));
  form.set("is_quicksend", String(opts.quickSend ?? true));

  const res = await fetch(`${ZOHO_SIGN_API_DOMAIN}/api/v1/templates/${opts.templateId}/createdocument`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok || raw?.status !== "success") {
    throw new Error(`Falha ao criar envelope no Zoho Sign: ${JSON.stringify(raw)}`);
  }
  const requestId = raw?.requests?.request_id;
  if (!requestId) throw new Error("Zoho Sign nao retornou request_id.");
  return { requestId: String(requestId), raw };
}

// Baixa o PDF final assinado de um request concluido.
export async function baixarPdfAssinado(
  requestId: string
): Promise<{ buffer: ArrayBuffer; contentType: string | null }> {
  const token = await obterAccessTokenZoho();
  const res = await fetch(`${ZOHO_SIGN_API_DOMAIN}/api/v1/requests/${requestId}/pdf`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar o PDF assinado do Zoho Sign (status ${res.status})`);
  }
  const buffer = await res.arrayBuffer();
  return { buffer, contentType: res.headers.get("content-type") };
}
