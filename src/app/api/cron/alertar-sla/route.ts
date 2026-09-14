import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { enviarAvisoInternoEmail } from "@/lib/email";
import { carregarPainelSLA } from "@/lib/sla-painel";
import { montarResumoAlertaSLA, type EntradaAlertaSLA } from "@/lib/sla-alerta";
import { resolverEscopoTenant } from "@/lib/cron-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alerta de SLA estourado (Vercel Cron, diario).
//
// Por que existe: a Fila do Dia e o painel /admin/sla ja mostram o prazo em dias
// uteis, mas so para quem ABRE a tela. Um SLA que estoura (ex.: documento sem
// analise ha mais dias uteis que o contrato promete, doc 18.6) ficava invisivel
// ate alguem olhar. Este cron fecha o laco: uma vez por dia, se houver excecao
// aberta com o SLA vencido, a equipe recebe um e-mail com a lista priorizada.
//
// Modelo de DIGEST (mesma escolha de alertar-eventos): UM e-mail por dia por
// tenant, com todos os estourados. Reenviar no dia seguinte e proposital — SLA
// que continua estourado continua sendo problema. Por ser resumo unico/dia, nao
// precisa de idempotencia por caso.
//
// Multi-tenant (ver docs/deploy-multi-tenant.md): carregarPainelSLA ja escopa
// pelo tenant do deploy (membershipDoTenant) e FALHA FECHADA se o tenant nao
// resolver. O assunto leva o nome do tenant.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret) {
    console.error("CRON_SECRET nao configurado: execucao do cron recusada.");
    return NextResponse.json({ ok: false, erro: "Cron nao configurado" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  // Nome do tenant do deploy para o assunto. Falha FECHADA: sem tenant resolvido
  // nao processa (mesma postura do painel e dos demais crons multi-tenant).
  let marca: string;
  try {
    const escopo = await resolverEscopoTenant(supabase);
    marca = await nomeDoTenant(supabase, escopo.tenantId, escopo.slug);
  } catch (err) {
    console.error("[alertar-sla] falha ao resolver tenant:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Tenant nao resolvido" }, { status: 500 });
  }

  let painel;
  try {
    painel = await carregarPainelSLA(supabase);
  } catch (err) {
    console.error("[alertar-sla] falha ao carregar painel de SLA:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Falha ao carregar painel" }, { status: 500 });
  }

  const estourados: EntradaAlertaSLA[] = painel.linhas
    .filter((l) => l.status === "vencido")
    .map((l) => ({
      tipoLabel: l.tipoLabel,
      titularNome: l.titularNome,
      titularId: l.titularId,
      atrasoDiasUteis: l.atrasoDiasUteis,
    }));

  const resumo = montarResumoAlertaSLA({
    estourados,
    venceHoje: painel.contadores.venceHoje,
    marca,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });

  // Nada estourado: nao envia (silencio = tudo no prazo).
  if (!resumo) {
    return NextResponse.json({ ok: true, estourados: 0, vence_hoje: painel.contadores.venceHoje, alertado: false });
  }

  // Best-effort: se o e-mail falhar, registra mas nao derruba o cron (o painel
  // continua sendo a fonte de verdade; o alerta e um empurrao).
  let alertado = false;
  try {
    await enviarAvisoInternoEmail(resumo.assunto, resumo.texto);
    alertado = true;
  } catch (err) {
    console.error("[alertar-sla] falha ao enviar alerta interno:", err instanceof Error ? err.message : "erro");
  }

  return NextResponse.json({
    ok: true,
    estourados: estourados.length,
    vence_hoje: painel.contadores.venceHoje,
    alertado,
  });
}

// Nome de marca do tenant para o assunto (fallback: slug). Mesmo padrao de
// alertar-eventos.
async function nomeDoTenant(supabase: SupabaseClient, tenantId: string, slug: string): Promise<string> {
  const { data } = await supabase.from("tenant").select("name").eq("id", tenantId).maybeSingle();
  const nome = (data as { name?: string } | null)?.name;
  return (nome && nome.trim()) || slug;
}
