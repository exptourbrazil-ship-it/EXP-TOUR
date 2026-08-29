// Funcoes auxiliares para envio de e-mails via Resend (Area do Cliente).
// Documentacao: https://resend.com/docs/api-reference/emails/send-email
//
// MARCA POR TENANT: os e-mails sao tematizados pela marca do tenant (EXP Tour /
// Forio). A marca vem do tenant do titular (titulares.tenant_id); os chamadores
// passam o slug via `tenantSlug`. Sem slug -> EMAIL_DEFAULT_TENANT_SLUG (default
// 'exp-tour'). O tema (cores/fonte/logo/remetente) fica em src/lib/tenant-brand
// (EmailTheme). Estrutura comum: moldura escura + cartao claro; so a paleta muda.
import { createClient } from "@supabase/supabase-js";
import { getTenantBrand, type EmailTheme } from "@/lib/tenant-brand";

const RESEND_API_URL = "https://api.resend.com/emails";

// Logo dos e-mails (por tenant, em public/email/<basename>).
//
// Historico do bug: o cabecalho apontava para o .svg hospedado no WordPress e o
// logo nao aparecia. Gmail, Outlook, Yahoo e a maioria dos webmails ignoram
// <img src="*.svg">. So o Apple Mail renderiza SVG, o que mascarava o problema.
// Logo de e-mail precisa ser PNG (ou JPG).
//
// Regra: so emitimos <img> quando conseguimos montar uma URL (via EMAIL_LOGO_URL,
// para EXP Tour, ou NEXT_PUBLIC_APP_URL). Sem nenhuma — ambiente sem as envs —
// renderizamos um wordmark em texto, em vez de arriscar um icone quebrado. O PNG
// vive em public/email/ e e servido pelo proprio app (acompanha o deploy).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
const EMAIL_DEFAULT_SLUG = (process.env.EMAIL_DEFAULT_TENANT_SLUG || "exp-tour").trim();
const FROM_PADRAO = "Área do Cliente EXP Tour <noreply@exp-tour.com>";

/** Tema de e-mail do tenant (slug). Slug ausente/desconhecido -> padrao. */
function resolveTheme(tenantSlug?: string | null): EmailTheme {
  return getTenantBrand(tenantSlug ?? EMAIL_DEFAULT_SLUG).email;
}

function getApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY as string;
  if (!apiKey) throw new Error("RESEND_API_KEY nao configurado");
  return apiKey;
}

// Remetente por tenant: env especifica do tenant -> RESEND_FROM_EMAIL global ->
// fallback fixo. Assim a Forio so usa o proprio dominio quando ele estiver
// verificado no Resend (RESEND_FROM_EMAIL_FORIO); ate la, envia do remetente
// padrao (dominio ja verificado), sem risco de bounce por dominio nao verificado.
function fromFor(t: EmailTheme): string {
  return (
    (process.env[t.fromEnv] || "").trim() ||
    (process.env.RESEND_FROM_EMAIL || "").trim() ||
    FROM_PADRAO
  );
}

function logoUrlFor(t: EmailTheme): string {
  // EMAIL_LOGO_URL continua sobrescrevendo o logo da EXP Tour (compat: caso o
  // arquivo va para um CDN). Demais tenants usam o PNG servido pelo app.
  if (t.logoBasename === "logo-exp-tour.png" && process.env.EMAIL_LOGO_URL) {
    return process.env.EMAIL_LOGO_URL;
  }
  return APP_URL ? `${APP_URL}/email/${t.logoBasename}` : "";
}

function cabecalhoLogo(t: EmailTheme): string {
  const url = logoUrlFor(t);
  const conteudo = url
    ? `<img src="${url}" alt="${t.wordmarkTop}" width="${t.logoWidth}" style="display:block;margin:0 auto;border:0;" />`
    : `<div style="color:${t.accentFg};font-family:${t.font};">
<div style="font-size:24px;letter-spacing:6px;line-height:1.2;">${t.wordmarkTop}</div>
${t.wordmarkSub ? `<div style="font-size:10px;letter-spacing:4px;padding-top:4px;">${t.wordmarkSub}</div>` : ""}
</div>`;
  return `<tr><td style="text-align:center;padding-bottom:24px;">
${conteudo}
</td></tr>`;
}

// Moldura comum: <head> + moldura escura + logo + cartao claro + rodape. Cada
// template so entrega o `corpo` (conteudo do cartao). `centro` centraliza o
// cartao (codigo de acesso); `maxw` ajusta a largura.
function layout(
  t: EmailTheme,
  opts: { corpo: string; footer?: string; maxw?: number; centro?: boolean },
): string {
  const { corpo, footer, maxw = 480, centro = false } = opts;
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${t.fontLink}
</head>
<body style="margin:0;padding:0;">
<div style="background-color:${t.frame};padding:32px 0;font-family:${t.font};">
<table role="presentation" width="100%" style="max-width:${maxw}px;margin:0 auto;">
${cabecalhoLogo(t)}
<tr>
<td style="background-color:${t.card};border-radius:8px;padding:32px;${centro ? "text-align:center;" : ""}">
${corpo}
</td>
</tr>
<tr>
<td style="text-align:center;padding-top:24px;"><span style="color:${t.footerFg};font-size:13px;">${footer ?? t.footerLabel}</span></td>
</tr>
</table>
</div>
</body>
</html>`;
}

function botaoRow(t: EmailTheme, href: string, label: string): string {
  return `<tr><td style="padding-top:20px;"><a href="${href}" style="background-color:${t.accentBg};color:${t.accentFg};text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;display:inline-block;">${label}</a></td></tr>`;
}

function saudacaoDe(nome: string, comExclamacao = true): string {
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const marca = comExclamacao ? "!" : ".";
  return primeiroNome ? `Olá, ${primeiroNome}${marca}` : `Olá${marca}`;
}

function escaparHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Grava o resultado de uma tentativa de envio na tabela email_logs, para
// permitir auditoria posterior (mesmo quando o chamador ignora o erro).
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

// Envio compartilhado: monta o request do Resend, registra o log (sucesso/erro)
// e lanca em caso de falha, para o chamador decidir se repete/propaga.
async function enviarViaResend(
  t: EmailTheme,
  destinatario: string,
  tipo: string,
  subject: string,
  html: string,
) {
  const apiKey = getApiKey();
  const from = fromFor(t);
  let response: Response;
  try {
    response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [destinatario], subject, html }),
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha de rede ao chamar a API do Resend";
    await registrarLog(destinatario, tipo, false, mensagem);
    throw new Error(mensagem);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = data?.message || `Falha ao enviar email (status ${response.status})`;
    await registrarLog(destinatario, tipo, false, mensagem);
    throw new Error(mensagem);
  }
  await registrarLog(destinatario, tipo, true);
  return data;
}

// ---- Codigo de acesso (Area do Cliente) ------------------------------------

function templateCodigoAcesso(t: EmailTheme, nome: string, codigo: string) {
  const saudacao = saudacaoDe(nome);
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${t.ink};font-size:16px;margin:0 0 24px;">Use o código abaixo para acessar a sua Área do Cliente:</p>
<div style="background-color:${t.accentBg};color:${t.accentFg};font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;border-radius:6px;display:inline-block;">${codigo}</div>
<p style="color:${t.ink};font-size:14px;margin:24px 0 0;">Este código expira em 10 minutos. Se você não solicitou este acesso, ignore este e-mail.</p>`;
  return layout(t, { corpo, centro: true });
}

// Envia o codigo de acesso por e-mail via Resend. Lanca erro em caso de falha
// (quem chamar deve decidir se quer expor esse erro ao usuario final ou nao).
export async function enviarCodigoAcessoEmail(
  destinatario: string,
  nome: string,
  codigo: string,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "codigo_acesso",
    `Seu código de acesso - ${t.brandName}`,
    templateCodigoAcesso(t, nome, codigo),
  );
}

// ---- Lembrete de cobranca (regua) ------------------------------------------

type DadosLembrete = {
  descricao: string;
  valor: string; // ja formatado, ex: "R$ 1.234,56"
  vencimento: string; // ja formatado, ex: "05/08/2026"
  vencida: boolean; // true quando a parcela ja passou do vencimento
  pixCode?: string | null; // codigo Pix copia-e-cola (payment_link), se houver
  portalUrl?: string | null; // link para a Area do Cliente, se configurado
};

function templateLembreteCobranca(t: EmailTheme, nome: string, d: DadosLembrete) {
  const saudacao = saudacaoDe(nome);
  const chamada = d.vencida
    ? "Identificamos uma parcela em atraso na sua Área do Cliente:"
    : "Este é um lembrete de uma parcela que está chegando:";

  const pixBloco = d.pixCode
    ? `<tr><td style="padding-top:16px;">
         <p style="color:${t.ink};font-size:14px;margin:0 0 8px;">Pix copia e cola:</p>
         <div style="background-color:${t.boxBg};border:1px solid ${t.ink};border-radius:6px;padding:12px;word-break:break-all;font-family:monospace;font-size:12px;color:${t.ink};">${d.pixCode}</div>
       </td></tr>`
    : "";

  const portalBloco = d.portalUrl
    ? `<tr><td style="text-align:center;padding-top:24px;">
         <a href="${d.portalUrl}" style="background-color:${t.accentBg};color:${t.accentFg};text-decoration:none;font-size:16px;padding:12px 28px;border-radius:6px;display:inline-block;">Abrir minha Área do Cliente</a>
       </td></tr>`
    : "";

  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${t.ink};font-size:16px;margin:0 0 16px;">${chamada}</p>
<table role="presentation" width="100%" style="border-collapse:collapse;">
<tr><td style="color:${t.ink};font-size:15px;padding:4px 0;">${d.descricao}</td></tr>
<tr><td style="color:${t.ink};font-size:22px;font-weight:bold;padding:4px 0;">${d.valor}</td></tr>
<tr><td style="color:${t.ink};font-size:14px;padding:4px 0;">Vencimento: ${d.vencimento}</td></tr>
<tr><td style="color:${t.ink};font-size:13px;padding:10px 0 0;">Precisa de outra data? Você pode alterar o vencimento na sua Área do Cliente, sem juros ou taxa.</td></tr>
${pixBloco}
${portalBloco}
</table>`;
  return layout(t, { corpo });
}

// Envia um lembrete de cobranca (regua) por e-mail via Resend. Lanca erro em
// caso de falha, para o chamador (cron) decidir se registra/repete.
export async function enviarLembreteCobrancaEmail(
  destinatario: string,
  nome: string,
  dados: DadosLembrete,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  const assunto = dados.vencida
    ? `Parcela em atraso - ${t.brandName}`
    : `Lembrete de pagamento - ${t.brandName}`;
  return enviarViaResend(t, destinatario, "lembrete_cobranca", assunto, templateLembreteCobranca(t, nome, dados));
}

// ---- Portal do Fornecedor: codigo de login (bilingue EN/PT) ----------------
// O Portal do Fornecedor e da EXP Tour (parceiros B2B): marca fixa EXP Tour.

function templateCodigoFornecedor(t: EmailTheme, nome: string, codigo: string, idioma: string) {
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

  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${t.ink};font-size:16px;margin:0 0 24px;">${instrucao}</p>
<div style="background-color:${t.accentBg};color:${t.accentFg};font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;border-radius:6px;display:inline-block;">${codigo}</div>
<p style="color:${t.ink};font-size:14px;margin:24px 0 0;">${expira}</p>`;
  return layout(t, { corpo, footer: rodape, centro: true });
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
  const t = resolveTheme("exp-tour");
  const en = idioma !== "pt";
  const subject = en ? "Your access code - EXP Tour" : "Seu código de acesso - EXP Tour";
  return enviarViaResend(t, destinatario, "codigo_fornecedor", subject, templateCodigoFornecedor(t, nome, codigo, idioma));
}

// ---- Portal do Fornecedor: convite de acesso (bilingue EN/PT) --------------

function templateConviteFornecedor(t: EmailTheme, nome: string, idioma: string, loginUrl: string) {
  const en = idioma !== "pt";
  const primeiroNome = (nome || "").trim().split(" ")[0] || "";
  const saudacao = en
    ? primeiroNome ? `Hello, ${primeiroNome}!` : "Hello!"
    : primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";
  const intro = en
    ? "You now have access to the EXP Tour Partner Portal, where you can follow your students."
    : "Você agora tem acesso ao Portal do Parceiro da EXP Tour, onde acompanha os seus estudantes.";
  const instrucao = en
    ? "To sign in, open the portal and enter this e-mail address. We'll send you a one-time code — no password to remember."
    : "Para entrar, abra o portal e informe este e-mail. Enviamos um código de uso único — sem senha para decorar.";
  const botao = en ? "Access the portal" : "Acessar o portal";
  const rodape = en ? "EXP Tour — Partner Portal" : "EXP Tour — Portal do Parceiro";

  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">${intro}</p>
<p style="color:${t.ink};font-size:14px;margin:0 0 24px;">${instrucao}</p>
<a href="${loginUrl}" style="background-color:${t.accentBg};color:${t.accentFg};font-size:16px;text-decoration:none;padding:12px 24px;border-radius:6px;display:inline-block;">${botao}</a>
<p style="color:${t.ink};font-size:12px;margin:24px 0 0;word-break:break-all;">${loginUrl}</p>`;
  return layout(t, { corpo, footer: rodape, centro: true });
}

// Envia o convite de acesso ao Portal do Fornecedor (boas-vindas + link de
// login). O portal e sem senha: o convite so avisa que o acesso existe e como
// entrar (informar o e-mail e receber um codigo). Lanca erro em caso de falha
// (quem chama decide como tratar). Registra a tentativa em email_logs.
export async function enviarConviteFornecedorEmail(
  destinatario: string,
  nome: string,
  idioma: string = "en",
  loginUrl: string = APP_URL ? `${APP_URL}/fornecedor/login` : "https://exp-tour.com/fornecedor/login"
) {
  const t = resolveTheme("exp-tour");
  const en = idioma !== "pt";
  const subject = en
    ? "Your EXP Tour Partner Portal access"
    : "Seu acesso ao Portal do Parceiro EXP Tour";
  return enviarViaResend(t, destinatario, "convite_fornecedor", subject, templateConviteFornecedor(t, nome, idioma, loginUrl));
}

// ---- Portal do Fornecedor: alerta operacional (matriz 1-4) ------------------
// Generico: assunto + um paragrafo de contexto + UM botao de acao que leva a
// tela certa do portal (apos o login por codigo). Bilingue (o chamador passa o
// texto ja no idioma do usuario). Marca fixa EXP Tour (portal de parceiros).

function templateAlertaFornecedor(
  t: EmailTheme,
  nome: string,
  idioma: string,
  dados: { titulo: string; contexto: string; botaoLabel: string; botaoUrl: string }
) {
  const en = idioma !== "pt";
  const saudacao = en
    ? (nome || "").trim().split(" ")[0]
      ? `Hello, ${(nome || "").trim().split(" ")[0]}!`
      : "Hello!"
    : saudacaoDe(nome);
  const rodape = en ? "EXP Tour — Partner Portal" : "EXP Tour — Portal do Parceiro";

  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${t.ink};font-size:16px;margin:0 0 8px;font-weight:bold;">${escaparHtml(dados.titulo)}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 4px;">${escaparHtml(dados.contexto)}</p>
<table role="presentation"><tbody>${botaoRow(t, dados.botaoUrl, dados.botaoLabel)}</tbody></table>`;
  return layout(t, { corpo, footer: rodape });
}

// Envia um alerta operacional ao usuario do fornecedor. Lanca em caso de falha
// (o cron trata como erro e segue). Registra em email_logs (alerta_fornecedor).
export async function enviarAlertaFornecedorEmail(
  destinatario: string,
  nome: string,
  idioma: string,
  dados: { subject: string; titulo: string; contexto: string; botaoLabel: string; botaoUrl: string }
) {
  const t = resolveTheme("exp-tour");
  return enviarViaResend(
    t,
    destinatario,
    "alerta_fornecedor",
    dados.subject,
    templateAlertaFornecedor(t, nome, idioma, {
      titulo: dados.titulo,
      contexto: dados.contexto,
      botaoLabel: dados.botaoLabel,
      botaoUrl: dados.botaoUrl,
    })
  );
}

// ---- Confirmacao de aceite do Termo de Adesao ------------------------------

type DadosAceite = {
  versao: string;
  dataFormatada: string;        // ex.: "01/07/2026 14:30"
  arrependimentoAte: string;    // ex.: "08/07/2026"
  conteudo?: string | null;     // texto completo do termo (cópia)
};

function templateConfirmacaoAceite(t: EmailTheme, nome: string, d: DadosAceite) {
  const saudacao = saudacaoDe(nome);
  const textoTermo = escaparHtml(d.conteudo || "");
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 16px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Confirmamos o seu aceite do <strong>Termo de Adesão</strong> (versão ${d.versao}) em <strong>${d.dataFormatada}</strong>.</p>
<p style="color:${t.ink};font-size:14px;margin:0 0 12px;"><strong>Direito de arrependimento:</strong> você pode desistir até <strong>${d.arrependimentoAte}</strong> (7 dias), pela própria Área do Cliente ou entrando em contato conosco.</p>
${textoTermo ? `<hr style="border:none;border-top:1px solid ${t.line};margin:20px 0;" /><p style="color:${t.ink};font-size:13px;margin:0 0 8px;"><strong>Conteúdo aceito:</strong></p><div style="color:${t.ink};font-size:12px;white-space:pre-wrap;line-height:1.5;">${textoTermo}</div>` : ""}`;
  return layout(t, { corpo, maxw: 520 });
}

// Envia a confirmacao/copia do aceite do Termo de Adesao. Best-effort: quem
// chama pode ignorar o erro (o aceite ja esta registrado no banco).
export async function enviarConfirmacaoAceiteEmail(
  destinatario: string,
  nome: string,
  dados: DadosAceite,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "aceite_termo",
    `Confirmação do aceite do Termo de Adesão - ${t.brandName}`,
    templateConfirmacaoAceite(t, nome, dados),
  );
}

// ---- Recibo de pagamento (Clausula 6.5.2) ----------------------------------

type DadosRecibo = {
  dataFormatada: string; // data/hora da liquidação
  descricao: string; // ex.: "Parcela 2" ou "Entrada"
  moeda: string; // moeda do programa (ex.: CAD)
  ptax: number; // PTAX de venda aplicada
  subtotal: number; // valor convertido em R$
  taxaPercentual: number; // ex.: 0.05
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

function templateRecibo(t: EmailTheme, nome: string, d: DadosRecibo) {
  const saudacao = saudacaoDe(nome);
  const linha = (rot: string, val: string) =>
    `<tr><td style="padding:6px 0;color:${t.ink};font-size:13px;">${rot}</td><td style="padding:6px 0;color:${t.ink};font-size:13px;text-align:right;font-weight:bold;">${val}</td></tr>`;
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 4px;">${saudacao}</p>
<p style="color:${t.ink};font-size:14px;margin:0 0 16px;">Recibo do seu pagamento — <strong>${d.descricao}</strong> — em ${d.dataFormatada}.</p>
<table role="presentation" width="100%" style="border-collapse:collapse;">
${linha("PTAX de venda (BCB) aplicada", "R$ " + d.ptax.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 6 }))}
${linha("Valor convertido", brl(d.subtotal))}
${linha("Taxa de Intermediação e Câmbio (" + pct(d.taxaPercentual) + ")", brl(d.taxaIntermediacao))}
${linha("IOF-câmbio (" + pct(d.iofPercentual) + ")", brl(d.iof))}
<tr><td colspan="2" style="border-top:1px solid ${t.line};padding-top:8px;"></td></tr>
${linha("<strong>Total pago</strong>", "<strong>" + brl(d.totalBRL) + "</strong>")}
${linha("Valor amortizado", moe(d.amortizacaoMoeda, d.moeda))}
${d.saldoRestanteMoeda != null ? linha("Saldo devedor remanescente", moe(d.saldoRestanteMoeda, d.moeda)) : ""}
</table>
<p style="color:${t.ink};font-size:11px;margin:16px 0 0;">Nenhuma tarifa bancária ou despesa de remessa é cobrada separadamente &mdash; estão compreendidas na Taxa de Intermediação e Câmbio.</p>`;
  return layout(t, { corpo, maxw: 520 });
}

// Envia o recibo itemizado de um pagamento (Clausula 6.5.2). Best-effort.
export async function enviarReciboPagamentoEmail(
  destinatario: string,
  nome: string,
  dados: DadosRecibo,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "recibo_pagamento",
    `Recibo do seu pagamento - ${t.brandName}`,
    templateRecibo(t, nome, dados),
  );
}

// ---- Lembrete de quitacao (Clausula 7.12) ----------------------------------

type DadosQuitacao = {
  saldo: string; // saldo devedor ja formatado, ex.: "CAD 3.200,00"
  dataLimite: string; // data-limite de quitacao ja formatada, ex.: "01/09/2026"
  diasRestantes: number; // 30 / 15 / 5
  portalUrl?: string | null;
};

function templateLembreteQuitacao(t: EmailTheme, nome: string, d: DadosQuitacao) {
  const saudacao = saudacaoDe(nome);
  const botao = d.portalUrl ? botaoRow(t, d.portalUrl, "Acessar a Área do Cliente") : "";
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Faltam <strong>${d.diasRestantes} dias</strong> para a data-limite de quitação do seu programa (<strong>${d.dataLimite}</strong>).</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 4px;">Saldo devedor atual:</p>
<p style="color:${t.ink};font-size:22px;font-weight:bold;margin:0 0 4px;">${d.saldo}</p>
<p style="color:${t.ink};font-size:13px;margin:12px 0 0;">Você pode pagar quando e quanto quiser até essa data. O valor em Reais é definido pela cotação do dia no momento de cada pagamento.</p>
<table role="presentation">${botao}</table>`;
  return layout(t, { corpo });
}

// Lembrete de quitacao (Clausula 7.12): D-30/D-15/D-5 antes da data-limite.
// Best-effort. Lanca em caso de falha para o chamador contabilizar.
export async function enviarLembreteQuitacaoEmail(
  destinatario: string,
  nome: string,
  dados: DadosQuitacao,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "lembrete_quitacao",
    `Faltam ${dados.diasRestantes} dias para a quitação - ${t.brandName}`,
    templateLembreteQuitacao(t, nome, dados),
  );
}

// ---- Aviso de documento (aprovado/recusado) --------------------------------

type DadosAvisoDocumento = {
  tipoDocumento: string; // rotulo legivel, ex.: "Passaporte"
  aprovado: boolean; // true = aprovado; false = rejeitado
  motivo?: string | null; // motivo da rejeicao (obrigatorio quando rejeitado)
  portalUrl?: string | null; // link para a Area do Cliente, se configurado
};

function templateAvisoDocumento(t: EmailTheme, nome: string, d: DadosAvisoDocumento) {
  const saudacao = saudacaoDe(nome);
  const motivoTxt = escaparHtml(d.motivo || "");
  const corpo = d.aprovado
    ? `<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Seu documento <strong>${d.tipoDocumento}</strong> foi <strong>aprovado</strong>. Nada mais é necessário para este item.</p>`
    : `<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Seu documento <strong>${d.tipoDocumento}</strong> foi <strong>recusado</strong> e precisa ser reenviado.</p>
${motivoTxt ? `<p style="color:${t.ink};font-size:14px;margin:0 0 12px;"><strong>Motivo:</strong> ${motivoTxt}</p>` : ""}
<p style="color:${t.ink};font-size:14px;margin:0 0 4px;">Reenvie o documento corrigido pela sua Área do Cliente.</p>`;
  const botao = d.portalUrl ? botaoRow(t, d.portalUrl, "Abrir minha Área do Cliente") : "";
  const conteudo = `<p style="color:${t.ink};font-size:18px;margin:0 0 12px;">${saudacao}</p>
${corpo}
<table role="presentation">${botao}</table>`;
  return layout(t, { corpo: conteudo });
}

// Avisa o titular que um documento foi aprovado ou rejeitado (analise inline no
// Caso 360). Best-effort: quem chama pode ignorar o erro (o status ja esta
// gravado no banco). Lanca em caso de falha para o chamador contabilizar.
export async function enviarAvisoDocumentoEmail(
  destinatario: string,
  nome: string,
  dados: DadosAvisoDocumento,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  const assunto = dados.aprovado
    ? `Documento aprovado - ${t.brandName}`
    : `Documento recusado - reenvio necessário - ${t.brandName}`;
  return enviarViaResend(t, destinatario, "aviso_documento", assunto, templateAvisoDocumento(t, nome, dados));
}

// ---- Aviso de visto negado (E1) --------------------------------------------

function templateVistoNegado(t: EmailTheme, nome: string, portalUrl?: string | null) {
  const saudacao = saudacaoDe(nome, false);
  const botao = portalUrl ? botaoRow(t, portalUrl, "Abrir minha Área do Cliente") : "";
  // Tom: informa e acolhe, mas a conversa (a emocao e a decisao) fica com o
  // consultor humano — principio 5 do doc 01. Por isso a mensagem e sobria e
  // deixa claro que uma pessoa vai entrar em contato.
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Recebemos a informação de que o seu pedido de visto foi <strong>negado</strong>. Sabemos que não era o resultado esperado — e queremos que saiba que isso, com frequência, tem solução.</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Existem caminhos possíveis, e vamos avaliar o melhor para o seu caso:</p>
<ul style="color:${t.ink};font-size:14px;margin:0 0 12px;padding-left:20px;">
<li style="margin-bottom:6px;">Nova aplicação do visto, com os pontos revistos;</li>
<li style="margin-bottom:6px;">Troca de destino, aproveitando o que já foi pago;</li>
<li style="margin-bottom:6px;">Cancelamento, com o acerto conforme as regras.</li>
</ul>
<p style="color:${t.ink};font-size:15px;margin:0 0 4px;"><strong>Enquanto isso, pausamos as cobranças do seu programa.</strong> Você não precisa fazer nada agora.</p>
<p style="color:${t.ink};font-size:15px;margin:8px 0 0;">O seu consultor entrará em contato em breve para conversar sobre os próximos passos.</p>
<table role="presentation">${botao}</table>`;
  return layout(t, { corpo });
}

// Aviso ao titular de que o visto foi negado (processo E1, doc 01 §4). Informa
// e acolhe; a conversa fica com o consultor. Best-effort: quem chama pode
// ignorar o erro (a excecao e a tarefa ja estao registradas).
export async function enviarAvisoVistoNegadoEmail(
  destinatario: string,
  nome: string,
  portalUrl?: string | null,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "visto_negado",
    `Sobre o seu visto - ${t.brandName}`,
    templateVistoNegado(t, nome, portalUrl),
  );
}

// ---- Aviso de cancelamento/alteracao da escola (E6) ------------------------

function templateCancelamentoEscola(t: EmailTheme, nome: string, portalUrl?: string | null) {
  const saudacao = saudacaoDe(nome, false);
  const botao = portalUrl ? botaoRow(t, portalUrl, "Abrir minha Área do Cliente") : "";
  // Comunicacao proativa (reputacao/velocidade — doc 01 §4, E6). Informa e
  // tranquiliza; a decisao (realocar x reembolsar) e a emocao ficam com o
  // consultor humano.
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Precisamos avisar que houve uma alteração da escola no seu programa, e ele não poderá seguir como estava. Queremos que saiba, antes de tudo, que <strong>você não fica no prejuízo</strong>.</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Vamos encontrar a melhor saída com você:</p>
<ul style="color:${t.ink};font-size:14px;margin:0 0 12px;padding-left:20px;">
<li style="margin-bottom:6px;">Realocação para uma alternativa equivalente, sem custo adicional; ou</li>
<li style="margin-bottom:6px;">Reembolso integral, incluindo a entrada.</li>
</ul>
<p style="color:${t.ink};font-size:15px;margin:0 0 4px;"><strong>Enquanto isso, pausamos as cobranças do seu programa.</strong> Você não precisa fazer nada agora.</p>
<p style="color:${t.ink};font-size:15px;margin:8px 0 0;">O seu consultor entrará em contato em breve para resolver com você.</p>
<table role="presentation">${botao}</table>`;
  return layout(t, { corpo });
}

// Aviso ao titular de que a escola cancelou/alterou o programa (processo E6, doc
// 01 §4). Comunicacao proativa e tranquilizadora; a execucao (realocar/
// reembolsar) e conduzida pelo time. Best-effort.
export async function enviarAvisoCancelamentoEscolaEmail(
  destinatario: string,
  nome: string,
  portalUrl?: string | null,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "cancelamento_escola",
    `Sobre o seu programa - ${t.brandName}`,
    templateCancelamentoEscola(t, nome, portalUrl),
  );
}

// ---- Aviso de forca maior coletiva (E8) ------------------------------------

function templateForcaMaior(t: EmailTheme, nome: string, portalUrl?: string | null) {
  const saudacao = saudacaoDe(nome, false);
  const botao = portalUrl ? botaoRow(t, portalUrl, "Abrir minha Área do Cliente") : "";
  // Comunicacao padronizada em lote (doc 01 §4, E8). Informa e tranquiliza; a
  // escolha (adiar x cancelar) e a conversa ficam com o time.
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Surgiu uma situação de força maior que afeta o destino do seu programa. Estamos acompanhando de perto e agindo para proteger você e a sua viagem.</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 4px;"><strong>Enquanto isso, pausamos as cobranças do seu programa.</strong> Você não precisa fazer nada agora.</p>
<p style="color:${t.ink};font-size:15px;margin:12px 0 12px;">Assim que o cenário estiver claro, vamos combinar com você o melhor caminho — <strong>adiar</strong> a viagem para uma nova data ou, se preferir, <strong>cancelar com as condições cabíveis</strong>.</p>
<p style="color:${t.ink};font-size:15px;margin:0;">A nossa equipe entrará em contato. Se tiver qualquer dúvida, é só responder a este e-mail.</p>
<table role="presentation">${botao}</table>`;
  return layout(t, { corpo });
}

// Comunicacao padronizada de forca maior coletiva (processo E8, doc 01 §4).
// Enviada EM LOTE aos titulares afetados. Best-effort por titular.
export async function enviarAvisoForcaMaiorEmail(
  destinatario: string,
  nome: string,
  portalUrl?: string | null,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "forca_maior",
    `Informação importante sobre o seu programa - ${t.brandName}`,
    templateForcaMaior(t, nome, portalUrl),
  );
}

// ---- Cronograma de pagamentos atualizado (E2/E3) ---------------------------

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

function templateCronogramaAtualizado(t: EmailTheme, nome: string, d: DadosCronograma) {
  const saudacao = saudacaoDe(nome);
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
        `<tr><td style="padding:6px 0;color:${t.ink};font-size:14px;border-bottom:1px solid ${t.line};">Parcela ${p.numero} &mdash; ${fmtDataBR(
          p.vencimento
        )}</td><td style="padding:6px 0;color:${t.ink};font-size:14px;text-align:right;border-bottom:1px solid ${t.line};">${fmtValor(
          p.valor,
          d.moeda
        )}</td></tr>`
    )
    .join("");
  const tabela = linhas
    ? `<table role="presentation" width="100%" style="margin:8px 0 12px;border-collapse:collapse;">${linhas}</table>`
    : `<p style="color:${t.ink};font-size:14px;margin:0 0 12px;">Não há parcelas em aberto no novo cronograma.</p>`;
  const quitacao = d.novaDataQuitacao
    ? `<p style="color:${t.ink};font-size:14px;margin:0 0 12px;">Data-limite de quitação: <strong>${fmtDataBR(
        d.novaDataQuitacao
      )}</strong>.</p>`
    : "";
  const botao = d.portalUrl ? botaoRow(t, d.portalUrl, "Ver na minha Área do Cliente") : "";
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">${motivo}</p>
<p style="color:${t.ink};font-size:14px;margin:0 0 4px;"><strong>Novo cronograma:</strong></p>
${tabela}
${quitacao}
<p style="color:${t.ink};font-size:13px;margin:8px 0 0;">As parcelas já pagas não foram alteradas. Em caso de dúvida, fale com o seu consultor.</p>
<table role="presentation">${botao}</table>`;
  return layout(t, { corpo });
}

// Avisa o titular que o cronograma de pagamentos foi reescrito apos a execucao
// em cascata de uma alteracao (E2 adiamento / E3 escopo). Transparencia do doc
// 04: "notifica o cliente com o resumo do novo cronograma". Best-effort: quem
// chama DEVE ignorar o erro (a alteracao ja foi aplicada e commitada).
export async function enviarAvisoCronogramaAtualizadoEmail(
  destinatario: string,
  nome: string,
  dados: DadosCronograma,
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  return enviarViaResend(
    t,
    destinatario,
    "cronograma_atualizado",
    `Seu cronograma de pagamentos foi atualizado - ${t.brandName}`,
    templateCronogramaAtualizado(t, nome, dados),
  );
}

// ---- Recibo de devolucao (motor de acerto, Fatia D) ------------------------

// Confirma ao cliente que o reembolso do acerto foi processado. Best-effort.
// `meio` = 'mp' (estorno no cartao/Pix) | 'manual' (devolucao por fora).
export async function enviarReciboDevolucaoEmail(
  destinatario: string,
  nome: string,
  dados: { valorBRL: number; meio: "mp" | "manual"; portalUrl?: string | null },
  tenantSlug?: string | null,
) {
  const t = resolveTheme(tenantSlug);
  const saudacao = saudacaoDe(nome);
  const valor = `R$ ${(Number(dados.valorBRL) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const comoTxt =
    dados.meio === "mp"
      ? "O estorno foi enviado ao meio de pagamento original; o prazo de compensação depende do seu banco/emissor."
      : "A devolução foi processada pela nossa equipe; em caso de dúvida sobre o comprovante, fale com o seu consultor.";
  const botao = dados.portalUrl ? botaoRow(t, dados.portalUrl, "Abrir minha Área do Cliente") : "";
  const corpo = `<p style="color:${t.ink};font-size:18px;margin:0 0 12px;">${saudacao}</p>
<p style="color:${t.ink};font-size:15px;margin:0 0 12px;">Confirmamos a devolução do seu acerto no valor de <strong>${valor}</strong>.</p>
<p style="color:${t.ink};font-size:14px;margin:0 0 4px;">${comoTxt}</p>
<table role="presentation">${botao}</table>`;
  return enviarViaResend(
    t,
    destinatario,
    "recibo_devolucao",
    `Confirmação de devolução - ${t.brandName}`,
    layout(t, { corpo }),
  );
}

// ---- Aviso interno para a equipe -------------------------------------------

// Aviso interno (ex.: cliente exerceu arrependimento). Envia para ADMIN_EMAIL,
// com a marca EXP Tour (comunicacao interna). Best-effort: quem chama pode
// ignorar o erro.
export async function enviarAvisoInternoEmail(assunto: string, texto: string) {
  const t = resolveTheme("exp-tour");
  const destinatario = process.env.ADMIN_EMAIL || "rodrigo@exp-tour.com";
  const html = `<div style="font-family:${t.font};color:${t.ink};font-size:14px;white-space:pre-wrap;">${escaparHtml(texto)}</div>`;
  return enviarViaResend(t, destinatario, "aviso_interno", assunto, html);
}
