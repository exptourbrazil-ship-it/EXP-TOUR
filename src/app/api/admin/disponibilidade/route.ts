import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { validarPrograma, validarIntake, validarAcomodacao, validarPeriodo } from "@/lib/disponibilidade";
import {
  criarPrograma,
  arquivarPrograma,
  salvarIntake,
  removerIntake,
  criarAcomodacao,
  arquivarAcomodacao,
  salvarPeriodo,
  removerPeriodo,
} from "@/lib/catalog-disponibilidade";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Espelho admin do endpoint de Disponibilidade. Mesmo `acao`, mas gateado por
// capacidade (fornecedores.gerir) e escopado ao `supplierId` do corpo (a equipe
// pode gerir a disponibilidade de qualquer fornecedor). actor_kind = 'admin'.
export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "fornecedores.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");
  const supplierId = String(body?.supplierId || "");
  if (!supplierId) return NextResponse.json({ ok: false, erro: "Informe o fornecedor." }, { status: 400 });
  const actor = (await usuarioAdminAtual()) ?? "bearer-secret";

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
      const r = await salvarIntake(supabase, supplierId, tenantId, String(body?.productId || ""), v.dados, actor, "admin");
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }
    if (acao === "remover_intake") {
      const r = await removerIntake(
        supabase,
        supplierId,
        tenantId,
        String(body?.productId || ""),
        String(body?.startDate || ""),
        actor,
        "admin"
      );
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }
    if (acao === "criar_acomodacao") {
      const v = validarAcomodacao(body);
      if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });
      const id = await criarAcomodacao(supabase, supplierId, tenantId, v.dados);
      return NextResponse.json({ ok: true, id });
    }
    if (acao === "arquivar_acomodacao") {
      const okp = await arquivarAcomodacao(supabase, supplierId, String(body?.productId || ""));
      return okp
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ ok: false, erro: "Acomodação não encontrada." }, { status: 404 });
    }
    if (acao === "salvar_periodo") {
      const v = validarPeriodo(body);
      if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });
      const r = await salvarPeriodo(supabase, supplierId, tenantId, String(body?.productId || ""), v.dados, actor, "admin");
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }
    if (acao === "remover_periodo") {
      const r = await removerPeriodo(
        supabase,
        supplierId,
        tenantId,
        String(body?.productId || ""),
        String(body?.periodStart || ""),
        actor,
        "admin"
      );
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    }
    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  } catch (err) {
    console.error("[admin/disponibilidade] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, erro: "Falha ao processar a solicitação." }, { status: 500 });
  }
}
