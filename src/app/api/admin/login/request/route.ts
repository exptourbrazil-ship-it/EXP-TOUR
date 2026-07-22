import { NextResponse } from "next/server";
import { enviarCodigoAcessoEmail } from "@/lib/email";
import { criarTokenCodigo, gerarCodigo, ADMIN_CODIGO_COOKIE } from "@/lib/admin-codigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Passo 1 do login do admin: gera um código de 6 dígitos, envia para o e-mail
// administrativo FIXO (definido no servidor, nunca informado pelo cliente) e
// grava um token assinado do código num cookie httpOnly de 10 minutos.
export async function POST() {
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
