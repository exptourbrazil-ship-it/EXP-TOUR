import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { converterParaBRL } from "@/lib/cambio";
import { valorProgramaAtual, dataLimiteQuitacao, saldoDevedorMoeda } from "@/lib/parcelas";
import ParcelasClient from "./ParcelasClient";

// Pagina do servidor (aba Financeiro): le a sessao autenticada, busca no
// Supabase apenas os contratos e parcelas do titular da sessao e entrega os
// dados para ParcelasClient. Os documentos agora tem pagina propria em
// /documentos (aba Docs), para que cada aba mostre somente o seu conteudo.
export default async function ParcelasPage() {
  const cookieStore = await cookies();
  const sessaoToken = cookieStore.get(SESSION_COOKIE)?.value;
  const sessao = verificarSessao(sessaoToken);

  if (!sessao) {
    redirect("/");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, nome, moeda, valor_total, data_inicio, estudante_nome")
    .eq("titular_id", sessao.titularId)
    .is("cancelado_em", null);

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo")
    .eq("id", sessao.titularId)
    .maybeSingle();

  const contratoIds = (contratos || []).map((c) => c.id);
  const moedaPorContrato = new Map((contratos || []).map((c) => [c.id, c.moeda]));
  const programaNome = contratos && contratos.length > 0 ? (contratos[0] as any).nome : null;
  const totalPrograma = contratos && contratos.length > 0 ? contratos.reduce((soma, c) => soma + Number((c as any).valor_total || 0), 0) : 0;
  const contratoId = contratos && contratos.length > 0 ? (contratos[0] as any).id : null;
  const dataInicio = contratos && contratos.length > 0 ? ((contratos[0] as any).data_inicio || null) : null;
  // Total do contrato editado (o mesmo que o servidor valida em /ajustar, que
  // usa este contratoId). Diferente de totalPrograma, que soma todos os
  // contratos do titular.
  const valorTotalContrato = contratos && contratos.length > 0 ? Number((contratos[0] as any).valor_total || 0) : 0;
  const estudanteNome = contratos && contratos.length > 0 ? (contratos[0] as any).estudante_nome : null;
  const nomeCliente = estudanteNome || (titular ? titular.nome_completo : null);

  let parcelas: any[] = [];

  if (contratoIds.length > 0) {
    const { data } = await supabase
      .from("parcelas")
      .select("*")
      .in("contrato_id", contratoIds)
      // Ordem CRONOLOGICA por vencimento (numero so desempata) para que uma
      // parcela inserida depois apareca na posicao certa pela data.
      .order("vencimento", { ascending: true })
      .order("numero", { ascending: true });

    parcelas = (data || []).map((p) => ({
      ...p,
      moeda: moedaPorContrato.get(p.contrato_id) || "BRL",
    }));
  }

  const moedasUnicas = Array.from(new Set(parcelas.map((p) => p.moeda).filter((m) => m && m !== "BRL")));
  const cotacoesPorMoeda = new Map<string, number>();

  if (moedasUnicas.length > 0) {
    const hojeISO = new Date().toISOString().slice(0, 10);
    for (const moeda of moedasUnicas) {
      const { data: cotacao } = await supabase
        .from("cotacoes_cambio")
        .select("cotacao_vet")
        .eq("moeda", moeda)
        .lte("data", hojeISO)
        .order("data", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cotacao) {
        cotacoesPorMoeda.set(moeda, Number(cotacao.cotacao_vet));
      }
    }
  }

  parcelas = parcelas.map((p) => {
    const cotacaoEstimada = cotacoesPorMoeda.get(p.moeda) || null;
    // A cotacao_vet ja embute cambio BACEN + spread + IOF; o valor estimado
    // e apenas a conversao, sem taxa administrativa fixa (alinhado ao valor
    // efetivamente cobrado em gerar-cobranca).
    const valorEstimadoBRL = cotacaoEstimada
      ? converterParaBRL(valorProgramaAtual(p), cotacaoEstimada)
      : null;
    return { ...p, cotacaoEstimada, valorEstimadoBRL };
  });

  const pagoAteAgora = parcelas.filter((p) => p.status === "pago").reduce((soma, p) => soma + Number(p.valor_original || 0), 0);

  // Extrato de Saldo Devedor (Clausulas 6.8/7.12): saldo remanescente na moeda,
  // seu equivalente em R$ pela cotacao do dia (valor de quitacao hoje) e a
  // data-limite de quitacao (D-30 do inicio).
  const moedaPrograma = contratos && contratos.length > 0 ? ((contratos[0] as any).moeda || "BRL") : "BRL";
  // Saldo devedor pela soma do valor efetivo (valor_atual) das parcelas nao
  // pagas — a obrigacao remanescente na moeda do programa (Clausula 6.3).
  const saldoMoeda = saldoDevedorMoeda(parcelas);
  const cotacaoDia = cotacoesPorMoeda.get(moedaPrograma) ?? null;
  const saldoBRLhoje = cotacaoDia ? converterParaBRL(saldoMoeda, cotacaoDia) : null;
  const quitarAte = dataLimiteQuitacao(dataInicio);

  // Antecipacoes exigidas pendentes (Clausula 7.5) — exibidas ao cliente.
  let antecipacoes: any[] = [];
  if (contratoIds.length > 0) {
    const { data: ant } = await supabase
      .from("antecipacoes")
      .select("id, documento, justificativa, valor, moeda, data_limite, comprovante_url")
      .in("contrato_id", contratoIds)
      .eq("status", "pendente")
      .order("data_limite", { ascending: true });
    antecipacoes = ant || [];
  }

  // Anexo III — Politica de Pagamento dos Fornecedores (Clausula 7.5.2).
  let anexoIII: any[] = [];
  if (contratoIds.length > 0) {
    const { data: ax } = await supabase
      .from("anexo_iii_itens")
      .select("id, fornecedor, natureza, valor, moeda, prazo, evento, documento_viabiliza, consequencia_atraso, politica_cancelamento, fonte")
      .in("contrato_id", contratoIds)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true });
    anexoIII = ax || [];
  }

  return createElement(ParcelasClient, { parcelas, programaNome, totalPrograma, pagoAteAgora, contratoId, dataInicio, valorTotalContrato, nomeCliente, saldoMoeda, saldoBRLhoje, quitarAte, antecipacoes, anexoIII });
}
