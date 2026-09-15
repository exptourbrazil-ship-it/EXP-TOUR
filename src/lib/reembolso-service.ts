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
import { metricaPorAncora, direcaoDaAncora, calcularRetencaoCampus, type AncoraRetencao } from "@/lib/politica-retencao";
import { calcularReembolsoUnificado, type ReembolsoUnificadoResultado } from "@/lib/reembolso-unificado";
import {
  calcularRemuneracaoServicos,
  derivarEstadoProcesso,
  type RemuneracaoResultado,
} from "@/lib/remuneracao-servicos";
import { estadoDoContrato } from "@/lib/contrato-estado-service";
import { rankEstado } from "@/lib/contrato-estados";

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
  // v3.1: política cadastrada num modo cuja FONTE de dados o serviço ainda não
  // provê (valor semanal do curso/tudo; data de assinatura/reserva). Nesse caso
  // NÃO somamos 0 silenciosamente — sinalizamos para falhar visível.
  naoResolvida?: boolean;
  motivo?: string;
};

export type ReembolsoUnificadoView = {
  contratoId: string;
  programaNome: string;
  moedaPrograma: string;
  retencaoExpTour: number; // Remuneração da Forio (v3.1 se resolvida; senão Anexo I legado)
  etapaAplicada: EtapaChave; // etapa legada do Anexo I (mantida para compat)
  // v3.1: Remuneração por Serviços Prestados sobre o Componente Educacional
  // (degrau por estado + <30d, teto 800). null = caiu no cálculo legado.
  remuneracao: RemuneracaoResultado | null;
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
): Promise<{
  campusId: string | null;
  porAncora: Partial<Record<AncoraRetencao, { base: number; ancoraISO: string | null }>>;
  // v3.1: valor semanal (curso e tudo) p/ a retenção por N semanas. null quando a
  // duração em semanas não é derivável — aí a guarda mantém a política "não resolvida".
  pesos: { semanaCurso: number | null; semanaTudo: number | null };
}> {
  const vazio = { semanaCurso: null, semanaTudo: null };
  const { data: q } = await supabase
    .from("quote")
    .select("id, selected_option_id")
    .eq("converted_contract_id", contratoId)
    .maybeSingle();
  if (!q?.selected_option_id) return { campusId: null, porAncora: {}, pesos: vazio };

  const { data: itens } = await supabase
    .from("quote_item")
    .select("\"group\", campus_id, start_date, gross_amount, quantity, unit")
    .eq("quote_option_id", q.selected_option_id);

  const porAncora: Partial<Record<AncoraRetencao, { base: number; ancoraISO: string | null }>> = {};
  let campusId: string | null = null;
  let programaGross = 0;
  let totalGross = 0;
  let semanas = 0; // duração do CURSO em semanas (base da conta por semana)
  for (const it of itens ?? []) {
    const gross = num((it as any).gross_amount) ?? 0;
    totalGross += gross;
    const grupo = (it as any).group as string;
    if (grupo === "program") {
      programaGross += gross;
      const unit = String((it as any).unit ?? "").toLowerCase();
      const qtd = num((it as any).quantity) ?? 0;
      // Duração TOTAL do curso = SOMA das semanas dos itens program week-like
      // (cursos sequenciais somam). MAX inflaria o valor semanal com >1 curso.
      if (["week", "weeks", "semana", "semanas"].includes(unit)) semanas += qtd;
    }
    const ancora = GRUPO_ANCORA[grupo];
    if (!ancora) continue;
    if (!campusId && (it as any).campus_id) campusId = (it as any).campus_id as string;
    const ancoraISO = ((it as any).start_date as string) ?? null;
    // Soma bases do mesmo grupo (uma âncora pode ter mais de uma linha).
    const atual = porAncora[ancora];
    porAncora[ancora] = { base: (atual?.base ?? 0) + gross, ancoraISO: atual?.ancoraISO ?? ancoraISO };
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pesos = semanas > 0
    ? { semanaCurso: r2(programaGross / semanas), semanaTudo: r2(totalGross / semanas) }
    : vazio;
  return { campusId, porAncora, pesos };
}

// Componente Educacional do contrato (Cláusula 1.1.g.1): base da Remuneração por
// Serviços Prestados, ≠ Custo do Programa. Deriva dos itens da cotação convertida:
// curso e acomodação SEMPRE educacionais; seguro NUNCA; other/package pelo
// `product.componente`. Retorna null quando não há cotação/itens (contratos
// legados do CRM) — o chamador cai no cálculo legado (fail-safe).
async function componenteEducacionalDoContrato(
  supabase: SupabaseClient,
  contratoId: string,
): Promise<number | null> {
  const { data: q } = await supabase
    .from("quote")
    .select("selected_option_id")
    .eq("converted_contract_id", contratoId)
    .maybeSingle();
  if (!q?.selected_option_id) return null;
  const { data: itens } = await supabase
    .from("quote_item")
    .select("\"group\", gross_amount, product:product_id(componente)")
    .eq("quote_option_id", q.selected_option_id);
  if (!itens || itens.length === 0) return null;
  let total = 0;
  for (const it of itens as Array<Record<string, unknown>>) {
    const grupo = it.group as string;
    const prod = it.product as { componente?: string } | null;
    const educacional =
      grupo === "program" || grupo === "accommodation"
        ? true
        : grupo === "insurance"
          ? false
          : prod?.componente === "educacional"; // other/package: usa o componente do produto
    if (educacional) total += num(it.gross_amount) ?? 0;
  }
  return Math.round(total * 100) / 100;
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
  // Remuneração por Serviços Prestados: v3.1 (base = Componente Educacional, degrau
  // por estado + <30d, teto 800) quando derivável; senão o cálculo legado do Anexo I
  // (base = valor_total). Reatribuído abaixo, após resolver estado + diasAteInicio.
  let retencaoExpTour = base.resultado.totalRetido;

  const { data: contrato } = await supabase
    .from("contratos")
    .select("data_inicio, pais_destino, titular_id, created_at, visto_status")
    .eq("id", contratoId)
    .maybeSingle();
  const dataInicioISO = (contrato?.data_inicio as string) ?? null;
  const paisDestino = (contrato?.pais_destino as string) ?? null;
  // Data de assinatura = criação do contrato (converter_cotacao insere o contrato
  // no mesmo ato do aceite). Âncora das políticas de retenção por 'assinatura'.
  const assinaturaISO = (contrato?.created_at as string)?.slice(0, 10) ?? null;

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
  const { campusId, porAncora, pesos } = await resolverAncorasDoCampus(supabase, contratoId);
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
      const naoResolvidas: string[] = [];
      for (const pol of aplicaveis) {
        const anc = porAncora[pol.ancora];
        // Data da âncora: acomodação/curso vêm de porAncora (ou início do curso);
        // assinatura = criação do contrato; reserva ainda não tem fonte de data.
        const ancoraISO =
          anc?.ancoraISO ??
          (pol.ancora === "inicio_curso" ? dataInicioISO : pol.ancora === "assinatura" ? assinaturaISO : null);
        const baseRet = anc?.base ?? 0;

        // v3.1 — FALHA VISÍVEL, não silenciosa: se um modo novo NÃO TEM a fonte de
        // dados necessária, marca a política como NÃO resolvida (não soma 0). Com a
        // fiação da frente B (valor semanal derivado de quote_item + data de
        // assinatura), os modos passam a CALCULAR quando os dados existem; só resta
        // 'reserva' (sem fonte de data) e cursos sem duração em semanas.
        const precisaSemanal = (pol.degraus || []).some((d) => d.retencaoSemanas != null || d.minimoSemanas != null);
        const semSemanal = precisaSemanal && pesos.semanaCurso == null;
        const semDataAncora = (pol.ancora === "assinatura" || pol.ancora === "reserva") && !ancoraISO;
        if (semSemanal || semDataAncora) {
          const motivo = semSemanal
            ? "retenção por semanas não calculável (duração do curso em semanas indisponível)"
            : `sem data da âncora (${pol.ancora}) para calcular`;
          naoResolvidas.push(`${pol.ancora}: ${motivo}`);
          fornecedor.politicas.push({ ancora: pol.ancora, unidade: pol.unidade, metrica: null, base: baseRet, retido: 0, naoResolvida: true, motivo });
          continue;
        }

        // âncoras assinatura/reserva medem métrica DECORRIDA; curso/acomodação,
        // RESTANTE. metricaPorAncora roteia; para as 2 âncoras antigas o resultado é
        // idêntico ao anterior (metricaRestante).
        const metrica = metricaPorAncora(pol.ancora, pol.unidade, { ancoraISO, cancelamentoISO, feriados });
        const r = calcularRetencaoCampus(pol, {
          base: baseRet,
          metricaRestante: metrica,
          sentido: direcaoDaAncora(pol.ancora),
          valorSemanaCurso: pesos.semanaCurso,
          valorSemanaTudo: pesos.semanaTudo,
        });
        fornecedor.total += r.totalRetido;
        fornecedor.politicas.push({ ancora: pol.ancora, unidade: pol.unidade, metrica, base: baseRet, retido: r.totalRetido });
      }
      if (naoResolvidas.length > 0) {
        fornecedor.resolvido = false;
        const aviso = `Política(s) não somada(s) — ${naoResolvidas.join("; ")}.`;
        fornecedor.motivo = fornecedor.motivo ? `${fornecedor.motivo} ${aviso}` : aviso;
      }
      fornecedor.total = Math.round(fornecedor.total * 100) / 100;
    }
  }

  // ── Remuneração por Serviços Prestados v3.1 (substitui a base tuition→Componente
  // Educacional + degrau por estado). Só quando o Componente Educacional é
  // derivável; senão mantém o cálculo legado do Anexo I (fail-safe).
  const compEdu = await componenteEducacionalDoContrato(supabase, contratoId);
  let remuneracao: RemuneracaoResultado | null = null;
  if (compEdu != null) {
    // estado do processo: LOA (documentos) + visto (visto_status em_analise/aprovado)
    // + matrícula submetida (estado do contrato ≥ 'documentacao', avançado pelo admin).
    const estadoContrato = await estadoDoContrato(supabase, contratoId);
    const rank = estadoContrato ? rankEstado(estadoContrato) : null;
    const rankDoc = rankEstado("documentacao");
    const matriculaSubmetida = rank != null && rankDoc != null && rank >= rankDoc;
    const vs = (contrato?.visto_status as string) ?? "";
    const estado = derivarEstadoProcesso({
      matriculaSubmetida,
      temLOA: base.sinais.temLOA,
      vistoInstruido: vs === "em_analise" || vs === "aprovado",
    });
    remuneracao = calcularRemuneracaoServicos({
      moeda: moedaPrograma,
      componenteEducacional: compEdu,
      estado,
      diasAteInicio,
      atrasoImputavel: false,
    });
    retencaoExpTour = remuneracao.valor;
  }

  const resultado = calcularReembolsoUnificado({
    moedaPrograma,
    retencaoExpTour,
    retencaoFornecedor: fornecedor.total,
    naoRecuperaveis: Math.max(0, num(opts.naoRecuperaveis) ?? 0),
    // v3.1: retencaoExpTour JÁ é a Remuneração da Forio (com teto/base corretos) —
    // não somar de novo o fee what-if (evita duplicação) nem deixar o combinador
    // aplicar o piso de proximidade sobre valor_total (a regra <30d já está embutida
    // na Remuneração, sobre o Componente Educacional e com teto). Legado mantém ambos.
    remuneracaoServicos: remuneracao != null ? 0 : Math.max(0, num(opts.remuneracaoServicos) ?? 0),
    tuition: base.tuition,
    diasAteInicio,
    ...(remuneracao != null
      ? { pisoProximidadePercentual: 0, rotuloRetencaoExpTour: "Remuneração por serviços prestados (Componente Educacional, teto 800)" }
      : {}),
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
    remuneracao,
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
