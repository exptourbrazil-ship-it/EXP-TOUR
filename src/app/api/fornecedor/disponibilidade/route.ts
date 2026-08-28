import { NextResponse } from "next/server";
import { sessaoFornecedorAtual } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { tenantIdAtual } from "@/lib/catalog-service";
import { validarPrograma, validarIntake } from "@/lib/disponibilidade";
import {
  criarPrograma,
  arquivarPrograma,
  salvarIntake,
  removerIntake,
} from "@/lib/catalog-disponibilidade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Endpoint unico da Disponibilidade no Portal do Fornecedor. Despacha por `acao`:
// criar_programa | arquivar_programa | salvar_intake | remover_intake.
// Self-service da escola (doc 06 §3.5): publica na hora, com log. Posse sempre
// pelo supplier_id da sessao (o servico reconfere product->campus->supplier).
export async function POST(request: Request) {
  const sessao = await sessaoFornecedorAtual();
  if (!sessao) return NextResponse.json({ ok: false, erro: "Nao autenticado" }, { status: 401 });

  const supabase = getServiceClient();
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");
  const supplierId = sessao.supplierId;
  const actor = sessao.email;

  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." },
      { status: 500 }
    );
  }

  try {
    if (acao === "criar_programa") {
      const v = validarPrograma(body);
      if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });
      const id = await criarPrograma(supabase, supplierId, tenantId, v.dados);
      return NextResponse.json({ ok: true, id });
    }

    if (acao === "arquivar_programa") {
      const okp = await arquivarPrograma(supabase, supplierId, String(body?.productId || ""));
      return okp
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ ok: false, erro: "Programa não encontrado." }, { status: 404 });
    }

    if (acao === "salvar_intake") {
      const v = validarIntake(body);
      if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });
      const r = await salvarIntake(supabase, supplierId, tenantId, String(body?.productId || ""), v.dados, actor, "supplier");
      return r.ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }

    if (acao === "remover_intake") {
      const r = await removerIntake(
        supabase,
        supplierId,
        tenantId,
        String(body?.productId || ""),
        String(body?.startDate || ""),
        actor,
        "supplier"
      );
      return r.ok
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }

    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  } catch (err) {
    console.error("[fornecedor/disponibilidade] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Falha ao processar a solicitação." }, { status: 500 });
  }
}
