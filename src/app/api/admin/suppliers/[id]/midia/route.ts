import { NextResponse } from "next/server";
import { tenantIdAtual } from "@/lib/catalog-service";
import { getSupabase, guardCatalogWrite, bad, okData, isUuid, fail } from "@/lib/catalog-route";
import { apagarFaviconAntigo, internalizarFavicon, internalizarMidias, contarMidiaPendente } from "@/lib/midia-internalizacao-service";
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
    // fotos e martelariam o site da escola com downloads repetidos. A trava e
    // LIBERADA no fim do lote (abaixo) — sem isso o proximo clique legitimo, para
    // seguir com as fotos que faltaram, esbarraria na janela e o operador acharia
    // que a escola ja estava completa.
    const chaveTrava = `admin-internalizar-midia-lock:${supplierId}`;
    if (!(await checarELimitar(supabase, chaveTrava, 1, LOCK_SEG, Date.now(), true))) {
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

    let r;
    try {
      r = await internalizarMidias(supabase, tenantId, {
        campusIds,
        max: numeroEnv(process.env.ADMIN_MIDIA_MAX, 30),
        orcamentoMs: numeroEnv(process.env.ADMIN_MIDIA_ORCAMENTO_MS, 40_000),
      });
    } finally {
      // Solta a trava assim que o lote termina (inclusive em erro). A limpeza NUNCA
      // propaga: uma excecao aqui substituiria o erro real do lote. Se falhar, a
      // janela de LOCK_SEG expira sozinha — a trava nao fica presa.
      try {
        const { error: limpErr } = await supabase.from("rate_limit_hits").delete().eq("chave", chaveTrava);
        if (limpErr) console.error("[midia] falha ao soltar a trava do fornecedor:", limpErr.message);
      } catch (limpEx) {
        console.error("[midia] falha ao soltar a trava do fornecedor:", limpEx instanceof Error ? limpEx.message : "erro");
      }
    }

    // O favicon da escola sofre do MESMO bloqueio de CSP que as fotos, entao o
    // botao tambem o traz para o nosso bucket. E um download so: nao entra no
    // orcamento do lote e a falha dele nao invalida as fotos ja copiadas.
    let favicon: "copiado" | "ja_interno" | "sem_favicon" | "falhou" = "sem_favicon";
    const { data: supFav } = await supabase
      .from("supplier")
      .select("favicon_url")
      .eq("tenant_id", tenantId)
      .eq("id", supplierId)
      .maybeSingle();
    const faviconAtual = (supFav?.favicon_url as string | null) ?? null;
    if (faviconAtual) {
      const res = await internalizarFavicon(supabase, tenantId, supplierId, faviconAtual);
      if (!res.ok) favicon = "falhou";
      else if (res.url === faviconAtual) favicon = "ja_interno";
      else {
        const { data: trocado, error: fErr } = await supabase
          .from("supplier")
          .update({
            favicon_url: res.url,
            favicon_source_url: res.origem,
            favicon_internalize_attempts: 0,
            favicon_internalize_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("id", supplierId)
          .eq("favicon_url", faviconAtual)
          .select("id");
        // Sem linha alterada = outra execucao ja trocou: nao e sucesso deste lote.
        favicon = fErr || !trocado || trocado.length === 0 ? "falhou" : "copiado";
        if (favicon === "copiado") await apagarFaviconAntigo(supabase, faviconAtual, res.url);
      }
    }

    // Quantas ainda faltam DEPOIS deste lote: e o que o hub usa para seguir sozinho
    // ate a escola zerar, em vez de depender de o operador clicar de novo.
    const restante = await contarMidiaPendente(supabase, tenantId, campusIds).catch(() => null);

    await registrarAuditoriaAdmin(supabase, {
      usuario: g.usuario,
      acao: "midia.internalizar",
      alvo: supplierId,
      detalhe: { internalizadas: r.internalizadas, falhas: r.falhas, capas: r.capas_atualizadas, favicon, interrompida: r.interrompida },
      ip: g.ip,
    });

    return okData({
      ...r,
      favicon,
      pendentes_restantes: restante?.pendentes ?? null,
      esgotadas: restante?.esgotadas ?? null,
      erros: r.erros.slice(0, 5),
    });
  } catch (err) {
    return fail(err);
  }
}
