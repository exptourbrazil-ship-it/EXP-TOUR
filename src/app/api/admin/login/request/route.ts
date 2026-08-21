import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarCodigoAcessoEmail } from "@/lib/email";
import { criarTokenCodigo, gerarCodigo, ADMIN_CODIGO_COOKIE } from "@/lib/admin-codigo";
import { checarELimitar, obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limit por IP (janela de 10 min) para nao permitir spam do e-mail admin.
const RL_JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const RL_ADMIN_IP = Number(process.env.RATE_LIMIT_ADMIN_REQUEST_IP || "5");

// Passo 1 do login do admin: o staff informa o e-mail; se ele for um admin
// ativo (tabela admin_users), gera um código de 6 dígitos, envia PARA ESSE
// e-mail e grava um token assinado (com o e-mail embutido) num cookie httpOnly
// de 10 minutos. O e-mail vai no token para o /verify saber quem loga e buscar
// o papel — o cliente nunca reinforma o e-mail depois.
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const ip = obterIp(request);
  if (!(await checarELimitar(supabase, `admin-req-code:ip:${ip}`, RL_ADMIN_IP, RL_JANELA_SEG))) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }

  // Grava o cookie do codigo (10 min). Usado nos dois caminhos: para o e-mail
  // admin, com o codigo real enviado; para o nao-admin, com um token "decoy"
  // (codigo nunca enviado). Assim a resposta — inclusive o header Set-Cookie — e
  // indistinguivel entre admin e nao-admin (anti-enumeracao).
  function responderComCookie(tokenCookie: string) {
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_CODIGO_COOKIE, tokenCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return res;
  }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("email")
    .eq("email", email)
    .eq("ativo", true)
    .maybeSingle();

  if (!admin) {
    // E-mail nao e admin ativo: responde IGUAL (mesmo header Set-Cookie), mas com
    // um token decoy cujo codigo nunca foi enviado — o /verify nunca vai conferir.
    // Residual conhecido: o envio de e-mail (so no caminho admin) ainda cria uma
    // pequena diferenca de tempo; mitigada pelo rate-limit por IP e pelo numero
    // pequeno de admins. Ver docs/decisions.md se for necessario zerar o timing.
    let decoy: string;
    try {
      decoy = criarTokenCodigo(gerarCodigo(), email);
    } catch {
      return NextResponse.json({ success: true });
    }
    return responderComCookie(decoy);
  }

  const codigo = gerarCodigo();

  let token: string;
  try {
    token = criarTokenCodigo(codigo, email);
  } catch {
    return NextResponse.json(
      { error: "Login de admin nao configurado no servidor." },
      { status: 500 }
    );
  }

  try {
    await enviarCodigoAcessoEmail(email, "Equipe EXP Tour", codigo);
  } catch (err) {
    // Nao logar o err cru (pode conter o e-mail do destinatario). So a mensagem.
    console.error("Falha ao enviar codigo de admin por email:", err instanceof Error ? err.message : "erro");
    return NextResponse.json(
      { error: "Nao foi possivel enviar o e-mail. Tente novamente." },
      { status: 502 }
    );
  }

  return responderComCookie(token);
}
