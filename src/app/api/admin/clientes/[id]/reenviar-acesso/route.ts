import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { checarELimitar, obterIp } from "@/lib/rate-limit";
import { hashCodigoAcesso, gerarCodigoAcesso } from "@/lib/codigo-acesso";
import { enviarCodigoAcessoEmail } from "@/lib/email";

export const runtime = "nodejs";

// Janela/limite anti-abuso do reenvio de acesso pelo admin: no maximo N por
// titular por janela (evita disparo repetido, acidental ou nao).
const RL_JANELA_SEG = Number(process.env.RATE_LIMIT_JANELA_SEG || "600");
const RL_REENVIO = Number(process.env.RATE_LIMIT_REENVIO_ACESSO || "5");

// Reenvia o codigo de acesso da Area do Cliente para o titular (Caso 360, aba
// Acoes). Gera um novo codigo de 6 digitos, invalida os anteriores em aberto,
// grava apenas o HMAC e envia por e-mail. Autorizacao por capacidade
// (casos.gerir); acao registrada na trilha.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Mint de credencial (novo codigo de acesso do cliente) e uma primitiva
  // sensivel: exige sessao de admin com RBAC de verdade. NAO aceita o fallback
  // Bearer ADMIN_CAMBIO_SECRET — esse segredo (cambio/cron) daria a qualquer
  // portador o poder de disparar acesso na conta de qualquer titular.
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "Informe o titular" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: titular } = await supabase
    .from("titulares")
    .select("id, nome_completo, email")
    .eq("id", id)
    .maybeSingle();
  if (!titular) {
    return NextResponse.json({ ok: false, error: "Titular nao encontrado" }, { status: 404 });
  }
  if (!titular.email) {
    return NextResponse.json(
      { ok: false, error: "Este titular nao tem e-mail cadastrado" },
      { status: 400 }
    );
  }

  // Falha FECHADA: esta superficie emite credencial de acesso. Sem o contador
  // (erro transitorio no banco) e melhor bloquear do que permitir disparo
  // ilimitado de codigos e e-mails.
  if (
    !(await checarELimitar(supabase, `reenvio-acesso:${titular.id}`, RL_REENVIO, RL_JANELA_SEG, Date.now(), true))
  ) {
    return NextResponse.json(
      { ok: false, error: "Muitos reenvios recentes para este titular. Aguarde alguns minutos." },
      { status: 429 }
    );
  }

  const codigo = gerarCodigoAcesso();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Invalida os codigos anteriores ainda abertos deste titular (mesmo padrao do
  // request-code do cliente): so um codigo valido por vez.
  await supabase
    .from("codigos_acesso")
    .update({ used_at: new Date().toISOString() })
    .eq("titular_id", titular.id)
    .is("used_at", null);

  // Grava apenas o HMAC; o codigo em claro so existe no e-mail do cliente.
  const { error: insErr } = await supabase.from("codigos_acesso").insert({
    titular_id: titular.id,
    codigo_hash: hashCodigoAcesso(codigo),
    expires_at: expiresAt,
  });
  if (insErr) {
    console.error("[reenviar-acesso] falha ao gravar o codigo de acesso:", insErr.message);
    return NextResponse.json(
      { ok: false, error: "Nao foi possivel gerar o codigo agora. Tente novamente." },
      { status: 500 }
    );
  }

  const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "titular.acesso.reenviar",
    alvo: titular.id,
    detalhe: { destinatario: titular.email },
    ip: obterIp(request),
  });

  try {
    await enviarCodigoAcessoEmail(titular.email, titular.nome_completo || "", codigo);
  } catch {
    // Nao logamos o erro cru: a mensagem do provedor pode conter o e-mail do
    // titular (PII). A falha ja fica registrada, com detalhe, em email_logs.
    console.error("[reenviar-acesso] falha ao enviar codigo por email (ver email_logs)");
    return NextResponse.json(
      { ok: false, error: "Codigo gerado, mas o envio do e-mail falhou. Tente novamente." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
