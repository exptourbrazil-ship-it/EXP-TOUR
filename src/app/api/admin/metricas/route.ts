import { NextResponse } from "next/server";
import { checarCapacidadeRequest } from "@/lib/admin-guard";
import { carregarFinanceiro } from "@/lib/admin-financeiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Metricas financeiras + lista de parcelas para o painel admin. Toda a logica
// de query e agregacao vive em carregarFinanceiro (server-only); aqui so
// checamos a sessao e devolvemos o JSON. Autenticacao: sessao de admin (ou
// Bearer de compatibilidade).
export async function GET(request: Request) {
  if (!(await checarCapacidadeRequest(request, "financeiro.ver"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  try {
    const dados = await carregarFinanceiro();
    return NextResponse.json({ ok: true, ...dados });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, erro: err?.message || "Falha ao carregar dados financeiros." },
      { status: 500 }
    );
  }
}
