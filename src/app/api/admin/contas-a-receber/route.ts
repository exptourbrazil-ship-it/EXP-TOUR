import { NextResponse } from "next/server";
import { contextoAdminFatura, ehUuid } from "@/lib/admin-contas-a-receber-api";
import { barrarContratoForaDoEscopo, barrarSupplierForaDoEscopo } from "@/lib/admin-tenant";
import { criarFatura, listarFaturas, sugerirDoCaso, totaisPorMoeda } from "@/lib/comissao-fatura-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  : lista as faturas de comissao + totais em aberto por moeda
//        (?sugerir=<contratoId> devolve os dados do caso para preencher o formulario).
// POST : cria a fatura (rascunho) a partir do que o aluno pagou direto a escola.
export async function GET(request: Request) {
  const c = await contextoAdminFatura(request, "financeiro.ver");
  if (!c.ok) return c.res;
  const { supabase, tenantId } = c.ctx;
  const url = new URL(request.url);
  const sugerir = url.searchParams.get("sugerir");
  if (sugerir) {
    if (!ehUuid(sugerir)) return NextResponse.json({ ok: false, erro: "Caso inválido." }, { status: 400 });
    const barrado = await barrarContratoForaDoEscopo(supabase, sugerir);
    if (barrado) return barrado;
    const s = await sugerirDoCaso(supabase, tenantId, sugerir);
    if (!s) return NextResponse.json({ ok: false, erro: "Caso não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true, sugestao: s });
  }
  const faturas = await listarFaturas(supabase, tenantId);
  return NextResponse.json({ ok: true, faturas, totais: totaisPorMoeda(faturas) });
}

export async function POST(request: Request) {
  const c = await contextoAdminFatura(request, "financeiro.gerir");
  if (!c.ok) return c.res;
  const { supabase, tenantId, adminUser, ip } = c.ctx;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, erro: "Corpo inválido." }, { status: 400 });
  // Normaliza os ids ANTES de checar o escopo: o validador tambem faz trim, e um id com
  // espaco nas pontas nao pode pular o barrar* e ainda passar na validacao.
  for (const k of ["supplierId", "contratoId"] as const) {
    if (typeof body[k] === "string") body[k] = (body[k] as string).trim();
  }

  // Isolamento por tenant: escola e caso precisam estar no escopo do admin.
  if (ehUuid(body.supplierId)) {
    const b = await barrarSupplierForaDoEscopo(supabase, body.supplierId);
    if (b) return b;
  }
  if (ehUuid(body.contratoId)) {
    const b = await barrarContratoForaDoEscopo(supabase, body.contratoId);
    if (b) return b;
  }
  const r = await criarFatura(supabase, { tenantId, adminUser, ip, entrada: body });
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id, numero: r.numero });
}
