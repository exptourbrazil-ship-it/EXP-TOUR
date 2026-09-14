import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarSessao, SESSION_COOKIE } from "@/lib/session";
import { conferirCodigoAcesso } from "@/lib/codigo-acesso";
import { resolverEscopoTenant } from "@/lib/cron-tenant";
import { tenantPertenceAoDeploy } from "@/lib/login-tenant";

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
        return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  const cpfLimpo = limparCpf(cpf);

  const { data: titular } = await supabase
      .from("titulares")
      .select("id, tenant_id")
      .eq("cpf", cpfLimpo)
      .maybeSingle();

  if (!titular) {
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
  }

  // Escopo do deploy: no modelo de dois deploys sobre o mesmo banco, este deploy
  // só abre sessão para titulares do SEU tenant (+ legado, se for o dono). É o
  // ponto onde a sessão é emitida — o gate mais importante. Um titular de outro
  // tenant recebe a MESMA resposta de código inválido (não revela que o CPF
  // existe em outro tenant). Falha FECHADA: sem escopo, não abre sessão.
  //
  // O erro de resolução também responde com o MESMO 401 genérico (não um 503):
  // um CPF inexistente já sai em 401 acima, então distinguir aqui (503 "existe"
  // vs 401 "não existe") viraria um oráculo de enumeração de CPF na janela de
  // env ausente. Mesma resposta = fecha sem vazar.
  let escopo;
  try {
        escopo = await resolverEscopoTenant(supabase);
  } catch {
        console.error("[verify-code] escopo de tenant indisponivel; login recusado");
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
  }
  if (!tenantPertenceAoDeploy(titular.tenant_id, escopo.tenantId, escopo.incluiLegado)) {
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
  }

  const agoraISO = new Date().toISOString();

  const { data: codigoAcesso } = await supabase
      .from("codigos_acesso")
      .select("id, codigo, codigo_hash, expires_at, used_at, tentativas")
      .eq("titular_id", titular.id)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (!codigoAcesso || codigoAcesso.expires_at < agoraISO) {
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
  }

  if (codigoAcesso.tentativas >= 5) {
        return NextResponse.json(
          { error: "Número máximo de tentativas excedido. Solicite um novo código." },
          { status: 429 }
              );
  }

  if (!conferirCodigoAcesso(codigo, codigoAcesso as any)) {
        await supabase
          .from("codigos_acesso")
          .update({ tentativas: codigoAcesso.tentativas + 1 })
          .eq("id", codigoAcesso.id);
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
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
