import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { obterIp, checarELimitar } from "@/lib/rate-limit";
import { normalizarCpf } from "@/lib/cpf";
import { registrarMatricula, MatriculaInvalida } from "@/lib/matricula-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/orcamento/matricula — PUBLICA (lead-facing). Grava o LEAD do checkout
// e vincula a um titular existente (nao cria conta login-capavel aqui: seria
// tomada de conta a partir de superficie nao verificada). Rate-limit FECHA em
// falha (identidade/PII), por IP e por CPF.
function mensagem(codigo: string): string {
  switch (codigo) {
    case "nome_obrigatorio": return "Informe o nome do titular.";
    case "cpf_invalido": return "Informe um CPF válido.";
    case "email_invalido": return "Informe um e-mail válido.";
    case "programa_invalido": return "Programa inválido.";
    case "aceite_obrigatorio": return "É preciso aceitar os termos e condições.";
    default: return "Não foi possível encaminhar a matrícula. Tente novamente.";
  }
}

export async function POST(request: Request) {
  const ip = obterIp(request);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const body = (await request.json().catch(() => null)) as {
    titularNome?: unknown; cpf?: unknown; email?: unknown; telefone?: unknown;
    participanteNome?: unknown; programaId?: unknown; programaNome?: unknown; escola?: unknown;
    params?: unknown; aceite?: unknown;
  } | null;
  if (!body) return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });

  // Rate-limit FECHA em falha (superficie de identidade): por IP (10/h) e por
  // CPF (3/h) — barra criacao em massa mesmo com rotacao de IP.
  const okIp = await checarELimitar(supabase, `matricula-ip:${ip}`, 10, 3600, Date.now(), true);
  const cpfDigitos = normalizarCpf(body.cpf);
  const okCpf = cpfDigitos.length === 11
    ? await checarELimitar(supabase, `matricula-cpf:${cpfDigitos}`, 3, 3600, Date.now(), true)
    : true;
  if (!okIp || !okCpf) {
    return NextResponse.json({ ok: false, erro: "Muitos pedidos. Tente novamente em alguns minutos." }, { status: 429 });
  }

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
      aceite: body.aceite === true,
      ip,
    });
    return NextResponse.json({ ok: true, leadId: r.leadId });
  } catch (err) {
    if (err instanceof MatriculaInvalida) {
      const status = err.codigo.startsWith("falha_") ? 500 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: mensagem(err.codigo) }, { status });
    }
    console.error("[orcamento/matricula] erro interno ao registrar matricula");
    return NextResponse.json({ ok: false, erro: "Erro interno." }, { status: 500 });
  }
}
