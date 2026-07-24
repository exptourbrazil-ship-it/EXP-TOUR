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

// Passo 1 do login do admin: gera um código de 6 dígitos, envia para o e-mail
// administrativo FIXO (definido no servidor, nunca informado pelo cliente) e
// grava um token assinado do código num cookie httpOnly de 10 minutos.
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

  const destinatario = process.env.ADMIN_EMAIL || "rodrigo@exp-tour.com";

  const codigo = gerarCodigo();

  let token: string;
  try {
    token = criarTokenCodigo(codigo);
  } catch {
    return NextResponse.json(
      { error: "Login de admin nao configurado no servidor." },
      { status: 500 }
    );
  }

  try {
    await enviarCodigoAcessoEmail(destinatario, "Equipe EXP Tour", codigo);
  } catch (err) {
    console.error("Falha ao enviar codigo de admin por email", err);
    return NextResponse.json(
      { error: "Nao foi possivel enviar o e-mail. Tente novamente." },
      { status: 502 }
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_CODIGO_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
