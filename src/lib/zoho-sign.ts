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
