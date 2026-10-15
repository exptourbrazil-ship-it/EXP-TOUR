import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { criarSessao, SESSION_COOKIE } from "@/lib/session";
import { conferirCodigoAcesso } from "@/lib/codigo-acesso";
import { resolverEscopoTenant } from "@/lib/cron-tenant";
import { tenantPertenceAoDeploy } from "@/lib/login-tenant";
import { checarELimitar, obterIp } from "@/lib/rate-limit";

// Rate limit anti forca bruta do codigo de 6 digitos (janela de 10 min), alem do
// limite de 5 tentativas por codigo. Por IP e por CPF; configuravel por env. O
// teto por CPF acomoda os 3 codigos que o request-code libera na mesma janela
// (3 x 5 tentativas).
const RL_JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const RL_VERIFY_IP = Number(process.env.RATE_LIMIT_VERIFY_CODE_IP || "30");
const RL_VERIFY_CPF = Number(process.env.RATE_LIMIT_VERIFY_CODE_CPF || "15");

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

  // Rate limit ANTES de qualquer leitura do codigo. Falha FECHADA: sem o contador
  // nao ha defesa contra forca bruta. O registro do hit vem antes da contagem
  // (ver checarELimitar), entao rajadas paralelas nao rendem palpites extras.
  const erro429 = NextResponse.json(
    { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
    { status: 429 }
  );
  const ip = obterIp(request);
  if (!(await checarELimitar(supabase, `verify-code:ip:${ip}`, RL_VERIFY_IP, RL_JANELA_SEG, Date.now(), true))) {
    return erro429;
  }
  if (!(await checarELimitar(supabase, `verify-code:cpf:${cpfLimpo}`, RL_VERIFY_CPF, RL_JANELA_SEG, Date.now(), true))) {
    return erro429;
  }

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

  // Reserva a tentativa ANTES de comparar, de forma atomica (compare-and-set no
  // contador lido). Requisicoes paralelas leem o mesmo valor, mas so UMA vence o
  // update: as demais nao chegam a comparar palpite nenhum. Assim o teto de 5
  // tentativas por codigo vale tambem sob concorrencia. Falha FECHADA: erro do
  // banco ou update sem linha afetada recusa a tentativa.
  const { data: reservada } = await supabase
      .from("codigos_acesso")
      .update({ tentativas: codigoAcesso.tentativas + 1 })
      .eq("id", codigoAcesso.id)
      .eq("tentativas", codigoAcesso.tentativas)
      .is("used_at", null)
      .select("id");
  if (!reservada || reservada.length === 0) {
        return NextResponse.json(
          { error: "Não foi possível validar agora. Aguarde um instante e tente novamente." },
          { status: 429 }
        );
  }

  if (!conferirCodigoAcesso(codigo, codigoAcesso as any)) {
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
  }

  // Consome o codigo de forma condicional: so abre sessao quem de fato marcou
  // used_at (um mesmo codigo nao abre duas sessoes em paralelo).
  const { data: consumido } = await supabase
      .from("codigos_acesso")
      .update({ used_at: agoraISO })
      .eq("id", codigoAcesso.id)
      .is("used_at", null)
      .select("id");
  if (!consumido || consumido.length === 0) {
        return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
  }

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
