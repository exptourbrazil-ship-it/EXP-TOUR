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
  validarOptionalFeeIds,
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

type Pedido = { productId: string; startDate: string; quantity: number; unit: string; optionalFeeIds?: string[] };

// POST /api/admin/catalog/price-batch — precifica VARIOS produtos de uma vez,
// pelo mesmo motor de /api/admin/catalog/price (faixas, taxas, descontos). E o
// que alimenta o preco dos cards no construtor: o numero do card e o mesmo que
// vai para a cotacao quando o item e adicionado.
//
// Cada item traz a PROPRIA unidade e quantidade, porque o catalogo mistura:
// curso, acomodacao e seguro sao cobrados por semana e noite extra por diaria.
//
// Body: { items: [{ productId, startDate, quantity, unit }], quoteDate?, nationalityCode? }
// Resposta: [{ productId, ok, grossAmount?, netAmount?, currency?, warnings?, error? }]
// Um produto que o motor recusa NAO derruba o lote: volta com ok=false.
export async function POST(request: Request) {
  const g = await guardCatalog(request);
  if (!g.ok) return g.response;

  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object") return bad("Corpo JSON invalido.");

  const brutos = Array.isArray(b.items) ? b.items : [];
  const quoteDate = b.quoteDate ?? hojeSaoPauloISO();
  const nationalityCode =
    typeof b.nationalityCode === "string" ? b.nationalityCode : undefined;

  if (brutos.length === 0) return bad("Informe items.");
  if (brutos.length > MAX_ITENS) return bad(`Maximo de ${MAX_ITENS} produtos por chamada.`);
  if (!isIsoDate(quoteDate)) return bad("quoteDate invalido (AAAA-MM-DD).");

  // Valida CADA item antes de tocar no banco: um item invalido no meio do lote
  // recusa a chamada inteira, em vez de virar um preco silenciosamente errado.
  const pedidos: Pedido[] = [];
  for (const it of brutos) {
    if (!it || typeof it !== "object") return bad("Item invalido.");
    const productId = typeof it.productId === "string" ? it.productId : "";
    const startDate = it.startDate;
    const unit = typeof it.unit === "string" ? it.unit : "";
    if (!productId) return bad("Informe productId em cada item.");
    if (!isIsoDate(startDate)) return bad("startDate invalido (AAAA-MM-DD).");
    // Lista FECHADA de unidades: uma string livre chegaria ao motor sem teto
    // de quantidade conhecido.
    const teto = MAX_QUANTIDADE[unit];
    if (teto === undefined) return bad("Unidade invalida.");
    // Semanas/meses FECHADOS, igual a /price e a adicao de item.
    const dur = validarDuracao(it.quantity, unit);
    if (!dur.ok) return bad(dur.erro);
    if (dur.quantidade > teto) return bad(`Quantidade acima do maximo (${teto} ${unit}).`);
    const taxas = validarOptionalFeeIds(it.optionalFeeIds);
    if (!taxas.ok) return bad(taxas.erro);
    pedidos.push({ productId, startDate, quantity: dur.quantidade, unit, optionalFeeIds: taxas.ids });
  }

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
      pedidos.map(async (pedido) => {
        try {
          const priced = await priceProductFromDb(supabase, {
            tenantId,
            productId: pedido.productId,
            startDate: pedido.startDate,
            quantity: pedido.quantity,
            unit: pedido.unit,
            quoteDate,
            nationalityCode,
            optionalFeeIds: pedido.optionalFeeIds,
          });
          return {
            productId: pedido.productId,
            ok: true as const,
            grossAmount: priced.grossAmount,
            netAmount: priced.netAmount,
            averageUnitPrice: priced.averageUnitPrice,
            currency: priced.currency,
            // A tela precisa saber o que NAO entrou na conta para poder oferecer.
            optionalFees: priced.optionalFees ?? [],
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
          console.error("[catalog] price-batch:", pedido.productId, raw);
          return {
            productId: pedido.productId,
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
