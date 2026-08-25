import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarCodigoFornecedorEmail } from "@/lib/email";
import { criarTokenCodigo, gerarCodigo, FORNECEDOR_CODIGO_COOKIE } from "@/lib/fornecedor-codigo";
import { checarELimitar, obterIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rate limit por IP (janela de 10 min) contra spam do Resend e enumeracao.
const RL_JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const RL_IP = Number(process.env.RATE_LIMIT_FORNECEDOR_REQUEST_IP || "5");

// Passo 1 do login do fornecedor: informa o e-mail; se for um usuario ativo
// (supplier_user), gera um codigo de 6 digitos, envia PARA ESSE e-mail e grava
// um token assinado (com o e-mail e o hash do codigo) num cookie httpOnly de 10
// min. O e-mail vai no token para o /verify saber quem loga sem reinformar.
//
// Anti-enumeracao: e-mail nao cadastrado recebe a MESMA resposta (inclusive o
// Set-Cookie), com um token "decoy" cujo codigo nunca foi enviado.
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const ip = obterIp(request);
  if (!(await checarELimitar(supabase, `fornecedor-req-code:ip:${ip}`, RL_IP, RL_JANELA_SEG))) {
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

  function responderComCookie(tokenCookie: string) {
    const res = NextResponse.json({ success: true });
    res.cookies.set(FORNECEDOR_CODIGO_COOKIE, tokenCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return res;
  }

  const { data: usuario } = await supabase
    .from("supplier_user")
    .select("name, language")
    .eq("email", email)
    .eq("active", true)
    .is("archived_at", null)
    .maybeSingle();

  if (!usuario) {
    // Nao cadastrado/ativo: responde IGUAL (mesmo Set-Cookie), mas com um token
    // decoy cujo codigo nunca foi enviado — o /verify nunca vai conferir.
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
      { error: "Login de fornecedor nao configurado no servidor." },
      { status: 500 }
    );
  }

  try {
    await enviarCodigoFornecedorEmail(email, usuario.name || "", codigo, usuario.language || "en");
  } catch (err) {
    // Nao logar o err cru (pode conter o e-mail). So a mensagem.
    console.error("Falha ao enviar codigo de fornecedor por email:", err instanceof Error ? err.message : "erro");
    return NextResponse.json(
      { error: "Nao foi possivel enviar o e-mail. Tente novamente." },
      { status: 502 }
    );
  }

  return responderComCookie(token);
}
