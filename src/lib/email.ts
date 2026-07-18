// Funcoes auxiliares para envio de e-mails via Resend (codigo de acesso da Area do Cliente).
// Documentacao: https://resend.com/docs/api-reference/emails/send-email
import { createClient } from "@supabase/supabase-js";

const RESEND_API_URL = "https://api.resend.com/emails";
const LOGO_URL = "https://exp-tour.com/wp-content/uploads/2026/04/EXP-Tour-Original-Logo.svg";

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY as string;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Area do Cliente EXP Tour <noreply@exp-tour.com>";

if (!apiKey) {
  throw new Error("RESEND_API_KEY nao configurado");
}

return { apiKey, fromEmail };
}

// Grava o resultado de uma tentativa de envio na tabela email_logs,
// para permitir auditoria posterior (mesmo quando o chamador ignora o erro).
async function registrarLog(destinatario: string, tipoMensagem: string, sucesso: boolean, erro?: string) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  await supabase.from("email_logs").insert({
    destinatario,
    tipo_mensagem: tipoMensagem,
    sucesso,
    erro: erro || null,
  });
  } catch (err) {
    console.error("Falha ao registrar log de email", err);
  }
}

function templateCodigoAcesso(nome: string, codigo: string) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Ola, ${primeiroNome}!` : "Ola!";

return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;">
<div style="background-color:#0f3d2e;padding:32px 0;font-family:'Roboto',Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background-color:#0f3d2e;">
<tr>
<td style="text-align:center;padding-bottom:24px;">
<img src="${LOGO_URL}" alt="EXP TOUR" width="88" style="display:block;margin:0 auto 8px;border:0;" />
<span style="color:#c9a35e;font-size:14px;letter-spacing:2px;font-weight:bold;">EXP TOUR</span>
</td>
</tr>
<tr>
<td style="background-color:#F5EAD9;border-radius:8px;padding:32px;text-align:center;">
<p style="color:#0f3d2e;font-size:16px;margin:0 0 16px;">${saudacao}</p>
<p style="color:#0f3d2e;font-size:15px;margin:0 0 24px;">Use o codigo abaixo para acessar a sua Area do Cliente:</p>
<div style="background-color:#0f3d2e;color:#c9a35e;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;border-radius:6px;display:inline-block;">${codigo}</div>
<p style="color:#0f3d2e;font-size:13px;margin:24px 0 0;">Este codigo expira em 10 minutos. Se voce nao solicitou este acesso, ignore este e-mail.</p>
</td>
</tr>
<tr>
<td style="text-align:center;padding-top:24px;">
<span style="color:#F5EAD9;font-size:12px;">EXP Tour - Area do Cliente</span>
</td>
</tr>
</table>
</div>
</body>
</html>
`;
}

// Envia o codigo de acesso por e-mail via Resend. Lanca erro em caso de falha
// (quem chamar deve decidir se quer expor esse erro ao usuario final ou nao).
export async function enviarCodigoAcessoEmail(destinatario: string, nome: string, codigo: string) {
  const { apiKey, fromEmail } = getConfig();

let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Seu codigo de acesso - EXP Tour",
        html: templateCodigoAcesso(nome, codigo),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "codigo_acesso", false, mensagem);
    throw new Error(mensagem);
  }

const data = await response.json().catch(() => null);

if (!response.ok) {
  const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
  await registrarLog(destinatario, "codigo_acesso", false, mensagem);
  throw new Error(mensagem);
}

await registrarLog(destinatario, "codigo_acesso", true);
  return data;
}
