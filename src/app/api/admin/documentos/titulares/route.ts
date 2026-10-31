import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { escopoTenantAdmin } from "@/lib/admin-tenant";
import { prepararBuscaNome } from "@/lib/busca-titular";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Busca de titular POR NOME para a tela /admin/documentos (antes era por CPF).
// Devolve poucos campos: id, nome, e-mail e so o FINAL do CPF (para distinguir
// homonimos sem expor o documento inteiro). Respeita o escopo de tenant.
export async function GET(request: Request) {
  if (!(await checarCapacidadeAdmin("documentos.analisar"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado" }, { status: 403 });
  }

  const termo = prepararBuscaNome(new URL(request.url).searchParams.get("q"));
  if (!termo) {
    return NextResponse.json({ ok: false, error: "Digite ao menos 3 letras do nome." }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  let consulta = supabase
    .from("titulares")
    .select("id, nome_completo, email, cpf")
    .ilike("nome_completo", `%${termo}%`)
    .order("nome_completo", { ascending: true })
    .limit(10);

  const escopo = await escopoTenantAdmin(supabase);
  if (!escopo.global) consulta = consulta.eq("tenant_id", escopo.tenantId);

  const { data, error } = await consulta;
  if (error) {
    console.error("[documentos/titulares] busca por nome:", error.message);
    return NextResponse.json({ ok: false, error: "Falha ao buscar clientes" }, { status: 500 });
  }

  // O termo digitado e PII em potencial: a auditoria guarda so a contagem.
  await registrarAuditoriaAdmin(supabase, {
    usuario: (await usuarioAdminAtual()) ?? "sessao-expirada",
    acao: "documento.buscar_titular",
    alvo: "busca-por-nome",
    detalhe: { quantidade: (data ?? []).length },
    ip: obterIp(request),
  });

  const titulares = (data ?? []).map((t) => ({
    id: t.id as string,
    nome_completo: (t.nome_completo as string | null) ?? "(sem nome)",
    email: (t.email as string | null) ?? null,
    cpf_final: String(t.cpf ?? "").replace(/\D/g, "").slice(-4) || null,
  }));
  return NextResponse.json({ ok: true, titulares });
}
