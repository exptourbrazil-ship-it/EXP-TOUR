import { NextResponse } from "next/server";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { obterIp } from "@/lib/rate-limit";
import { arquivarTitular, desarquivarTitular, CadastroInvalido } from "@/lib/cadastro-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/clientes/[id]/arquivar — arquiva o cliente (soft-delete
// reversivel). DELETE — desarquiva. Escrita operacional: exige casos.gerir.
// NAO apaga historico; para exclusao definitiva/PII use a anonimizacao (LGPD).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, erro: "Cliente inválido." }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { motivo?: unknown } | null;
  const motivo = body && typeof body.motivo === "string" ? body.motivo : null;

  try {
    const r = await arquivarTitular({
      titularId: id,
      motivo,
      autor: (await usuarioAdminAtual()) ?? "admin",
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof CadastroInvalido) {
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: err.message }, { status: 400 });
    }
    console.error("[admin/clientes/arquivar] erro:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro interno ao arquivar o cliente." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checarCapacidadeAdmin("casos.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ ok: false, erro: "Cliente inválido." }, { status: 400 });

  try {
    const r = await desarquivarTitular({
      titularId: id,
      autor: (await usuarioAdminAtual()) ?? "admin",
      ip: obterIp(request),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (err instanceof CadastroInvalido) {
      return NextResponse.json({ ok: false, motivo: err.codigo, erro: err.message }, { status: 400 });
    }
    console.error("[admin/clientes/desarquivar] erro:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, erro: "Erro interno ao desarquivar o cliente." }, { status: 500 });
  }
}
