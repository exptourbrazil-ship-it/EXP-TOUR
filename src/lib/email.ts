// Funcoes auxiliares para envio de e-mails via Resend (codigo de acesso da Area do Cliente).
// Documentacao: https://resend.com/docs/api-reference/emails/send-email
import { createClient } from "@supabase/supabase-js";

const RESEND_API_URL = "https://api.resend.com/emails";
const BRAND_GREEN = "#042f1b";
const BRAND_GOLD = "#c9a35e";

// Logo dos e-mails.
//
// Historico do bug: o cabecalho apontava para o .svg hospedado no WordPress e o
// logo nao aparecia para ninguem. Gmail, Outlook, Yahoo e a maioria dos webmails
// ignoram <img src="*.svg">. So o Apple Mail renderiza SVG, o que mascarava o
// problema em teste. Logo de e-mail precisa ser PNG (ou JPG).
//
// Regra aqui: so emitimos <img> quando conseguimos montar uma URL (via
// EMAIL_LOGO_URL ou NEXT_PUBLIC_APP_URL). Sem nenhuma das duas — ambiente sem
// as envs — renderizamos um wordmark em texto em vez de arriscar um icone de
// imagem quebrada. Em producao o caminho normal e o <img>.
//
// O PNG vive em public/email/logo-exp-tour.png e e servido pelo proprio app.
// Servir daqui (e nao do WordPress) tira a dependencia de um dominio externo
// que pode cair ou ativar hotlink protection, e a URL acompanha o deploy.
//
// EMAIL_LOGO_URL sobrescreve, se algum dia o arquivo for para um CDN.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
const LOGO_URL =
  process.env.EMAIL_LOGO_URL || (APP_URL ? `${APP_URL}/email/logo-exp-tour.png` : "");

function cabecalhoLogo(): string {
  const conteudo = LOGO_URL
    ? `<img src="${LOGO_URL}" alt="EXP TOUR" width="150" style="display:block;margin:0 auto;border:0;color:${BRAND_GOLD};font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:3px;text-align:center;" />`
    : `<div style="color:${BRAND_GOLD};font-family:Georgia,'Times New Roman',serif;">
<div style="font-size:24px;letter-spacing:6px;line-height:1.2;">EXP TOUR</div>
<div style="font-size:10px;letter-spacing:4px;padding-top:4px;">TRAVEL EXPERIENCE</div>
</div>`;
  return `<tr><td style="text-align:center;padding-bottom:24px;">
${conteudo}
</td></tr>`;
}

function getConfig() {
  const apiKey = process.env.RESEND_API_KEY as string;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Área do Cliente EXP Tour <noreply@exp-tour.com>";

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
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";

return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bellefair&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:'Bellefair',Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background-color:${BRAND_GREEN};">
${cabecalhoLogo()}
<tr>
<td style="background-color:#F5EAD9;border-radius:8px;padding:32px;text-align:center;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:16px;margin:0 0 24px;">Use o código abaixo para acessar a sua Área do Cliente:</p>
<div style="background-color:${BRAND_GREEN};color:#c9a35e;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;border-radius:6px;display:inline-block;">${codigo}</div>
<p style="color:${BRAND_GREEN};font-size:14px;margin:24px 0 0;">Este código expira em 10 minutos. Se você não solicitou este acesso, ignore este e-mail.</p>
</td>
</tr>
<tr>
<td style="text-align:center;padding-top:24px;">
<span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span>
</td>
</tr>
</table>
</div>
</body>
</html>
`;
}

type DadosLembrete = {
  descricao: string;
  valor: string; // ja formatado, ex: "R$ 1.234,56"
  vencimento: string; // ja formatado, ex: "05/08/2026"
  vencida: boolean; // true quando a parcela ja passou do vencimento
  pixCode?: string | null; // codigo Pix copia-e-cola (payment_link), se houver
  portalUrl?: string | null; // link para a Area do Cliente, se configurado
};

function templateLembreteCobranca(nome: string, d: DadosLembrete) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const chamada = d.vencida
    ? "Identificamos uma parcela em atraso na sua Área do Cliente:"
    : "Este é um lembrete de uma parcela que está chegando:";

  const pixBloco = d.pixCode
    ? `<tr><td style="padding-top:16px;">
         <p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 8px;">Pix copia e cola:</p>
         <div style="background-color:#ffffff;border:1px solid ${BRAND_GREEN};border-radius:6px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:${BRAND_GREEN};">${d.pixCode}</div>
       </td></tr>`
    : "";

  const portalBloco = d.portalUrl
    ? `<tr><td style="text-align:center;padding-top:24px;">
         <a href="${d.portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;font-size:16px;padding:12px 28px;border-radius:6px;display:inline-block;">Abrir minha Área do Cliente</a>
       </td></tr>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bellefair&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:'Bellefair',Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background-color:${BRAND_GREEN};">
${cabecalhoLogo()}
<tr>
<td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:16px;margin:0 0 16px;">${chamada}</p>
<table role="presentation" width="100%" style="border-collapse:collapse;">
<tr><td style="color:${BRAND_GREEN};font-size:15px;padding:4px 0;">${d.descricao}</td></tr>
<tr><td style="color:${BRAND_GREEN};font-size:22px;font-weight:bold;padding:4px 0;">${d.valor}</td></tr>
<tr><td style="color:${BRAND_GREEN};font-size:14px;padding:4px 0;">Vencimento: ${d.vencimento}</td></tr>
<tr><td style="color:${BRAND_GREEN};font-size:13px;padding:10px 0 0;">Precisa de outra data? Você pode alterar o vencimento na sua Área do Cliente, sem juros ou taxa.</td></tr>
${pixBloco}
${portalBloco}
</table>
</td>
</tr>
<tr>
<td style="text-align:center;padding-top:24px;">
<span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span>
</td>
</tr>
</table>
</div>
</body>
</html>
`;
}

// Envia um lembrete de cobranca (regua) por e-mail via Resend. Lanca erro em
// caso de falha, para o chamador (cron) decidir se registra/repete.
export async function enviarLembreteCobrancaEmail(destinatario: string, nome: string, dados: DadosLembrete) {
  const { apiKey, fromEmail } = getConfig();
  const assunto = dados.vencida
    ? "Parcela em atraso - EXP Tour"
    : "Lembrete de pagamento - EXP Tour";

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
        subject: assunto,
        html: templateLembreteCobranca(nome, dados),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "lembrete_cobranca", false, mensagem);
    throw new Error(mensagem);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "lembrete_cobranca", false, mensagem);
    throw new Error(mensagem);
  }

  await registrarLog(destinatario, "lembrete_cobranca", true);
  return data;
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
        subject: "Seu código de acesso - EXP Tour",
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

// ---- Portal do Fornecedor: codigo de login (bilingue EN/PT) ----------------

function templateCodigoFornecedor(nome: string, codigo: string, idioma: string) {
  const en = idioma !== "pt";
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = en
    ? primeiroNome ? `Hello, ${primeiroNome}!` : "Hello!"
    : primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const instrucao = en
    ? "Use the code below to access your Partner Portal:"
    : "Use o código abaixo para acessar o seu Portal do Parceiro:";
  const expira = en
    ? "This code expires in 10 minutes. If you didn't request it, ignore this e-mail."
    : "Este código expira em 10 minutos. Se você não solicitou, ignore este e-mail.";
  const rodape = en ? "EXP Tour — Partner Portal" : "EXP Tour — Portal do Parceiro";

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bellefair&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:'Bellefair',Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background-color:${BRAND_GREEN};">
<tr>
<td style="text-align:center;padding-bottom:24px;">
<img src="${LOGO_URL}" alt="EXP TOUR" width="150" style="display:block;margin:0 auto;border:0;" />
</td>
</tr>
<tr>
<td style="background-color:#F5EAD9;border-radius:8px;padding:32px;text-align:center;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:16px;margin:0 0 24px;">${instrucao}</p>
<div style="background-color:${BRAND_GREEN};color:#c9a35e;font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;border-radius:6px;display:inline-block;">${codigo}</div>
<p style="color:${BRAND_GREEN};font-size:14px;margin:24px 0 0;">${expira}</p>
</td>
</tr>
<tr>
<td style="text-align:center;padding-top:24px;">
<span style="color:#F5EAD9;font-size:13px;">${rodape}</span>
</td>
</tr>
</table>
</div>
</body>
</html>
`;
}

// Envia o codigo de login do fornecedor por e-mail via Resend, no idioma do
// usuario (EN padrao). Lanca erro em caso de falha (quem chamar decide como
// tratar). Registra a tentativa em email_logs.
export async function enviarCodigoFornecedorEmail(
  destinatario: string,
  nome: string,
  codigo: string,
  idioma: string = "en"
) {
  const { apiKey, fromEmail } = getConfig();
  const en = idioma !== "pt";
  const subject = en ? "Your access code - EXP Tour" : "Seu código de acesso - EXP Tour";

  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject,
        html: templateCodigoFornecedor(nome, codigo, idioma),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "codigo_fornecedor", false, mensagem);
    throw new Error(mensagem);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "codigo_fornecedor", false, mensagem);
    throw new Error(mensagem);
  }

  await registrarLog(destinatario, "codigo_fornecedor", true);
  return data;
}

type DadosAceite = {
  versao: string;
  dataFormatada: string;        // ex.: "01/07/2026 14:30"
  arrependimentoAte: string;    // ex.: "08/07/2026"
  conteudo?: string | null;     // texto completo do termo (cópia)
};

function templateConfirmacaoAceite(nome: string, d: DadosAceite) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const textoTermo = (d.conteudo || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Confirmamos o seu aceite do <strong>Termo de Adesão</strong> (versão ${d.versao}) em <strong>${d.dataFormatada}</strong>.</p>
<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 12px;"><strong>Direito de arrependimento:</strong> você pode desistir até <strong>${d.arrependimentoAte}</strong> (7 dias), pela própria Área do Cliente ou entrando em contato conosco.</p>
${textoTermo ? `<hr style="border:none;border-top:1px solid #d8c7a8;margin:20px 0;" /><p style="color:${BRAND_GREEN};font-size:13px;margin:0 0 8px;"><strong>Conteúdo aceito:</strong></p><div style="color:${BRAND_GREEN};font-size:12px;white-space:pre-wrap;line-height:1.5;">${textoTermo}</div>` : ""}
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Envia a confirmacao/copia do aceite do Termo de Adesao. Best-effort: quem
// chama pode ignorar o erro (o aceite ja esta registrado no banco).
export async function enviarConfirmacaoAceiteEmail(destinatario: string, nome: string, dados: DadosAceite) {
  const { apiKey, fromEmail } = getConfig();
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Confirmação do aceite do Termo de Adesão - EXP Tour",
        html: templateConfirmacaoAceite(nome, dados),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "aceite_termo", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "aceite_termo", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "aceite_termo", true);
  return data;
}

type DadosRecibo = {
  dataFormatada: string; // data/hora da liquidação
  descricao: string; // ex.: "Parcela 2" ou "Entrada"
  moeda: string; // moeda do programa (ex.: CAD)
  ptax: number; // PTAX de venda aplicada
  subtotal: number; // valor convertido em R$
  taxaPercentual: number; // ex.: 0.066
  taxaIntermediacao: number; // em R$
  iofPercentual: number; // ex.: 0.035
  iof: number; // em R$
  totalBRL: number; // total pago em R$
  amortizacaoMoeda: number; // amortizado na moeda
  saldoRestanteMoeda: number | null; // saldo devedor remanescente na moeda
};

function brl(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function moe(n: number, moeda: string): string {
  return `${moeda} ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number): string {
  return (n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + "%";
}

function templateRecibo(nome: string, d: DadosRecibo) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const linha = (rot: string, val: string) =>
    `<tr><td style="padding:6px 0;color:${BRAND_GREEN};font-size:13px;">${rot}</td><td style="padding:6px 0;color:${BRAND_GREEN};font-size:13px;text-align:right;font-weight:bold;">${val}</td></tr>`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:28px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 4px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 16px;">Recibo do seu pagamento — <strong>${d.descricao}</strong> — em ${d.dataFormatada}.</p>
<table role="presentation" width="100%" style="border-collapse:collapse;">
${linha("PTAX de venda (BCB) aplicada", "R$ " + d.ptax.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 }))}
${linha("Valor convertido", brl(d.subtotal))}
${linha("Taxa de Intermediação e Câmbio (" + pct(d.taxaPercentual) + ")", brl(d.taxaIntermediacao))}
${linha("IOF-câmbio (" + pct(d.iofPercentual) + ")", brl(d.iof))}
<tr><td colspan="2" style="border-top:1px solid #d8c7a8;padding-top:8px;"></td></tr>
${linha("<strong>Total pago</strong>", "<strong>" + brl(d.totalBRL) + "</strong>")}
${linha("Valor amortizado", moe(d.amortizacaoMoeda, d.moeda))}
${d.saldoRestanteMoeda != null ? linha("Saldo devedor remanescente", moe(d.saldoRestanteMoeda, d.moeda)) : ""}
</table>
<p style="color:${BRAND_GREEN};font-size:11px;margin:16px 0 0;">Nenhuma tarifa bancária ou despesa de remessa é cobrada separadamente &mdash; estão compreendidas na Taxa de Intermediação e Câmbio.</p>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Envia o recibo itemizado de um pagamento (Clausula 6.5.2). Best-effort.
export async function enviarReciboPagamentoEmail(destinatario: string, nome: string, dados: DadosRecibo) {
  const { apiKey, fromEmail } = getConfig();
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Recibo do seu pagamento - EXP Tour",
        html: templateRecibo(nome, dados),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "recibo_pagamento", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "recibo_pagamento", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "recibo_pagamento", true);
  return data;
}

type DadosQuitacao = {
  saldo: string; // saldo devedor ja formatado, ex.: "CAD 3.200,00"
  dataLimite: string; // data-limite de quitacao ja formatada, ex.: "01/09/2026"
  diasRestantes: number; // 30 / 15 / 5
  portalUrl?: string | null;
};

function templateLembreteQuitacao(nome: string, d: DadosQuitacao) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const botao = d.portalUrl
    ? `<tr><td style="padding-top:20px;"><a href="${d.portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">Acessar a Área do Cliente</a></td></tr>`
    : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Faltam <strong>${d.diasRestantes} dias</strong> para a data-limite de quitação do seu programa (<strong>${d.dataLimite}</strong>).</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 4px;">Saldo devedor atual:</p>
<p style="color:${BRAND_GREEN};font-size:22px;font-weight:bold;margin:0 0 4px;">${d.saldo}</p>
<p style="color:${BRAND_GREEN};font-size:13px;margin:12px 0 0;">Você pode pagar quando e quanto quiser até essa data. O valor em Reais é definido pela cotação do dia no momento de cada pagamento.</p>
<table role="presentation">${botao}</table>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Lembrete de quitacao (Clausula 7.12): D-30/D-15/D-5 antes da data-limite.
// Best-effort. Lanca em caso de falha para o chamador contabilizar.
export async function enviarLembreteQuitacaoEmail(destinatario: string, nome: string, dados: DadosQuitacao) {
  const { apiKey, fromEmail } = getConfig();
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: `Faltam ${dados.diasRestantes} dias para a quitação - EXP Tour`,
        html: templateLembreteQuitacao(nome, dados),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "lembrete_quitacao", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "lembrete_quitacao", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "lembrete_quitacao", true);
  return data;
}

type DadosAvisoDocumento = {
  tipoDocumento: string; // rotulo legivel, ex.: "Passaporte"
  aprovado: boolean; // true = aprovado; false = rejeitado
  motivo?: string | null; // motivo da rejeicao (obrigatorio quando rejeitado)
  portalUrl?: string | null; // link para a Area do Cliente, se configurado
};

function templateAvisoDocumento(nome: string, d: DadosAvisoDocumento) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const motivoTxt = (d.motivo || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const corpo = d.aprovado
    ? `<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Seu documento <strong>${d.tipoDocumento}</strong> foi <strong>aprovado</strong>. Nada mais é necessário para este item.</p>`
    : `<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Seu documento <strong>${d.tipoDocumento}</strong> foi <strong>recusado</strong> e precisa ser reenviado.</p>
${motivoTxt ? `<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 12px;"><strong>Motivo:</strong> ${motivoTxt}</p>` : ""}
<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 4px;">Reenvie o documento corrigido pela sua Área do Cliente.</p>`;
  const botao = d.portalUrl
    ? `<tr><td style="padding-top:20px;"><a href="${d.portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">Abrir minha Área do Cliente</a></td></tr>`
    : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 12px;">${saudacao}</p>
${corpo}
<table role="presentation">${botao}</table>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Avisa o titular que um documento foi aprovado ou rejeitado (analise inline no
// Caso 360). Best-effort: quem chama pode ignorar o erro (o status ja esta
// gravado no banco). Lanca em caso de falha para o chamador contabilizar.
export async function enviarAvisoDocumentoEmail(
  destinatario: string,
  nome: string,
  dados: DadosAvisoDocumento
) {
  const { apiKey, fromEmail } = getConfig();
  const assunto = dados.aprovado
    ? "Documento aprovado - EXP Tour"
    : "Documento recusado - reenvio necessário - EXP Tour";
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: assunto,
        html: templateAvisoDocumento(nome, dados),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "aviso_documento", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "aviso_documento", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "aviso_documento", true);
  return data;
}

function templateVistoNegado(nome: string, portalUrl?: string | null) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}.` : "Olá.";
  const botao = portalUrl
    ? `<tr><td style="padding-top:20px;"><a href="${portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">Abrir minha Área do Cliente</a></td></tr>`
    : "";
  // Tom: informa e acolhe, mas a conversa (a emocao e a decisao) fica com o
  // consultor humano — principio 5 do doc 01. Por isso a mensagem e sobria e
  // deixa claro que uma pessoa vai entrar em contato.
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Recebemos a informação de que o seu pedido de visto foi <strong>negado</strong>. Sabemos que não era o resultado esperado — e queremos que saiba que isso, com frequência, tem solução.</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Existem caminhos possíveis, e vamos avaliar o melhor para o seu caso:</p>
<ul style="color:${BRAND_GREEN};font-size:14px;margin:0 0 12px;padding-left:20px;">
<li style="margin-bottom:6px;">Nova aplicação do visto, com os pontos revistos;</li>
<li style="margin-bottom:6px;">Troca de destino, aproveitando o que já foi pago;</li>
<li style="margin-bottom:6px;">Cancelamento, com o acerto conforme as regras.</li>
</ul>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 4px;"><strong>Enquanto isso, pausamos as cobranças do seu programa.</strong> Você não precisa fazer nada agora.</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:8px 0 0;">O seu consultor entrará em contato em breve para conversar sobre os próximos passos.</p>
<table role="presentation">${botao}</table>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Aviso ao titular de que o visto foi negado (processo E1, doc 01 §4). Informa
// e acolhe; a conversa fica com o consultor. Best-effort: quem chama pode
// ignorar o erro (a excecao e a tarefa ja estao registradas).
export async function enviarAvisoVistoNegadoEmail(
  destinatario: string,
  nome: string,
  portalUrl?: string | null
) {
  const { apiKey, fromEmail } = getConfig();
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Sobre o seu visto - EXP Tour",
        html: templateVistoNegado(nome, portalUrl),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "visto_negado", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "visto_negado", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "visto_negado", true);
  return data;
}

function templateCancelamentoEscola(nome: string, portalUrl?: string | null) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}.` : "Olá.";
  const botao = portalUrl
    ? `<tr><td style="padding-top:20px;"><a href="${portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">Abrir minha Área do Cliente</a></td></tr>`
    : "";
  // Comunicacao proativa (reputacao/velocidade — doc 01 §4, E6). Informa e
  // tranquiliza; a decisao (realocar x reembolsar) e a emocao ficam com o
  // consultor humano.
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Precisamos avisar que houve uma alteração da escola no seu programa, e ele não poderá seguir como estava. Queremos que saiba, antes de tudo, que <strong>você não fica no prejuízo</strong>.</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Vamos encontrar a melhor saída com você:</p>
<ul style="color:${BRAND_GREEN};font-size:14px;margin:0 0 12px;padding-left:20px;">
<li style="margin-bottom:6px;">Realocação para uma alternativa equivalente, sem custo adicional; ou</li>
<li style="margin-bottom:6px;">Reembolso integral, incluindo a entrada.</li>
</ul>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 4px;"><strong>Enquanto isso, pausamos as cobranças do seu programa.</strong> Você não precisa fazer nada agora.</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:8px 0 0;">O seu consultor entrará em contato em breve para resolver com você.</p>
<table role="presentation">${botao}</table>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Aviso ao titular de que a escola cancelou/alterou o programa (processo E6, doc
// 01 §4). Comunicacao proativa e tranquilizadora; a execucao (realocar/
// reembolsar) e conduzida pelo time. Best-effort.
export async function enviarAvisoCancelamentoEscolaEmail(
  destinatario: string,
  nome: string,
  portalUrl?: string | null
) {
  const { apiKey, fromEmail } = getConfig();
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Sobre o seu programa - EXP Tour",
        html: templateCancelamentoEscola(nome, portalUrl),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "cancelamento_escola", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "cancelamento_escola", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "cancelamento_escola", true);
  return data;
}

function templateForcaMaior(nome: string, portalUrl?: string | null) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}.` : "Olá.";
  const botao = portalUrl
    ? `<tr><td style="padding-top:20px;"><a href="${portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">Abrir minha Área do Cliente</a></td></tr>`
    : "";
  // Comunicacao padronizada em lote (doc 01 §4, E8). Informa e tranquiliza; a
  // escolha (adiar x cancelar) e a conversa ficam com o time.
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Surgiu uma situação de força maior que afeta o destino do seu programa. Estamos acompanhando de perto e agindo para proteger você e a sua viagem.</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 4px;"><strong>Enquanto isso, pausamos as cobranças do seu programa.</strong> Você não precisa fazer nada agora.</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:12px 0 12px;">Assim que o cenário estiver claro, vamos combinar com você o melhor caminho — <strong>adiar</strong> a viagem para uma nova data ou, se preferir, <strong>cancelar com as condições cabíveis</strong>.</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0;">A nossa equipe entrará em contato. Se tiver qualquer dúvida, é só responder a este e-mail.</p>
<table role="presentation">${botao}</table>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Comunicacao padronizada de forca maior coletiva (processo E8, doc 01 §4).
// Enviada EM LOTE aos titulares afetados. Best-effort por titular.
export async function enviarAvisoForcaMaiorEmail(
  destinatario: string,
  nome: string,
  portalUrl?: string | null
) {
  const { apiKey, fromEmail } = getConfig();
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Informação importante sobre o seu programa - EXP Tour",
        html: templateForcaMaior(nome, portalUrl),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "forca_maior", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "forca_maior", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "forca_maior", true);
  return data;
}

export type DadosCronograma = {
  tipo: "deferral" | "escopo"; // E2 (adiamento) | E3 (alteracao de escopo)
  moeda: string;
  novaDataInicio?: string | null; // E2: nova data de inicio do programa
  novoValorTotal?: number | null; // E3: novo valor do programa
  novaDataQuitacao?: string | null;
  parcelas: { numero: number; vencimento: string; valor: number }[];
  portalUrl?: string | null;
};

function fmtDataBR(iso?: string | null): string {
  if (!iso || iso.length < 10) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtValor(valor: number, moeda: string): string {
  const n = (Number(valor) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const cod = (moeda || "").toUpperCase();
  const prefixo = cod === "BRL" || cod === "" ? "R$" : cod;
  return `${prefixo} ${n}`;
}

function templateCronogramaAtualizado(nome: string, d: DadosCronograma) {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const motivo =
    d.tipo === "deferral"
      ? `Ajustamos o seu cronograma de pagamentos após o <strong>adiamento da data de início</strong>${
          d.novaDataInicio ? ` para <strong>${fmtDataBR(d.novaDataInicio)}</strong>` : ""
        }.`
      : `Ajustamos o seu cronograma de pagamentos após a <strong>alteração do seu programa</strong>${
          d.novoValorTotal != null
            ? ` (novo valor: <strong>${fmtValor(d.novoValorTotal, d.moeda)}</strong>)`
            : ""
        }.`;
  const linhas = (d.parcelas || [])
    .map(
      (p) =>
        `<tr><td style="padding:6px 0;color:${BRAND_GREEN};font-size:14px;border-bottom:1px solid #e4d8c2;">Parcela ${p.numero} &mdash; ${fmtDataBR(
          p.vencimento
        )}</td><td style="padding:6px 0;color:${BRAND_GREEN};font-size:14px;text-align:right;border-bottom:1px solid #e4d8c2;">${fmtValor(
          p.valor,
          d.moeda
        )}</td></tr>`
    )
    .join("");
  const tabela = linhas
    ? `<table role="presentation" width="100%" style="margin:8px 0 12px;border-collapse:collapse;">${linhas}</table>`
    : `<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 12px;">Não há parcelas em aberto no novo cronograma.</p>`;
  const quitacao = d.novaDataQuitacao
    ? `<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 12px;">Data-limite de quitação: <strong>${fmtDataBR(
        d.novaDataQuitacao
      )}</strong>.</p>`
    : "";
  const botao = d.portalUrl
    ? `<tr><td style="padding-top:20px;"><a href="${d.portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">Ver na minha Área do Cliente</a></td></tr>`
    : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">${motivo}</p>
<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 4px;"><strong>Novo cronograma:</strong></p>
${tabela}
${quitacao}
<p style="color:${BRAND_GREEN};font-size:13px;margin:8px 0 0;">As parcelas já pagas não foram alteradas. Em caso de dúvida, fale com o seu consultor.</p>
<table role="presentation">${botao}</table>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
}

// Avisa o titular que o cronograma de pagamentos foi reescrito apos a execucao
// em cascata de uma alteracao (E2 adiamento / E3 escopo). Transparencia do doc
// 04: "notifica o cliente com o resumo do novo cronograma". Best-effort: quem
// chama DEVE ignorar o erro (a alteracao ja foi aplicada e commitada).
export async function enviarAvisoCronogramaAtualizadoEmail(
  destinatario: string,
  nome: string,
  dados: DadosCronograma
) {
  const { apiKey, fromEmail } = getConfig();
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Seu cronograma de pagamentos foi atualizado - EXP Tour",
        html: templateCronogramaAtualizado(nome, dados),
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "cronograma_atualizado", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "cronograma_atualizado", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "cronograma_atualizado", true);
  return data;
}

// Recibo de DEVOLUCAO (motor de acerto, Fatia D): confirma ao cliente que o
// reembolso do acerto foi processado. Best-effort. `meio` = 'mp' (estorno no
// cartao/Pix) | 'manual' (devolucao por fora).
export async function enviarReciboDevolucaoEmail(
  destinatario: string,
  nome: string,
  dados: { valorBRL: number; meio: "mp" | "manual"; portalUrl?: string | null }
) {
  const { apiKey, fromEmail } = getConfig();
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const valor = `R$ ${(Number(dados.valorBRL) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const comoTxt =
    dados.meio === "mp"
      ? "O estorno foi enviado ao meio de pagamento original; o prazo de compensação depende do seu banco/emissor."
      : "A devolução foi processada pela nossa equipe; em caso de dúvida sobre o comprovante, fale com o seu consultor.";
  const botao = dados.portalUrl
    ? `<tr><td style="padding-top:20px;"><a href="${dados.portalUrl}" style="background-color:${BRAND_GREEN};color:#c9a35e;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">Abrir minha Área do Cliente</a></td></tr>`
    : "";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;">
<div style="background-color:${BRAND_GREEN};padding:32px 0;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;">
${cabecalhoLogo()}
<tr><td style="background-color:#F5EAD9;border-radius:8px;padding:32px;">
<p style="color:${BRAND_GREEN};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${BRAND_GREEN};font-size:15px;margin:0 0 12px;">Confirmamos a devolução do seu acerto no valor de <strong>${valor}</strong>.</p>
<p style="color:${BRAND_GREEN};font-size:14px;margin:0 0 4px;">${comoTxt}</p>
<table role="presentation">${botao}</table>
</td></tr>
<tr><td style="text-align:center;padding-top:24px;"><span style="color:#F5EAD9;font-size:13px;">EXP Tour &mdash; Área do Cliente</span></td></tr>
</table>
</div>
</body>
</html>`;
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [destinatario],
        subject: "Confirmação de devolução - EXP Tour",
        html,
      }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "recibo_devolucao", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "recibo_devolucao", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "recibo_devolucao", true);
  return data;
}

// Aviso interno para a equipe (ex.: cliente exerceu arrependimento). Envia para
// ADMIN_EMAIL. Best-effort: quem chama pode ignorar o erro.
export async function enviarAvisoInternoEmail(assunto: string, texto: string) {
  const { apiKey, fromEmail } = getConfig();
  const destinatario = process.env.ADMIN_EMAIL || "rodrigo@exp-tour.com";
  const html = `<div style="font-family:Georgia,serif;color:${BRAND_GREEN};font-size:14px;white-space:pre-wrap;">${texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</div>`;
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [destinatario], subject: assunto, html }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, "aviso_interno", false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, "aviso_interno", false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, "aviso_interno", true);
  return data;
}
