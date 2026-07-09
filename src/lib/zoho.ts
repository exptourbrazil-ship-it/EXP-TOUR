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
// ambiente. O Self Client do Zoho nao usa fluxo de redirect, entao o refresh
// token e valido por tempo indeterminado ate ser revogado manualmente.
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

  const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token?${params.toString()}`, {
    method: "POST",
  });
  const data = await res.json();

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
