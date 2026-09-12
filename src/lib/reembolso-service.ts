// Data layer da calculadora de reembolso do Anexo I (Fatia 2). Server-only:
// service role. Uso ADMIN (a rota gateia por capacidade cancelamento.gerir). Reune
// os dados do contrato + sinais de etapa + total pago e delega ao motor puro.
//
// A etapa concluida vem do OVERRIDE do admin (contratos.etapa_anexo_i) quando
// presente; senao e DERIVADA dos sinais (entrada paga / LOA / visto aprovado).
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularReembolsoEscalonado, type ReembolsoResultado } from "@/lib/reembolso-anexo-i";
import { derivarEtapaAnexoI, etapaValida, type EtapaChave, type SinaisEtapa } from "@/lib/etapa-anexo-i";
import { carregarConfigTenant, tenantDoTitular } from "@/lib/tenant-config";
import { extrairComercial, recomporVetTenant } from "@/lib/cambio";
import { carregarPoliticasRetencao } from "@/lib/politica-retencao-service";
import { carregarFeriados } from "@/lib/dias-uteis-service";
import { metricaRestante, calcularRetencaoCampus, type AncoraRetencao } from "@/lib/politica-retencao";
import { calcularReembolsoUnificado, type ReembolsoUnificadoResultado } from "@/lib/reembolso-unificado";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ReembolsoContrato = {
  contratoId: string;
  programaNome: string;
  moeda: string;
  tuition: number;
  totalPago: number;
  sinais: SinaisEtapa;
  etapaDerivada: EtapaChave;
  etapaOverride: EtapaChave | null;
  etapaAplicada: EtapaChave;
  etapas: { chave: string; rotulo: string; percentual: number }[];
  resultado: ReembolsoResultado;
};

export type OpcoesReembolso = {
  naoRecuperaveis?: number; // simulacao/what-if do admin
  etapaOverrideEntrada?: string | null; // etapa forcada (query) sem gravar
  dispensa?: boolean;
};

export async function carregarReembolsoContrato(
  supabase: SupabaseClient,
  contratoId: string,
  opts: OpcoesReembolso = {},
): Promise<ReembolsoContrato | null> {
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, nome, moeda, valor_total, titular_id, visto_status, etapa_anexo_i")
    .eq("id", contratoId)
    .maybeSingle();
  if (!contrato) return null;

  const moeda = (contrato.moeda as string) || "BRL";
  // [colchetes] Base "tuition": por ora usamos o valor_total do contrato. O
  // juridico/financeiro define se a retencao incide so sobre o curso ou o total.
  const tuition = num(contrato.valor_total) ?? 0;

  // Total pago (na moeda) do ledger imutavel.
  const { data: pags } = await supabase
    .from("pagamentos")
    .select("valor_programa")
    .eq("contrato_id", contratoId);
  const totalPago = (pags ?? []).reduce((s, p) => s + (num(p.valor_programa) ?? 0), 0);

  // Sinais da etapa.
  const { data: entrada } = await supabase
    .from("parcelas")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("is_entrada", true)
    .eq("status", "pago")
    .limit(1)
    .maybeSingle();
  // LOA escopada por CONTRATO (a carta de aceite e por programa). Consultar so
  // por titular cruzaria contratos de um titular multi-programa e inflaria a
  // etapa/retencao do contrato errado.
  const { data: loa } = await supabase
    .from("documentos")
    .select("id")
    .eq("contrato_id", contratoId)
    .eq("tipo_documento", "carta_aceite")
    .limit(1)
    .maybeSingle();
  const sinais: SinaisEtapa = {
    entradaPaga: !!entrada,
    temLOA: !!loa,
    vistoAprovado: (contrato.visto_status as string) === "aprovado",
  };

  const etapaDerivada = derivarEtapaAnexoI(sinais);
  const etapaOverride = etapaValida(contrato.etapa_anexo_i) ? (contrato.etapa_anexo_i as EtapaChave) : null;
  // Precedencia: override forcado na query (what-if) > override gravado > derivada.
  const etapaQuery = etapaValida(opts.etapaOverrideEntrada) ? (opts.etapaOverrideEntrada as EtapaChave) : null;
  const etapaAplicada = etapaQuery ?? etapaOverride ?? etapaDerivada;

  // Teto + escalonamento por TENANT (linha do tenant -> env -> default).
  const cfg = await carregarConfigTenant(supabase, await tenantDoTitular(supabase, contrato.titular_id as string));

  const resultado = calcularReembolsoEscalonado({
    moeda,
    tuition,
    etapaChave: etapaAplicada,
    totalPago,
    naoRecuperaveis: Math.max(0, num(opts.naoRecuperaveis) ?? 0),
    dispensaRetencao: !!opts.dispensa,
    teto: cfg.reembolsoTeto,
    etapas: cfg.reembolsoEtapas,
  });

  return {
    contratoId: contrato.id as string,
    programaNome: (contrato.nome as string) || "Programa",
    moeda,
    tuition,
    totalPago,
    sinais,
    etapaDerivada,
    etapaOverride,
    etapaAplicada,
    etapas: cfg.reembolsoEtapas,
    resultado,
  };
}

// ---------------------------------------------------------------------------
// CALCULADORA UNIFICADA (P2): estado (Anexo I) + fornecedor (escada por campus)
// + câmbio, numa memória única. READ-ONLY (prévia p/ o admin; não persiste nem
// move dinheiro). O acerto continua com o seu próprio fluxo até validarmos.
// ---------------------------------------------------------------------------

export type PoliticaAplicada = {
  ancora: AncoraRetencao;
  unidade: string;
  metrica: number | null;
  base: number;
  retido: number;
};

export type ReembolsoUnificadoView = {
  contratoId: string;
  programaNome: string;
  moedaPrograma: string;
  retencaoExpTour: number; // Anexo I (capada, sem não-recuperáveis)
  etapaAplicada: EtapaChave;
  fornecedor: { resolvido: boolean; total: number; politicas: PoliticaAplicada[]; motivo?: string };
  cambio: { vet: number; ptax: number | null; iof: number; spread: number; resolvido: boolean };
  totalPagoBRL: number;
  diasAteInicio: number | null;
  resultado: ReembolsoUnificadoResultado;
};

function hojeSaoPauloISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function diasEntreISO(deISO: string, ateISO: string | null): number | null {
  if (!ateISO || ateISO.length < 10) return null;
  const de = Date.UTC(...(deISO.slice(0, 10).split("-").map(Number) as [number, number, number]));
  const ate = Date.UTC(...(ateISO.slice(0, 10).split("-").map(Number) as [number, number, number]));
  if (!Number.isFinite(de) || !Number.isFinite(ate)) return null;
  return Math.round((ate - de) / (24 * 60 * 60 * 1000));
}

const GRUPO_ANCORA: Record<string, AncoraRetencao> = {
  program: "inicio_curso",
  accommodation: "chegada_acomodacao",
};

// Resolve as bases (valor sujeito à retenção) e datas de âncora por grupo, a
// partir da cotação convertida neste contrato (best-effort: contratos vindos do
// CRM podem não ter cotação vinculada -> fornecedor não resolvido).
async function resolverAncorasDoCampus(
  supabase: SupabaseClient,
  contratoId: string,
): Promise<{ campusId: string | null; porAncora: Partial<Record<AncoraRetencao, { base: number; ancoraISO: string | null }>> }> {
  const { data: q } = await supabase
    .from("quote")
    .select("id, selected_option_id")
    .eq("converted_contract_id", contratoId)
    .maybeSingle();
  if (!q?.selected_option_id) return { campusId: null, porAncora: {} };

  const { data: itens } = await supabase
    .from("quote_item")
    .select("\"group\", campus_id, start_date, gross_amount")
    .eq("quote_option_id", q.selected_option_id);

  const porAncora: Partial<Record<AncoraRetencao, { base: number; ancoraISO: string | null }>> = {};
  let campusId: string | null = null;
  for (const it of itens ?? []) {
    const ancora = GRUPO_ANCORA[(it as any).group as string];
    if (!ancora) continue;
    if (!campusId && (it as any).campus_id) campusId = (it as any).campus_id as string;
    const base = num((it as any).gross_amount) ?? 0;
    const ancoraISO = ((it as any).start_date as string) ?? null;
    // Soma bases do mesmo grupo (uma âncora pode ter mais de uma linha).
    const atual = porAncora[ancora];
    porAncora[ancora] = { base: (atual?.base ?? 0) + base, ancoraISO: atual?.ancoraISO ?? ancoraISO };
  }
  return { campusId, porAncora };
}

export async function carregarReembolsoUnificado(
  supabase: SupabaseClient,
  contratoId: string,
  opts: { naoRecuperaveis?: number; remuneracaoServicos?: number; dataCancelamentoISO?: string } = {},
): Promise<ReembolsoUnificadoView | null> {
  // Componente EXP Tour (Anexo I) SEM não-recuperáveis (o combinador soma-os à
  // parte) — assim o teto do Anexo I incide só sobre a retenção escalonada.
  const base = await carregarReembolsoContrato(supabase, contratoId, { naoRecuperaveis: 0 });
  if (!base) return null;
  const moedaPrograma = base.moeda;
  const retencaoExpTour = base.resultado.totalRetido;

  const { data: contrato } = await supabase
    .from("contratos")
    .select("data_inicio, pais_destino, titular_id")
    .eq("id", contratoId)
    .maybeSingle();
  const dataInicioISO = (contrato?.data_inicio as string) ?? null;
  const paisDestino = (contrato?.pais_destino as string) ?? null;

  const hoje = hojeSaoPauloISO();
  const cancelamentoISO = opts.dataCancelamentoISO?.slice(0, 10) || hoje;
  const diasAteInicio = diasEntreISO(hoje, dataInicioISO);

  // Total pago em BRL (ledger imutável de pagamentos).
  const { data: pags } = await supabase.from("pagamentos").select("valor_brl").eq("contrato_id", contratoId);
  const totalPagoBRL = (pags ?? []).reduce((s, p) => s + (num((p as any).valor_brl) ?? 0), 0);

  // Câmbio: VET do dia da moeda do programa. cotacoes_cambio é GLOBAL por
  // moeda/dia — recompõe a VET para o spread/IOF do TENANT (mesmo padrão de
  // gerar-cobranca e extrato-service), senão a conversão sai errada por instância.
  // BRL -> 1. Moeda estrangeira SEM cotação -> não converte às cegas (marca não
  // resolvido; a prévia exibe o aviso em vez de subavaliar a retenção com VET=1).
  const cfg = await carregarConfigTenant(supabase, await tenantDoTitular(supabase, contrato?.titular_id as string));
  const moedaUp = (moedaPrograma || "BRL").toUpperCase();
  let vet = 1;
  let cambioResolvido = true;
  if (moedaUp !== "BRL") {
    const { data: cot } = await supabase
      .from("cotacoes_cambio")
      .select("cotacao_vet, spread, iof")
      .eq("moeda", moedaPrograma)
      .lte("data", hoje)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle();
    const v = num(cot?.cotacao_vet);
    if (v && v > 0) {
      const spreadArmazenado = num((cot as any)?.spread);
      const iofArmazenado = num((cot as any)?.iof);
      vet =
        spreadArmazenado != null && iofArmazenado != null
          ? recomporVetTenant(v, spreadArmazenado, iofArmazenado, cfg.spreadCambio, cfg.iofCambio)
          : v;
    } else {
      cambioResolvido = false; // sem cotação -> VET fica 1, mas sinalizada como não resolvida
    }
  }
  const ptax = moedaUp !== "BRL" && cambioResolvido
    ? Math.round(extrairComercial(vet, cfg.spreadCambio, cfg.iofCambio) * 1e6) / 1e6
    : null;

  // Retenção do fornecedor (escada por campus), best-effort.
  const fornecedor: ReembolsoUnificadoView["fornecedor"] = { resolvido: false, total: 0, politicas: [] };
  const { campusId, porAncora } = await resolverAncorasDoCampus(supabase, contratoId);
  if (!campusId) {
    fornecedor.motivo = "Contrato sem campus vinculado (cotação não encontrada).";
  } else {
    const politicas = await carregarPoliticasRetencao(supabase, campusId);
    if (politicas.length === 0) {
      fornecedor.motivo = "Campus sem política de retenção cadastrada.";
    } else {
      // Feriados só quando alguma política usa dias úteis.
      const precisaFeriados = politicas.some((p) => p.unidade === "dias_uteis");
      const feriados = precisaFeriados && paisDestino
        ? await carregarFeriados(supabase, { pais: paisDestino, deISO: cancelamentoISO, ateISO: dataInicioISO ?? undefined })
        : undefined;
      // Guarda de moeda: só soma políticas na MESMA moeda do programa (a conversão
      // única pela VET pressupõe isso). Política em moeda diferente é ignorada e
      // registrada no motivo — evita misturar CAD+GBP num total cru.
      const aplicaveis = politicas.filter((p) => (p.moeda || "").toUpperCase() === moedaUp);
      const ignoradas = politicas.length - aplicaveis.length;
      fornecedor.resolvido = aplicaveis.length > 0;
      if (aplicaveis.length === 0) {
        fornecedor.motivo = "Política(s) do campus em moeda diferente do programa — não somada(s).";
      } else if (ignoradas > 0) {
        fornecedor.motivo = `${ignoradas} política(s) em moeda diferente do programa foram ignoradas.`;
      }
      for (const pol of aplicaveis) {
        const anc = porAncora[pol.ancora];
        const ancoraISO = anc?.ancoraISO ?? (pol.ancora === "inicio_curso" ? dataInicioISO : null);
        const baseRet = anc?.base ?? 0;
        const metrica = metricaRestante(pol.unidade, { ancoraISO, cancelamentoISO, feriados });
        const r = calcularRetencaoCampus(pol, { base: baseRet, metricaRestante: metrica });
        fornecedor.total += r.totalRetido;
        fornecedor.politicas.push({ ancora: pol.ancora, unidade: pol.unidade, metrica, base: baseRet, retido: r.totalRetido });
      }
      fornecedor.total = Math.round(fornecedor.total * 100) / 100;
    }
  }

  const resultado = calcularReembolsoUnificado({
    moedaPrograma,
    retencaoExpTour,
    retencaoFornecedor: fornecedor.total,
    naoRecuperaveis: Math.max(0, num(opts.naoRecuperaveis) ?? 0),
    remuneracaoServicos: Math.max(0, num(opts.remuneracaoServicos) ?? 0),
    tuition: base.tuition,
    diasAteInicio,
    vet,
    ptax: ptax ?? undefined,
    iof: cfg.iofCambio,
    spread: cfg.spreadCambio,
    totalPagoBRL,
  });

  return {
    contratoId,
    programaNome: base.programaNome,
    moedaPrograma,
    retencaoExpTour,
    etapaAplicada: base.etapaAplicada,
    fornecedor,
    cambio: { vet, ptax, iof: cfg.iofCambio, spread: cfg.spreadCambio, resolvido: cambioResolvido },
    totalPagoBRL: Math.round(totalPagoBRL * 100) / 100,
    diasAteInicio,
    resultado,
  };
}

// Grava (ou limpa) o override da etapa concluida do Anexo I. Null limpa -> volta
// a derivar dos sinais. Retorna false se a etapa for invalida.
export async function definirEtapaAnexoI(
  supabase: SupabaseClient,
  contratoId: string,
  etapa: string | null,
): Promise<boolean> {
  if (etapa !== null && !etapaValida(etapa)) return false;
  // .select() confirma a linha afetada: um id inexistente casa 0 linhas sem erro
  // -> retornariamos "sucesso" falso e sujariamos a auditoria. Exige 1 contrato.
  const { data, error } = await supabase
    .from("contratos")
    .update({ etapa_anexo_i: etapa })
    .eq("id", contratoId)
    .select("id");
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}
