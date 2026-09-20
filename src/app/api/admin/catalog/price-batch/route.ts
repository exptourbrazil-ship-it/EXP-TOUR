import { tenantIdAtual, priceProductFromDb } from "@/lib/catalog-service";
import { validarDuracao } from "@/lib/duracao";
import { checarELimitar } from "@/lib/rate-limit";
import {
  getSupabase,
  guardCatalog,
  bad,
  fail,
  okData,
  hojeSaoPauloISO,
  isIsoDate,
} from "@/lib/catalog-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Teto por chamada: o buscador do construtor precifica apenas os cards da
// pagina visivel. Evita varrer o catalogo inteiro no motor a cada tecla.
const MAX_ITENS = 24;

// O motor itera POR UNIDADE (semana a semana, e por ano da estadia). Sem teto,
// um `quantity` absurdo multiplicado por MAX_ITENS travaria a funcao. 104
// semanas = 2 anos, acima do seletor do construtor (53) e de qualquer curso do
// catalogo; `min/max_duration` do produto so gera warning, nao barra.
const MAX_QUANTIDADE: Record<string, number> = { week: 104, month: 24, day: 730, unit: 1000 };

// Rate limit por ADMIN: a tela dispara um lote por pagina de resultados, e o
// consultor navega/filtra a vontade. O teto pega uso automatizado, nao humano.
const LIMITE_LOTES = 120;
const JANELA_SEGUNDOS = 60;

// POST /api/admin/catalog/price-batch — precifica VARIOS produtos de uma vez,
// pelo mesmo motor de /api/admin/catalog/price (faixas, taxas, descontos). E o
// que alimenta o preco dos cards no construtor: o numero do card e o mesmo que
// vai para a cotacao quando o item e adicionado.
//
// Body: { startDate, quantity, unit, quoteDate?, nationalityCode?, productIds[] }
// Resposta: [{ productId, ok, grossAmount?, netAmount?, currency?, warnings?, error? }]
// Um produto que o motor recusa NAO derruba o lote: volta com ok=false e o erro.
export async function POST(request: Request) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");

  const productIds = Array.isArray(b.productIds)
    ? b.productIds.filter((id: unknown): id is string => typeof id === "string" && id !== "")
    : [];
  const startDate = b.startDate;
  const quantity = Number(b.quantity);
  const unit = typeof b.unit === "string" ? b.unit : "";
  const quoteDate = b.quoteDate ?? hojeSaoPauloISO();
  const nationalityCode =
    typeof b.nationalityCode === "string" ? b.nationalityCode : undefined;

  if (productIds.length === 0) return bad("Informe productIds.");
  if (productIds.length > MAX_ITENS) return bad(`Maximo de ${MAX_ITENS} produtos por chamada.`);
  if (!isIsoDate(startDate)) return bad("startDate invalido (AAAA-MM-DD).");
  if (!unit) return bad("Informe unit.");
  // Lista FECHADA de unidades: uma string livre chegaria ao motor e ao teto de
  // quantidade abaixo sem limite conhecido.
  const teto = MAX_QUANTIDADE[unit];
  if (teto === undefined) return bad("Unidade invalida.");
  // Semanas FECHADAS de 7 dias, igual a /price e a adicao de item.
  const dur = validarDuracao(quantity, unit);
  if (!dur.ok) return bad(dur.erro);
  if (dur.quantidade > teto) return bad(`Quantidade acima do maximo (${teto} ${unit}).`);
  if (!isIsoDate(quoteDate)) return bad("quoteDate invalido (AAAA-MM-DD).");

  try {
    const supabase = getSupabase();

    const permitido = await checarELimitar(
      supabase,
      `catalog:price-batch:${g.usuario}`,
      LIMITE_LOTES,
      JANELA_SEGUNDOS,
    );
    if (!permitido) {
      return bad("Muitas consultas de preco em sequencia. Aguarde alguns instantes.", "rate_limited", 429);
    }

    const tenantId = await tenantIdAtual(supabase);

    const resultados = await Promise.all(
      productIds.map(async (productId: string) => {
        try {
          const priced = await priceProductFromDb(supabase, {
            tenantId,
            productId,
            startDate,
            quantity,
            unit,
            quoteDate,
            nationalityCode,
          });
          return {
            productId,
            ok: true as const,
            grossAmount: priced.grossAmount,
            netAmount: priced.netAmount,
            averageUnitPrice: priced.averageUnitPrice,
            currency: priced.currency,
            warnings: priced.warnings ?? [],
          };
        } catch (err) {
          // Erro POR PRODUTO (sem tabela de preco vigente, fora da faixa, id
          // inexistente ou de outro tenant): o card mostra "sem preco" e os
          // demais seguem precificados.
          //
          // A mensagem devolvida e SEMPRE a mesma, de proposito: o motivo real
          // distingue "nao existe" de "existe mas sem preco" e transformaria a
          // rota num oraculo de enumeracao de produto/tenant. O detalhe fica no
          // log do servidor.
          const raw = err instanceof Error ? err.message : "Erro ao precificar.";
          console.error("[catalog] price-batch:", productId, raw);
          return {
            productId,
            ok: false as const,
            error: "Sem preço para esta data/duração.",
          };
        }
      }),
    );

    return okData(resultados);
  } catch (err) {
    return fail(err);
  }
}
