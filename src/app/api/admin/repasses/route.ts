import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checarCapacidadeAdmin, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { executarRepasse } from "@/lib/payout-admin-service";
import { validarArquivo, montarChaveStorage, sanitizarNomeExibicao, TAMANHO_MAXIMO_BYTES } from "@/lib/upload-seguro";
import { enviarAlertaFornecedorEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "documentos-fornecedor";

// Alerta 6 ("Pagamento enviado", doc 06): avisa o FINANCEIRO do fornecedor que a
// remessa foi executada, com botão "Ver comprovante". Best-effort (log em
// email_logs). Só papéis financeiros (finance/supplier_admin) — o valor pago não
// é espalhado para usuários operacionais. Se não houver, ninguém recebe o e-mail
// (a remessa fica registrada e a escola a vê no extrato do portal mesmo assim).
async function avisarPagamento(supabase: SupabaseClient, supplierId: string, contexto: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://exp-tour.com").trim().replace(/\/$/, "");
  const { data } = await supabase
    .from("supplier_user")
    .select("email, name, role, language, active")
    .eq("supplier_id", supplierId)
    .eq("active", true)
    .is("archived_at", null);
  const ativos = ((data ?? []) as { email: string | null; name: string | null; role: string; language: string | null }[]).filter((u) => u.email);
  const destinatarios = ativos.filter((u) => u.role === "finance" || u.role === "supplier_admin");

  const vistos = new Set<string>();
  for (const d of destinatarios) {
    const email = (d.email as string).toLowerCase();
    if (vistos.has(email)) continue;
    vistos.add(email);
    const en = d.language !== "pt";
    try {
      await enviarAlertaFornecedorEmail(d.email as string, d.name || "", d.language || "en", {
        subject: en ? "Payment sent" : "Pagamento enviado",
        titulo: en ? "Payment sent" : "Pagamento enviado",
        contexto: en
          ? `EXP Tour has sent a payment for ${contexto}. The receipt is available in your portal.`
          : `A EXP Tour enviou o pagamento referente a ${contexto}. O comprovante está disponível no seu portal.`,
        botaoLabel: en ? "See receipt" : "Ver comprovante",
        botaoUrl: `${base}/fornecedor/financeiro`,
      });
    } catch {
      // best-effort; a falha já fica em email_logs.
    }
  }
}

export async function POST(request: Request) {
  // Rota MONEY-TOUCHING: exige SESSAO admin com financeiro.gerir (sem o bearer de
  // compatibilidade — pagamento a fornecedor precisa de um QUEM identificavel na
  // trilha, nunca "bearer-secret").
  if (!(await checarCapacidadeAdmin("financeiro.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }
  const adminUser = await usuarioAdminAtual();
  if (!adminUser) {
    return NextResponse.json({ ok: false, erro: "Sessao invalida" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string);

  let tenantId: string;
  try {
    tenantId = await tenantIdAtual(supabase);
  } catch (err) {
    return NextResponse.json({ ok: false, erro: err instanceof Error ? err.message : "Falha ao resolver o tenant." }, { status: 500 });
  }
  const ip = obterIp(request);

  const form = await request.formData();
  const contratoId = String(form.get("contratoId") || "");
  if (!contratoId) return NextResponse.json({ ok: false, erro: "Informe o caso." }, { status: 400 });

  // Comprovante (opcional, mas recomendado): PDF/imagem no bucket privado.
  let proofStoragePath: string | null = null;
  let proofFilename: string | null = null;
  const arquivo = form.get("comprovante") as File | null;
  if (arquivo && typeof arquivo === "object" && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      const mb = Math.floor(TAMANHO_MAXIMO_BYTES / (1024 * 1024));
      return NextResponse.json({ ok: false, erro: `Comprovante acima do limite de ${mb} MB.` }, { status: 400 });
    }
    const buffer = await arquivo.arrayBuffer();
    const val = validarArquivo(arquivo.size, buffer);
    if (!val.ok) return NextResponse.json({ ok: false, erro: val.erro }, { status: 400 });
    const caminho = montarChaveStorage(`comprovante/${tenantId}`, val.extensao);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(caminho, buffer, { contentType: val.mime });
    if (upErr) {
      console.error("[admin/repasses] falha no Storage:", upErr.message);
      return NextResponse.json({ ok: false, erro: "Falha ao enviar o comprovante." }, { status: 500 });
    }
    proofStoragePath = caminho;
    proofFilename = sanitizarNomeExibicao(arquivo.name);
  }

  const r = await executarRepasse(supabase, {
    tenantId,
    contratoId,
    adminUser,
    grossAmount: form.get("grossAmount"),
    commissionAmount: form.get("commissionAmount"),
    netAmount: form.get("netAmount"),
    currency: form.get("currency"),
    dueDate: form.get("dueDate") ? String(form.get("dueDate")) : null,
    reference: form.get("reference") ? String(form.get("reference")) : null,
    notes: form.get("notes") ? String(form.get("notes")) : null,
    proofStoragePath,
    proofFilename,
  });
  if (!r.ok) {
    // Se falhou depois de subir o comprovante, remove o órfão do Storage.
    if (proofStoragePath) await supabase.storage.from(BUCKET).remove([proofStoragePath]).catch(() => {});
    return NextResponse.json({ ok: false, erro: r.erro }, { status: 400 });
  }

  await registrarAuditoriaAdmin(supabase, {
    usuario: adminUser,
    acao: "financeiro.repasse.executar",
    alvo: r.payoutId,
    detalhe: { contrato_id: contratoId, supplier_id: r.supplierId, ...r.valores, comprovante: !!proofStoragePath },
    ip,
  });

  await avisarPagamento(supabase, r.supplierId, `${r.valores.currency} ${r.valores.netAmount.toFixed(2)}`);

  return NextResponse.json({ ok: true, payoutId: r.payoutId, valores: r.valores });
}
