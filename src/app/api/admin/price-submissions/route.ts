import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { aprovarPeloAdmin, rejeitarPeloAdmin } from "@/lib/price-admin-service";
import { destinatariosDoFornecedor } from "@/lib/confirmacao-service";
import { enviarAlertaFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aprovacao/rejeicao de price list pelo Admin (alerta 7). Capacidade
// fornecedores.gerir (falha fechada). Aprovar MATERIALIZA o rascunho em catalogo
// (preco vivo). Avisa a escola por e-mail (best-effort).
async function avisarEscola(
  supabase: SupabaseClient,
  supplierId: string,
  aprovado: boolean,
  motivo?: string
) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");
  const destinatarios = await destinatariosDoFornecedor(supabase, supplierId);
  for (const d of destinatarios) {
    const en = d.language !== "pt";
    const conteudo = aprovado
      ? {
          subject: en ? "Your price list is live" : "Seu price list foi publicado",
          titulo: en ? "Price list published" : "Price list publicado",
          contexto: en
            ? "Your price list was approved and is now available in EXP Tour's catalog."
            : "Seu price list foi aprovado e já está disponível no catálogo da EXP Tour.",
          botaoLabel: en ? "See catalog" : "Ver catálogo publicado",
        }
      : {
          subject: en ? "Your price list needs adjustment" : "Seu price list precisa de ajustes",
          titulo: en ? "Price list returned" : "Price list devolvido",
          contexto:
            (en ? "Your price list needs an adjustment before publishing." : "Seu price list precisa de um ajuste antes de publicar.") +
            (motivo ? (en ? ` Reason: ${motivo}` : ` Motivo: ${motivo}`) : ""),
          botaoLabel: en ? "Review price list" : "Revisar price list",
        };
    try {
      await enviarAlertaFornecedorEmail(d.email, d.name, d.language, { ...conteudo, botaoUrl: `${base}/fornecedor/precos` });
    } catch {
      // best-effort; falha ja fica em email_logs.
    }
  }
}

export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "fornecedores.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const acao = String(body?.acao || "");
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ ok: false, erro: "Price list ausente." }, { status: 400 });

  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const adminUser = (await usuarioAdminAtual()) ?? "bearer-secret";
  const ip = obterIp(request);

  if (acao === "aprovar") {
    const r = await aprovarPeloAdmin(supabase, tenantId, id, adminUser);
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    await registrarAuditoriaAdmin(supabase, {
      usuario: adminUser,
      acao: "fornecedores.price_list.aprovar",
      alvo: id,
      detalhe: { supplier_id: r.supplierId, ...r.resumo },
      ip,
    });
    await avisarEscola(supabase, r.supplierId, true);
    return NextResponse.json({ ok: true, resumo: r.resumo });
  }

  if (acao === "rejeitar") {
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    if (!motivo) return NextResponse.json({ ok: false, erro: "Informe o motivo do ajuste." }, { status: 400 });
    const r = await rejeitarPeloAdmin(supabase, tenantId, id, adminUser, motivo);
    if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
    await registrarAuditoriaAdmin(supabase, {
      usuario: adminUser,
      acao: "fornecedores.price_list.rejeitar",
      alvo: id,
      detalhe: { supplier_id: r.supplierId, motivo },
      ip,
    });
    await avisarEscola(supabase, r.supplierId, false, motivo);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
}
