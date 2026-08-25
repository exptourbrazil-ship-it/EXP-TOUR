import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checarCapacidadeRequest, usuarioAdminAtual } from "@/lib/admin-guard";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { obterIp } from "@/lib/rate-limit";
import { tenantIdAtual } from "@/lib/catalog-service";
import { sincronizarVendorsDoZoho } from "@/lib/supplier-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sincroniza os Vendors (escolas/fornecedores) do Zoho CRM para a tabela
// supplier, criando tambem um supplier_user (papel admin) a partir do e-mail do
// Vendor. Reusa o OAuth do Zoho ja configurado (src/lib/zoho.ts).
//
// PREVIEW-FIRST: por padrao roda em dry-run (NAO grava) e devolve o que SERIA
// importado — util para conferir os campos reais do CRM. Para aplicar de fato,
// envie { "dryRun": false } (ou { "aplicar": true }).
//
// Autorizacao: capacidade fornecedores.gerir (com fallback Bearer, como as
// demais rotas admin).
export async function POST(request: Request) {
  if (!(await checarCapacidadeRequest(request, "fornecedores.gerir"))) {
    return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  // Aplica so quando pedido explicitamente; qualquer outra coisa e dry-run.
  const aplicar = body?.dryRun === false || body?.aplicar === true;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

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
    const resultado = await sincronizarVendorsDoZoho(supabase, { tenantId, dryRun: !aplicar });

    // So audita a aplicacao real (o dry-run nao muda nada).
    if (!resultado.dryRun) {
      const usuario = (await usuarioAdminAtual()) ?? "bearer-secret";
      await registrarAuditoriaAdmin(supabase, {
        usuario,
        acao: "fornecedores.sync_zoho",
        alvo: "Vendors",
        detalhe: {
          totalVendors: resultado.totalVendors,
          suppliersUpsert: resultado.suppliersUpsert,
          usersUpsert: resultado.usersUpsert,
          semEmail: resultado.semEmail,
          erros: resultado.erros.length,
        },
        ip: obterIp(request),
      });
    }

    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    // Tipicamente: credenciais do Zoho ausentes/invalidas, ou modulo Vendors
    // inacessivel. A mensagem do zoho.ts ja e descritiva.
    console.error("[sync-zoho] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json(
      { ok: false, erro: err instanceof Error ? err.message : "Falha ao sincronizar com o Zoho." },
      { status: 502 }
    );
  }
}
