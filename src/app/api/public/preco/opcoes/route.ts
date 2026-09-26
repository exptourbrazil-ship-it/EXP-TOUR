import { guardChatApi, chatErro, chatOk } from "@/lib/chat-api-guard";
import { montarOpcoes, LIMITE_OPCOES } from "@/lib/preco-publico";
import { carregarCatalogoOrcamento } from "@/lib/orcamento-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/public/preco/opcoes
// Consumida pelo Chat da Forio quando destino e semanas ja estao fechados:
// devolve ATE 3 opcoes com PRECO REAL (motor de src/lib/orcamento.ts, o mesmo
// do orcamento publico), itemizadas, na moeda do curso e em BRL pela cotacao
// do dia, mais a contagem de programas excluidos por motivo — para o chat
// justificar por escrito "por que essas e nao as outras". O chat nao calcula.
//
// Corpo: { destino?: string, semanas: number, acomodacao?: "homestay"|"residence"|"none",
//          seguro?: boolean, orcamentoMaxBrl?: number, termo?: string, limite?: 1..3 }
// Auth: Bearer CHAT_API_KEY (falha fechada).
//
// NB: os filtros de perfil de turma / idade / intensidade (item 0.6 do plano)
// entram quando as colunas existirem no catalogo; ate la a rota os ignora e
// diz isso em `filtrosNaoSuportados`, para o chat nao prometer o que nao filtrou.
type Corpo = {
  destino?: unknown; semanas?: unknown; acomodacao?: unknown; seguro?: unknown;
  orcamentoMaxBrl?: unknown; termo?: unknown; limite?: unknown;
  perfilTurma?: unknown; nivelMinimo?: unknown; intensidade?: unknown; padraoCruzamento?: unknown;
};

export async function POST(request: Request) {
  const g = await guardChatApi(request);
  if (!g.ok) return g.response;

  const body = (await request.json().catch(() => null)) as Corpo | null;
  if (!body || typeof body !== "object") return chatErro("Corpo inválido.", "corpo_invalido", 400);

  const semanas = Number(body.semanas);
  if (!Number.isFinite(semanas) || semanas < 1 || semanas > 104) {
    return chatErro("Informe `semanas` entre 1 e 104.", "semanas_invalidas", 400);
  }
  const acomodacaoRaw = typeof body.acomodacao === "string" ? body.acomodacao : "homestay";
  if (!["homestay", "residence", "none"].includes(acomodacaoRaw)) {
    return chatErro("`acomodacao` deve ser homestay, residence ou none.", "acomodacao_invalida", 400);
  }
  const acomodacao = acomodacaoRaw as "homestay" | "residence" | "none";
  const seguro = body.seguro === undefined ? true : body.seguro === true;
  const orcamentoMaxBrl = body.orcamentoMaxBrl == null ? null : Number(body.orcamentoMaxBrl);
  if (orcamentoMaxBrl != null && (!Number.isFinite(orcamentoMaxBrl) || orcamentoMaxBrl < 0)) {
    return chatErro("`orcamentoMaxBrl` inválido.", "orcamento_invalido", 400);
  }
  const destino = typeof body.destino === "string" ? body.destino.trim().slice(0, 80) : null;
  const termo = typeof body.termo === "string" ? body.termo.trim().slice(0, 60) : null;
  const limiteRaw = body.limite == null ? LIMITE_OPCOES : Number(body.limite);
  const limite = Number.isFinite(limiteRaw) ? Math.min(LIMITE_OPCOES, Math.max(1, Math.floor(limiteRaw))) : LIMITE_OPCOES;

  const filtrosNaoSuportados = (["perfilTurma", "nivelMinimo", "intensidade", "padraoCruzamento"] as const)
    .filter((k) => body[k] != null);

  try {
    const catalogo = await carregarCatalogoOrcamento();
    const r = montarOpcoes(
      { destino, semanas: Math.floor(semanas), acomodacao, seguro, orcamentoMaxBrl, termo, limite },
      catalogo.programas,
      catalogo.cambio,
      catalogo.dataCambio,
    );
    if (destino && !r.destino) {
      return chatErro("Destino não encontrado no catálogo.", "destino_nao_encontrado", 404);
    }
    return chatOk({
      pedido: { destino, semanas: Math.floor(semanas), acomodacao, seguro, orcamentoMaxBrl, termo, limite },
      destino: r.destino,
      dataCambio: r.dataCambio,
      cambio: Object.fromEntries(
        Array.from(new Set(r.opcoes.map((o) => o.moeda))).map((m) => [m, catalogo.cambio[m] ?? null]),
      ),
      opcoes: r.opcoes,
      excluidas: r.excluidas,
      filtrosNaoSuportados,
      // Regra (Anexo I, 9.2): o modelo escreve o porque; nunca escolhe nem calcula.
      apresentacao: "Apresente no máximo três opções com o total e o que inclui. Justifique por escrito usando `excluidas`. Valores em BRL são estimativa pela cotação do dia; o valor contratual sai na cotação formal.",
    });
  } catch (err) {
    console.error("[public/preco/opcoes] erro:", err instanceof Error ? err.message : err);
    return chatErro("Não foi possível montar as opções.", "erro_interno", 500);
  }
}
