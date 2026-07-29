// NB: modulo server-only (usa a service role do Supabase). So deve ser
// importado por server components e rotas de API — nunca por codigo client.
import { createClient } from "@supabase/supabase-js";
import { calcularMetricas } from "@/lib/admin-metricas";
import type {
  MetricasFinanceiras,
  ParcelaMetrica,
  PagamentoMetrica,
} from "@/lib/admin-metricas";

// Carregador server-only dos dados financeiros do painel admin. Centraliza o
// acesso ao Supabase (service role) para que a rota /api/admin/metricas, a
// pagina /admin/financeiro (server component) e a home /admin usem exatamente
// a mesma fonte — sem duplicar query nem criar "waterfall" de fetch no cliente.

// Uma parcela achatada para a tabela do painel (parcela + contrato + titular).
export type ParcelaLista = {
  id: string;
  numero: number;
  descricao: string;
  valor_atual: number | string;
  valor_cobrado_brl: number | string | null;
  vencimento: string;
  status: string;
  is_entrada: boolean;
  paid_at: string | null;
  moeda: string;
  pais_destino: string | null;
  estudante_nome: string | null;
  contrato_nome: string | null;
  titular_nome: string | null;
  titular_cpf: string | null;
};

export type DadosFinanceiros = {
  hojeISO: string;
  metricas: MetricasFinanceiras;
  parcelas: ParcelaLista[];
};

// Data de "hoje" no fuso do Brasil (o negocio e brasileiro; o servidor roda em
// UTC). en-CA formata como YYYY-MM-DD.
export function hojeBrasilISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Carrega parcelas (com moeda/destino/titular) + pagamentos do mes e calcula as
// metricas. Lanca em caso de falha de query — o chamador decide como tratar.
export async function carregarFinanceiro(): Promise<DadosFinanceiros> {
  const supabase = getSupabase();
  const hojeISO = hojeBrasilISO();
  const mesInicioISO = hojeISO.slice(0, 7) + "-01"; // YYYY-MM-01

  const { data: parcelas, error: erroParcelas } = await supabase
    .from("parcelas")
    .select(
      "id, numero, descricao, valor_atual, valor_cobrado_brl, vencimento, status, is_entrada, paid_at, contrato_id, contratos(moeda, pais_destino, estudante_nome, nome, titulares(nome_completo, cpf))"
    )
    .order("vencimento", { ascending: true });

  if (erroParcelas) {
    throw new Error("Falha ao carregar parcelas.");
  }

  const { data: pagamentos, error: erroPagamentos } = await supabase
    .from("pagamentos")
    .select("valor_brl, pago_em")
    .gte("pago_em", mesInicioISO);

  if (erroPagamentos) {
    throw new Error("Falha ao carregar pagamentos.");
  }

  const lista: ParcelaLista[] = (parcelas || []).map((p: any) => {
    const c = p.contratos || {};
    const t = c.titulares || {};
    return {
      id: p.id,
      numero: p.numero,
      descricao: p.descricao,
      valor_atual: p.valor_atual,
      valor_cobrado_brl: p.valor_cobrado_brl,
      vencimento: p.vencimento,
      status: p.status,
      is_entrada: p.is_entrada,
      paid_at: p.paid_at,
      moeda: c.moeda || "?",
      pais_destino: c.pais_destino || null,
      estudante_nome: c.estudante_nome || null,
      contrato_nome: c.nome || null,
      titular_nome: t.nome_completo || null,
      titular_cpf: t.cpf || null,
    };
  });

  const paraMetrica: ParcelaMetrica[] = lista.map((p) => ({
    status: p.status,
    vencimento: p.vencimento,
    valor_atual: p.valor_atual,
    moeda: p.moeda,
  }));
  const pagamentosMetrica: PagamentoMetrica[] = (pagamentos || []).map((pg: any) => ({
    valor_brl: pg.valor_brl,
    pago_em: pg.pago_em,
  }));

  const metricas = calcularMetricas(paraMetrica, pagamentosMetrica, hojeISO);

  return { hojeISO, metricas, parcelas: lista };
}
