import { guardChatApi, chatErro, chatOk } from "@/lib/chat-api-guard";
import { tenantIdAtual } from "@/lib/catalog-service";
import { bucketMaisProximo, SEMANAS_FAIXA } from "@/lib/faixa-preco";
import { resolverDestino } from "@/lib/preco-publico";
import { carregarCatalogoOrcamento } from "@/lib/orcamento-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/preco/faixa?destino=Londres&semanas=4
// Consumida pelo Chat da Forio no ESCAPE DE PRECO (Anexo I, 6.1): quem pede
// preco antes de fechar destino e duracao recebe uma faixa honesta
// (p25 / mediana / p75) com o que esta incluido — nunca "a partir de".
// Le a tabela `faixa_preco` gravada pelo cron atualizar-faixa-preco; o chat nao
// calcula, consulta e cita. Auth: Bearer CHAT_API_KEY (falha fechada).
//
// Sem `destino`: devolve a faixa de cada pais (visao geral). Com destino: a
// linha da cidade quando existir, senao a do pais. `semanas` aproxima para o
// bucket publicado mais proximo (2, 4, 8, 12).
export async function GET(request: Request) {
  const g = await guardChatApi(request);
  if (!g.ok) return g.response;

  const url = new URL(request.url);
  const destinoTexto = (url.searchParams.get("destino") ?? "").trim().slice(0, 80);
  const semanasPedidas = Number(url.searchParams.get("semanas") ?? 4);
  if (!Number.isFinite(semanasPedidas) || semanasPedidas <= 0 || semanasPedidas > 104) {
    return chatErro("Informe `semanas` entre 1 e 104.", "semanas_invalidas", 400);
  }
  const semanas = bucketMaisProximo(semanasPedidas);

  try {
    const tenantId = await tenantIdAtual(g.supabase);

    let filtro: { nivel: "pais" | "cidade"; destino: string } | null = null;
    let destinoResolvido: ReturnType<typeof resolverDestino> = null;
    if (destinoTexto) {
      // Resolve o texto contra o catalogo real (cidades/paises existentes).
      const catalogo = await carregarCatalogoOrcamento();
      destinoResolvido = resolverDestino(destinoTexto, catalogo.programas);
      if (!destinoResolvido) {
        return chatErro("Destino não encontrado no catálogo.", "destino_nao_encontrado", 404);
      }
      filtro = { nivel: destinoResolvido.nivel, destino: destinoResolvido.destino };
    }

    let q = g.supabase
      .from("faixa_preco")
      .select("nivel, destino, pais, semanas, moeda, p25, mediana, p75, p25_brl, mediana_brl, p75_brl, amostra, inclui, origem, data_cambio, atualizado_em")
      .eq("tenant_id", tenantId)
      .eq("semanas", semanas);
    q = filtro ? q.eq("nivel", filtro.nivel).eq("destino", filtro.destino) : q.eq("nivel", "pais");
    const { data, error } = await q.order("destino");
    if (error) throw new Error(`Falha ao ler faixa_preco: ${error.message}`);

    const faixas = (data ?? []).map((r: any) => ({
      nivel: r.nivel,
      destino: r.destino,
      pais: r.pais,
      semanas: Number(r.semanas),
      moeda: r.moeda,
      p25: Number(r.p25),
      mediana: Number(r.mediana),
      p75: Number(r.p75),
      p25Brl: r.p25_brl == null ? null : Number(r.p25_brl),
      medianaBrl: r.mediana_brl == null ? null : Number(r.mediana_brl),
      p75Brl: r.p75_brl == null ? null : Number(r.p75_brl),
      amostra: Number(r.amostra),
      inclui: r.inclui ?? [],
      origem: r.origem,
      dataCambio: r.data_cambio,
      atualizadoEm: r.atualizado_em,
    }));

    if (faixas.length === 0) {
      return chatErro("Sem faixa publicada para esse destino e duração.", "sem_faixa", 404);
    }

    return chatOk({
      semanasPedidas,
      semanas,
      bucketsDisponiveis: [...SEMANAS_FAIXA],
      destino: destinoResolvido,
      faixas,
      // Regra de apresentacao (Anexo I, 6.1): mediana visivel, nunca so o piso.
      apresentacao: "Cite p25 a p75 com a mediana visível e diga o que está incluído. Nunca apresente só o menor valor.",
    });
  } catch (err) {
    console.error("[public/preco/faixa] erro:", err instanceof Error ? err.message : err);
    return chatErro("Não foi possível consultar a faixa.", "erro_interno", 500);
  }
}
