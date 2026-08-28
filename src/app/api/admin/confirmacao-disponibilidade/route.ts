import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { validarSolicitacao, conteudoAlertaConfirmacao } from "@/lib/confirmacao-disponibilidade";
import { criarSolicitacao, destinatariosDoFornecedor } from "@/lib/confirmacao-service";
import { enviarAlertaFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin dispara o pedido de confirmacao de disponibilidade (alerta 5), do Caso
// 360. Capacidade casos.gerir (falha fechada). Cria o pedido e envia o e-mail a
// admissions/admin do fornecedor. O envio e best-effort (o pedido ja existe).
export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "casos.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const v = validarSolicitacao(body);
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 });

  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." },
      { status: 500 }
    );
  }

  const requestedBy = (await usuarioAdminAtual()) ?? "bearer-secret";
  const r = await criarSolicitacao(supabase, tenantId, requestedBy, v.dados);
  if (!r.ok) return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });

  await registrarAuditoriaAdmin(supabase, {
    usuario: requestedBy,
    acao: "fornecedores.confirmacao.solicitar",
    alvo: r.id,
    detalhe: { supplier_id: v.dados.supplierId, contrato_id: v.dados.contratoId, kind: v.dados.kind },
    ip: obterIp(request),
  });

  // Nome do estudante (contexto do e-mail), quando ha contrato.
  let estudanteNome: string | null = null;
  if (v.dados.contratoId) {
    const { data: c } = await supabase
      .from("contratos")
      .select("estudante_nome")
      .eq("id", v.dados.contratoId)
      .maybeSingle();
    estudanteNome = (c as { estudante_nome?: string | null } | null)?.estudante_nome ?? null;
  }

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");
  const destinatarios = await destinatariosDoFornecedor(supabase, v.dados.supplierId);
  let emailEnviados = 0;
  for (const d of destinatarios) {
    const c = conteudoAlertaConfirmacao(v.dados.kind, d.language, { estudanteNome, message: v.dados.message });
    try {
      await enviarAlertaFornecedorEmail(d.email, d.name, d.language, {
        subject: c.subject,
        titulo: c.titulo,
        contexto: c.contexto,
        botaoLabel: c.botaoLabel,
        botaoUrl: `${base}/fornecedor`,
      });
      emailEnviados++;
    } catch {
      // Falha ja fica em email_logs; nao logar o e-mail cru.
    }
  }

  return NextResponse.json({ ok: true, id: r.id, emailEnviados, semDestinatario: destinatarios.length === 0 });
}
