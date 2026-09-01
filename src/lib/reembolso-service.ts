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
