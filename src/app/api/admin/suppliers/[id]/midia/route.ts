import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid, fail } from "@/lib/catalog-route";
import { internalizarMidias } from "@/lib/midia-internalizacao-service";
import { numeroEnv } from "@/lib/midia-internalizacao";
import { registrarAuditoriaAdmin } from "@/lib/admin-audit";
import { checarELimitar } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cada lote baixa varias imagens de sites externos (segundos): teto explicito.
export const maxDuration = 60;

// Teto de lotes por admin (cada lote faz dezenas de downloads externos).
// numeroEnv (e nao Number): env com lixo viraria NaN e `qtd >= NaN` e sempre false —
// o teto simplesmente deixaria de existir.
const JANELA_SEG = numeroEnv(process.env.RATE_LIMIT_JANELA_SEG, 600);
const MAX_LOTES = numeroEnv(process.env.RATE_LIMIT_INTERNALIZAR_MIDIA, 20);
// Janela do "lote em andamento" por fornecedor (~ maxDuration da rota).
const LOCK_SEG = 60;

// POST /api/admin/suppliers/[id]/midia — botao "Copiar fotos para o Storage" do hub
// (aba Meus Campi). Copia um LOTE das fotos dos campi DESTE fornecedor que ainda
// apontam para o site da escola (mesmo servico do cron diario internalizar-midia).
// Autorizacao por SESSAO com 'fornecedores.gerir' (falha fechada); o fornecedor da
// URL tem que ser do tenant vigente e so os campi dele entram no lote.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardCatalogWrite(request);
  if (!g.ok) return g.response;

  const { id: supplierId } = await params;
  if (!isUuid(supplierId)) return bad("Fornecedor inválido.");

  try {
    const supabase = getSupabase();
    const tenantId = await tenantIdAtual(supabase);

    // POSSE: o fornecedor tem que ser deste tenant.
    const { data: sup } = await supabase
      .from("supplier")
      .select("id")
      .eq("id", supplierId)
      .eq("tenant_id", tenantId)
      .is("archived_at", null)
      .maybeSingle();
    if (!sup) return bad("Fornecedor não encontrado neste tenant.", "supplier_invalido", 404);

    // Falha FECHADA: o efeito aqui e dezenas de downloads em sites de terceiros;
    // se o contador estiver indisponivel, e melhor recusar do que liberar o teto.
    if (!(await checarELimitar(supabase, `admin-internalizar-midia:${g.usuario}`, MAX_LOTES, JANELA_SEG, Date.now(), true))) {
      return bad("Muitos lotes em pouco tempo. Aguarde alguns minutos.", "rate_limit", 429);
    }
    // Um lote por fornecedor de cada vez: duas abas abertas selecionariam as MESMAS
    // fotos e martelariam o site da escola com downloads repetidos.
    if (!(await checarELimitar(supabase, `admin-internalizar-midia-lock:${supplierId}`, 1, LOCK_SEG, Date.now(), true))) {
      return bad("Já existe um lote em andamento para este fornecedor. Aguarde terminar.", "lote_em_andamento", 409);
    }

    // So os campi DESTE fornecedor (o servico ainda filtra por tenant).
    const { data: campi } = await supabase
      .from("campus")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .is("archived_at", null); // campus arquivado nao aparece em cotacao: nao vale o download
    const campusIds = (campi ?? []).map((c) => c.id as string);

    const r = await internalizarMidias(supabase, tenantId, {
      campusIds,
      max: numeroEnv(process.env.ADMIN_MIDIA_MAX, 30),
      orcamentoMs: numeroEnv(process.env.ADMIN_MIDIA_ORCAMENTO_MS, 40_000),
    });

    await registrarAuditoriaAdmin(supabase, {
      usuario: g.usuario,
      acao: "midia.internalizar",
      alvo: supplierId,
      detalhe: { internalizadas: r.internalizadas, falhas: r.falhas, capas: r.capas_atualizadas, interrompida: r.interrompida },
      ip: g.ip,
    });

    return okData({ ...r, erros: r.erros.slice(0, 5) });
  } catch (err) {
    return fail(err);
  }
}
