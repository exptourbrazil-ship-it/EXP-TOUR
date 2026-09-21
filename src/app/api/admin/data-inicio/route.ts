import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { barrarTitularForaDoEscopo, escopoTenantAdmin } from "@/lib/admin-tenant";

export const runtime = "nodejs";

// Rota administrativa para a equipe da EXP Tour definir manualmente a
// "data_inicio" (inicio do curso) de um titular, inclusive de clientes
// que ainda nao possuem contrato cadastrado. A data e gravada em
// titulares.data_inicio. A aba Inicio usa a data do contrato quando ela
// existe e, caso contrario, cai para esta data do titular.
//
// Autorizacao por capacidade, SO por sessao (checarCapacidadeAdmin): GET exige
// casos.ver; POST exige casos.gerir (escrita operacional de caso). NAO aceita o
// Bearer ADMIN_CAMBIO_SECRET — ver a nota abaixo.
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Lista os titulares (com a data de inicio ja gravada, se houver) para
// preencher o seletor no painel administrativo.
// Exige SESSAO com RBAC. NAO aceita o fallback Bearer ADMIN_CAMBIO_SECRET:
// esse segredo existe para cambio/cron. O caminho Bearer nao tem e-mail de
// sessao, entao a trilha atribui tudo a "bearer-secret" e o escopoTenantAdmin
// o promove a super-admin GLOBAL, atravessando as duas marcas. So as telas do
// admin chamam esta rota, por cookie.
export async function GET(request: Request) {
  if (!(await checarCapacidadeAdmin("casos.ver"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 403 });
  }

  const supabase = getSupabase();
  const escopo = await escopoTenantAdmin(supabase);
  let q = supabase
    .from("titulares")
    .select("id, nome_completo, email, data_inicio")
    .order("nome_completo", { ascending: true });
  // Listagem escopada: admin nao-global ve apenas os titulares do seu tenant.
  if (!escopo.global) q = q.eq("tenant_id", escopo.tenantId);
  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel listar os titulares." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, titulares: data || [] });
}

// Grava a data de inicio de um titular. Aceita data vazia para limpar.
export async function POST(request: Request) {
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const titularId = body?.titularId ? String(body.titularId) : null;
  const dataInicioRaw = body?.dataInicio ? String(body.dataInicio).trim() : "";

  if (!titularId) {
    return NextResponse.json({ ok: false, erro: "Informe 'titularId'." }, { status: 400 });
  }

  // Aceita YYYY-MM-DD ou vazio (para limpar a data).
  let dataInicio: string | null = null;
  if (dataInicioRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicioRaw)) {
      return NextResponse.json({ ok: false, erro: "Data invalida. Use o formato AAAA-MM-DD." }, { status: 400 });
    }
    const teste = new Date(dataInicioRaw + "T00:00:00");
    if (isNaN(teste.getTime())) {
      return NextResponse.json({ ok: false, erro: "Data invalida." }, { status: 400 });
    }
    dataInicio = dataInicioRaw;
  }

  const supabase = getSupabase();
  const barrado = await barrarTitularForaDoEscopo(supabase, titularId);
  if (barrado) return barrado;
  const { error } = await supabase
    .from("titulares")
    .update({ data_inicio: dataInicio })
    .eq("id", titularId);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Nao foi possivel salvar a data." }, { status: 500 });
  }

  const usuario = (await usuarioAdminAtual()) ?? "sessao-expirada";
  await registrarAuditoriaAdmin(supabase, {
    usuario,
    acao: "titular.data_inicio.definir",
    alvo: titularId,
    detalhe: { dataInicio },
    ip: obterIp(request),
  });

  return NextResponse.json({ ok: true });
}
