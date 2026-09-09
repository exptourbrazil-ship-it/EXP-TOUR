import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { enviarAvisoInternoEmail } from "@/lib/email";
import { montarResumoAlerta, JANELA_ALERTA_HORAS, type EventoComErro } from "@/lib/alerta-eventos";
import { resolverEscopoTenant, membershipDoTenant, type MembershipTenant } from "@/lib/cron-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alerta de eventos com erro (Vercel Cron, diario).
//
// Por que existe: nao havia canal de alerta nenhum no projeto. O unico sinal de
// que algo quebrou — assinatura invalida do webhook, falha ao processar um
// pagamento — era uma linha na tabela `events`, visivel apenas para quem
// abrisse /admin/sistema e olhasse. Foi exatamente essa cegueira que deixou 8
// pagamentos e R$ 13 mil passarem despercebidos por semanas: o webhook estava
// configurado na aplicacao errada do Mercado Pago, toda notificacao levava 401,
// e nada avisava ninguem.
//
// Este cron fecha o laco: uma vez por dia, se houver evento com status "erro"
// na janela, a equipe recebe um e-mail com o resumo. Nao substitui um APM de
// verdade, mas troca "alguem precisa lembrar de olhar" por "alguem e avisado".
//
// Alertar de novo no dia seguinte e proposital: evento que continua com erro
// continua sendo problema, e o silencio nao deve ser confundido com resolucao.
//
// Multi-tenant (ver docs/deploy-multi-tenant.md): `events` nao tem tenant_id.
// Atribuimos cada evento a um tenant pela entidade referenciada (payment id ->
// parcela -> contrato; contrato/fornecedor para eventos do Portal do Fornecedor)
// e alertamos so os do tenant do deploy. O deploy do tenant LEGADO tambem alerta
// os NAO atribuiveis (external_id nulo ou entidade inexistente), para nenhuma
// falha ficar sem dono — que e a razao de este cron existir.
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

  let escopo: Awaited<ReturnType<typeof resolverEscopoTenant>>;
  let membership: MembershipTenant;
  try {
    escopo = await resolverEscopoTenant(supabase);
    membership = await membershipDoTenant(supabase, escopo);
  } catch (err) {
    console.error("[alertar-eventos] falha ao resolver tenant:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Tenant nao resolvido" }, { status: 500 });
  }

  const desdeISO = new Date(Date.now() - JANELA_ALERTA_HORAS * 3600 * 1000).toISOString();

  // Teto ALTO (nao 50): o filtro por tenant so acontece DEPOIS de ler. Com um teto
  // baixo, um tenant "barulhento" encheria a janela com os proprios erros e
  // esconderia os do outro tenant (e os orfaos) — falha justamente do tipo que este
  // cron existe para nao deixar passar. Dimensionado bem acima do volume diario
  // somado dos dois tenants; se for atingido, registra para subir o teto/paginar.
  const TETO_EVENTOS = 1000;
  const { data: eventos, error } = await supabase
    .from("events")
    .select("id, source, event_type, external_id, erro, tentativas, updated_at")
    .eq("status", "erro")
    .gte("updated_at", desdeISO)
    .order("updated_at", { ascending: false })
    .limit(TETO_EVENTOS);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao ler eventos: " + error.message }, { status: 500 });
  }
  if ((eventos ?? []).length >= TETO_EVENTOS) {
    console.error(
      `[alertar-eventos] teto de ${TETO_EVENTOS} eventos com erro atingido na janela; ` +
        `eventos alem do teto podem nao ser alertados. Subir o teto ou paginar por updated_at.`
    );
  }

  if (!eventos || eventos.length === 0) {
    return NextResponse.json({ ok: true, eventos: 0, alertado: false });
  }

  // Filtra os eventos deste tenant (+ os orfaos, no deploy legado).
  const doTenant = await filtrarEventosDoTenant(supabase, membership, escopo.incluiLegado, eventos as EventoComErroRow[]);

  if (doTenant.length === 0) {
    return NextResponse.json({ ok: true, eventos: eventos.length, do_tenant: 0, alertado: false });
  }

  const texto = montarResumoAlerta(doTenant as EventoComErro[], JANELA_ALERTA_HORAS);
  const marca = await nomeDoTenant(supabase, membership.tenantId, escopo.slug);

  try {
    await enviarAvisoInternoEmail(
      `[${marca}] ${doTenant.length} evento(s) com erro nas ultimas ${JANELA_ALERTA_HORAS}h`,
      texto
    );
  } catch (err) {
    // Falhar aqui e grave: o alerta e a ultima linha de defesa. Devolvemos 500
    // para o log da Vercel registrar, em vez de responder ok e sumir.
    console.error("[alertar-eventos] falha ao enviar o alerta:", err);
    return NextResponse.json(
      { ok: false, eventos: doTenant.length, erro: "Falha ao enviar o alerta." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, eventos: eventos.length, do_tenant: doTenant.length, alertado: true });
}

type EventoComErroRow = EventoComErro & { id: string };

// Atribui cada evento com erro a um tenant pela entidade referenciada e devolve
// os que pertencem a ESTE tenant. No deploy do tenant legado, inclui tambem os
// eventos NAO atribuiveis (external_id nulo ou entidade inexistente), para que
// nenhuma falha fique sem alerta.
async function filtrarEventosDoTenant(
  supabase: SupabaseClient,
  membership: MembershipTenant,
  incluiLegado: boolean,
  eventos: EventoComErroRow[]
): Promise<EventoComErroRow[]> {
  const contratoSet = new Set(membership.contratoIds);
  const supplierSet = new Set(membership.supplierIds);

  // Coleta os external_ids por "forma de atribuicao".
  const mpIds = new Set<string>(); // payment ids (source mercadopago)
  const entIds = new Set<string>(); // contrato/supplier ids (demais fontes)
  for (const ev of eventos) {
    if (!ev.external_id) continue;
    if (ev.source === "mercadopago") mpIds.add(ev.external_id);
    // Qualquer outra fonte (portal_fornecedor, supplier, portal, admin, ...): o
    // external_id costuma ser um contrato_id ou supplier_id — tentamos atribuir
    // pela entidade. Se nao casar, cai em "orfao" (so o deploy legado alerta).
    else entIds.add(ev.external_id);
  }

  // mercadopago: payment id -> contrato_id (via parcela). Consulta NAO escopada
  // (para distinguir "outro tenant" de "orfao"): existe parcela? de qual contrato?
  const paymentContrato = new Map<string, string>();
  for (const lote of lotes([...mpIds], 500)) {
    const { data } = await supabase
      .from("parcelas")
      .select("external_payment_id, contrato_id")
      .in("external_payment_id", lote);
    for (const r of data ?? []) {
      const pid = (r as { external_payment_id: string | null }).external_payment_id;
      const cid = (r as { contrato_id: string | null }).contrato_id;
      if (pid && cid) paymentContrato.set(String(pid), String(cid));
    }
  }

  // Demais fontes: o external_id costuma ser um contrato_id ou supplier_id.
  // Descobre se existe (qualquer tenant) para separar "outro tenant" de "orfao".
  const contratosExistentes = new Set<string>();
  const suppliersExistentes = new Set<string>();
  if (entIds.size > 0) {
    for (const lote of lotes([...entIds], 500)) {
      const { data: cs } = await supabase.from("contratos").select("id").in("id", lote);
      for (const r of cs ?? []) contratosExistentes.add(String((r as { id: string }).id));
      const { data: ss } = await supabase.from("supplier").select("id").in("id", lote);
      for (const r of ss ?? []) suppliersExistentes.add(String((r as { id: string }).id));
    }
  }

  const out: EventoComErroRow[] = [];
  for (const ev of eventos) {
    const atrib = atribuirEvento(ev, {
      contratoSet,
      supplierSet,
      paymentContrato,
      contratosExistentes,
      suppliersExistentes,
    });
    if (atrib === "tenant" || (incluiLegado && atrib === "orfao")) out.push(ev);
  }
  return out;
}

type Atribuicao = "tenant" | "outro" | "orfao";

function atribuirEvento(
  ev: EventoComErroRow,
  ctx: {
    contratoSet: Set<string>;
    supplierSet: Set<string>;
    paymentContrato: Map<string, string>;
    contratosExistentes: Set<string>;
    suppliersExistentes: Set<string>;
  }
): Atribuicao {
  const ext = ev.external_id;
  if (!ext) return "orfao"; // sem referencia: nao ha como atribuir

  if (ev.source === "mercadopago") {
    const contrato = ctx.paymentContrato.get(ext);
    if (!contrato) return "orfao"; // pagamento sem parcela conhecida
    return ctx.contratoSet.has(contrato) ? "tenant" : "outro";
  }

  // Demais fontes (portal_fornecedor, supplier, portal, admin, zoho_sign, ...):
  // tenta atribuir pelo external_id como contrato_id ou supplier_id. Se o id nao
  // existe em nenhum tenant (ou tem outra forma — ex.: id de ficha/quote), fica
  // orfao e so o deploy legado alerta (nenhuma falha e descartada).
  if (ctx.contratoSet.has(ext) || ctx.supplierSet.has(ext)) return "tenant";
  if (ctx.contratosExistentes.has(ext) || ctx.suppliersExistentes.has(ext)) return "outro";
  return "orfao";
}

function lotes<T>(itens: T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) out.push(itens.slice(i, i + tamanho));
  return out;
}

// Nome de marca do tenant para o assunto do alerta (fallback: slug).
async function nomeDoTenant(supabase: SupabaseClient, tenantId: string, slug: string): Promise<string> {
  const { data } = await supabase.from("tenant").select("name").eq("id", tenantId).maybeSingle();
  return (data?.name as string) || slug;
}
