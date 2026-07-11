const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";
const ZOHO_API_DOMAIN = process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.com";

// Le o refresh token da variavel dedicada ZOHO_REFRESH_TOKEN, ou, se ela nao
// existir, extrai do JSON bruto salvo em ZOHO_TOKEN_RESPONSE (resposta
// original da troca do grant code, que contem access_token e refresh_token).
function getRefreshToken(): string | undefined {
  if (process.env.ZOHO_REFRESH_TOKEN) return process.env.ZOHO_REFRESH_TOKEN;

  const raw = process.env.ZOHO_TOKEN_RESPONSE;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw);
    return parsed.refresh_token as string | undefined;
  } catch {
    return undefined;
  }
}

// Obtem um access token novo a partir do refresh token salvo nas variaveis de
// ambiente. Os parametros vao no corpo (application/x-www-form-urlencoded),
// conforme especificacao OAuth 2.0.
async function getAccessToken(): Promise<string> {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = getRefreshToken();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Credenciais do Zoho ausentes (ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET/ZOHO_REFRESH_TOKEN ou ZOHO_TOKEN_RESPONSE)");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  const contentType = res.headers.get("content-type") || "";
  const bodyText = await res.text();

  let data: any;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error("Resposta do Zoho nao e JSON valido (status " + res.status + ", content-type " + contentType + ")");
  }

  if (!data.access_token) {
    throw new Error("Falha ao renovar o access token do Zoho: " + JSON.stringify(data));
  }

  return data.access_token as string;
}

// Busca um registro especifico de um modulo do Zoho CRM (ex: Contacts, Products).
export async function getZohoRecord(zohoModule: string, id: string): Promise<any> {
  const accessToken = await getAccessToken();

  const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v2/${zohoModule}/${id}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  const data = await res.json();

  if (!res.ok || !data?.data?.[0]) {
    throw new Error(`Falha ao buscar ${zohoModule}/${id} no Zoho CRM: ` + JSON.stringify(data));
  }

  return data.data[0];
}
export async function getZohoAttachments(zohoModule: string, recordId: string): Promise<any[]> { const accessToken = await getAccessToken(); const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v2/${zohoModule}/${recordId}/Attachments`, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }); if (res.status === 204) return []; const data = await res.json(); if (!res.ok) throw new Error(`Falha ao buscar anexos no Zoho CRM: ${JSON.stringify(data)}`); return data?.data || []; }
export async function getZohoAttachmentContent(zohoModule: string, recordId: string, attachmentId: string): Promise<{ buffer: ArrayBuffer; contentType: string | null }> { const accessToken = await getAccessToken(); const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v2/${zohoModule}/${recordId}/Attachments/${attachmentId}`, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }); if (!res.ok) throw new Error(`Falha ao baixar anexo do Zoho CRM (status ${res.status})`); const buffer = await res.arrayBuffer(); return { buffer, contentType: res.headers.get("content-type") }; }


// Envia um novo anexo para um registro do Zoho CRM (usado como backup dos
// documentos enviados pelo titular na area do cliente).
export async function uploadZohoAttachment(zohoModule: string, recordId: string, fileName: string, fileBuffer: ArrayBuffer, mimeType?: string): Promise<any> {
  const accessToken = await getAccessToken();

const form = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType || "application/octet-stream" });
  form.append("file", blob, fileName);

const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v2/${zohoModule}/${recordId}/Attachments`, {
  method: "POST",
  headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  body: form,
});

const data = await res.json();
  if (!res.ok) {
    throw new Error(`Falha ao enviar anexo para o Zoho CRM: ${JSON.stringify(data)}`);
  }

return data;
}
