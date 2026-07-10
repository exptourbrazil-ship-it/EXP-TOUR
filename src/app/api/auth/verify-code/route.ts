import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarSessao, SESSION_COOKIE } from "@/lib/session";

function limparCpf(cpf: string): string {
    return cpf.replace(/\D/g, "");
}

// Valida o codigo de acesso enviado por WhatsApp e, se estiver correto,
// abre uma sessao para o titular (cookie httpOnly assinado). Este endpoint
// substitui o antigo parametro "?titular=" inseguro na URL.
export async function POST(request: Request) {
    const body = await request.json();
    const cpf = body?.cpf;
    const codigo = body?.codigo;

  if (typeof cpf !== "string" || typeof codigo !== "string") {
        return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  const cpfLimpo = limparCpf(cpf);

  const { data: titular } = await supabase
      .from("titulares")
      .select("id")
      .eq("cpf", cpfLimpo)
      .maybeSingle();

  if (!titular) {
        return NextResponse.json({ error: "Codigo invalido ou expirado" }, { status: 401 });
  }

  const agoraISO = new Date().toISOString();

  const { data: codigoAcesso } = await supabase
      .from("codigos_acesso")
      .select("id, codigo, expires_at, used_at, tentativas")
      .eq("titular_id", titular.id)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (!codigoAcesso || codigoAcesso.expires_at < agoraISO) {
        return NextResponse.json({ error: "Codigo invalido ou expirado" }, { status: 401 });
  }

  if (codigoAcesso.tentativas >= 5) {
        return NextResponse.json(
          { error: "Numero maximo de tentativas excedido. Solicite um novo codigo." },
          { status: 429 }
              );
  }

  if (codigoAcesso.codigo !== codigo.trim()) {
        await supabase
          .from("codigos_acesso")
          .update({ tentativas: codigoAcesso.tentativas + 1 })
          .eq("id", codigoAcesso.id);
        return NextResponse.json({ error: "Codigo invalido ou expirado" }, { status: 401 });
  }

  await supabase
      .from("codigos_acesso")
      .update({ used_at: agoraISO })
      .eq("id", codigoAcesso.id);

  const sessao = criarSessao(titular.id);

  const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, sessao, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
    });

  return response;
}
