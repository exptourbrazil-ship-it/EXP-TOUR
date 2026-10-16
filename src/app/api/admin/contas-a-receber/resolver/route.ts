import { NextResponse } from "next/server";
import { contextoAdminFatura, ehUuid } from "@/lib/admin-contas-a-receber-api";
import { barrarSupplierForaDoEscopo } from "@/lib/admin-tenant";
import { listarProdutosDaEscola, resolverRegrasParaTela } from "@/lib/comissao-fatura-service";
import { KINDS_COMISSAO } from "@/lib/comissao-regra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Para a tela de fatura: produtos da escola (seletor) e a regra de comissao aplicavel a
// cada item {kind, productId} — produto > tipo > padrao. Somente leitura (financeiro.ver).
export async function POST(request: Request) {
  const c = await contextoAdminFatura(request, "financeiro.ver");
  if (!c.ok) return c.res;
  const body = (await request.json().catch(() => null)) as { supplierId?: unknown; itens?: unknown } | null;
  const supplierId = typeof body?.supplierId === "string" ? body.supplierId.trim() : "";
  if (!ehUuid(supplierId)) return NextResponse.json({ ok: false, erro: "Escola inválida." }, { status: 400 });
  const barrado = await barrarSupplierForaDoEscopo(c.ctx.supabase, supplierId);
  if (barrado) return barrado;
  const brutos = Array.isArray(body?.itens) ? (body!.itens as unknown[]).slice(0, 20) : [];
  const itens = brutos.map((x) => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return {
      kind: typeof o.kind === "string" && (KINDS_COMISSAO as readonly string[]).includes(o.kind) ? o.kind : null,
      productId: typeof o.productId === "string" && ehUuid(o.productId.trim()) ? o.productId.trim() : null,
    };
  });
  const [regras, produtos] = await Promise.all([
    itens.length ? resolverRegrasParaTela(c.ctx.supabase, c.ctx.tenantId, supplierId, itens) : Promise.resolve([]),
    listarProdutosDaEscola(c.ctx.supabase, c.ctx.tenantId, supplierId),
  ]);
  return NextResponse.json({ ok: true, regras, produtos });
}
