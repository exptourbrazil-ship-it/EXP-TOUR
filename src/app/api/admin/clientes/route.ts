import { NextResponse } from "next/server";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { criarTitular, CadastroInvalido } from "@/lib/cadastro-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/clientes — cria um cliente (titular) manualmente. Escrita
// cadastral operacional: exige casos.gerir (gestor/operacao). CPF ja existente
// nao e sobrescrito (409 duplicado). Auditado. O contrato e criado depois.
export async function POST(request: Request) {
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    nome_completo?: unknown;
    cpf?: unknown;
    email?: unknown;
    telefone?: unknown;
    data_inicio?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  }

  try {
    const r = await criarTitular({
      nome_completo: String(body.nome_completo ?? ""),
      cpf: String(body.cpf ?? ""),
      email: body.email == null ? null : String(body.email),
      telefone: body.telefone == null ? null : String(body.telefone),
      data_inicio: body.data_inicio == null ? null : String(body.data_inicio),
      autor: (await usuarioAdminAtual()) ?? "admin",
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof CadastroInvalido) {
      const status = err.codigo === "duplicado" ? 409 : 400;
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: err.message }, { status });
    }
    console.error("[admin/clientes] erro ao criar titular:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro interno ao criar o cliente." }, { status: 500 });
  }
}
