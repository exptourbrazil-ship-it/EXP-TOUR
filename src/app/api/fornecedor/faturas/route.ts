import { NextResponse } from "next/server";
import { contextoFornecedorFatura } from "@/lib/fornecedor-faturas-api";
import { listarFaturasDaEscola } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Faturas de comissao da EXP Tour para a escola da sessao (emitidas/enviadas/pagas).
export async function GET() {
  const c = await contextoFornecedorFatura();
  if (!c.ok) return c.res;
  const faturas = await listarFaturasDaEscola(c.supabase, c.tenantId, c.sessao.supplierId);
  return NextResponse.json({ ok: true, faturas });
}
