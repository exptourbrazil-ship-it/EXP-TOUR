import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { obterIp, checarELimitar } from "@/lib/rate-limit";
import { registrarMatricula, MatriculaInvalida } from "@/lib/matricula-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/orcamento/matricula — PUBLICA (lead-facing). O lead encaminha a
// matricula do checkout: cria/acha o titular pelo CPF (conta da Area do Cliente)
// e grava o lead. Nao cria contrato nem cobranca (proximo passo). Rate-limit por IP.
function mensagem(codigo: string): string {
  switch (codigo) {
    case "nome_obrigatorio": return "Informe o nome do titular.";
    case "cpf_invalido": return "Informe um CPF válido.";
    case "email_invalido": return "Informe um e-mail válido.";
    case "programa_obrigatorio": return "Programa não informado.";
    default: return "Não foi possível encaminhar a matrícula. Tente novamente.";
  }
}

export async function POST(request: Request) {
  const ip = obterIp(request);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  // No maximo 10 pedidos por IP por hora (falha aberta em problema transitorio).
  const permitido = await checarELimitar(supabase, `matricula:${ip}`, 10, 3600);
  if (!permitido) {
    return NextResponse.json({ ok: false, erro: "Muitos pedidos. Tente novamente em alguns minutos." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    titularNome?: unknown; cpf?: unknown; email?: unknown; telefone?: unknown;
    participanteNome?: unknown; programaId?: unknown; programaNome?: unknown; escola?: unknown;
    params?: unknown;
  } | null;
  if (!body) return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });

  try {
    const r = await registrarMatricula({
      titularNome: String(body.titularNome ?? ""),
      cpf: String(body.cpf ?? ""),
      email: String(body.email ?? ""),
      telefone: body.telefone == null ? null : String(body.telefone),
      participanteNome: body.participanteNome == null ? null : String(body.participanteNome),
      programaId: String(body.programaId ?? ""),
      programaNome: body.programaNome == null ? null : String(body.programaNome),
      escola: body.escola == null ? null : String(body.escola),
      params: body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : null,
      ip,
    });
    return NextResponse.json({ ok: true, titularId: r.titularId, leadId: r.leadId });
  } catch (err) {
    if (err instanceof MatriculaInvalida) {
      const status = err.codigo.startsWith("falha_") ? 500 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: mensagem(err.codigo) }, { status });
    }
    console.error("[orcamento/matricula] erro:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro interno." }, { status: 500 });
  }
}
