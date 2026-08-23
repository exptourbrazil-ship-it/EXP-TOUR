import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createElement, Fragment } from "react";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import AcertoPropostaClient from "./AcertoPropostaClient";
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

  // Acerto PROPOSTO ao cliente (Fatia B): exibido para aceite eletronico acima
  // do plano. So os contratos do titular da sessao (posse); a rota de aceite
  // revalida tudo.
  let acertoProposta: {
    id: string;
    moeda: string | null;
    saldoDevolverCliente: number | null;
    memoria: { rotulo: string; valor: number; tipo: string }[] | null;
    termoConteudo: string | null;
  } | null = null;
  // TODOS os contratos do titular (inclusive cancelados): o acerto e, por
  // definicao, de um cancelamento, entao a proposta precisa aparecer mesmo com o
  // contrato ja marcado cancelado_em. Posse garantida pelo titular_id da sessao.
  const { data: contratosTodos } = await supabase
    .from("contratos")
    .select("id")
    .eq("titular_id", sessao.titularId);
  const contratoIdsTodos = (contratosTodos || []).map((c) => c.id);
  if (contratoIdsTodos.length > 0) {
    const { data: prop } = await supabase
      .from("acertos")
      .select("id, moeda, saldo_devolver_cliente, memoria, termo_id")
      .in("contrato_id", contratoIdsTodos)
      .eq("status", "proposto")
      .order("proposto_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prop) {
      let termoConteudo: string | null = null;
      if ((prop as { termo_id?: string }).termo_id) {
        const { data: termo } = await supabase
          .from("termos")
          .select("conteudo")
          .eq("id", (prop as { termo_id: string }).termo_id)
          .maybeSingle();
        termoConteudo = (termo as { conteudo?: string } | null)?.conteudo ?? null;
      }
      acertoProposta = {
        id: (prop as { id: string }).id,
        moeda: (prop as { moeda?: string | null }).moeda ?? null,
        saldoDevolverCliente: (prop as { saldo_devolver_cliente?: number | null }).saldo_devolver_cliente ?? null,
        memoria: (prop as { memoria?: { rotulo: string; valor: number; tipo: string }[] | null }).memoria ?? null,
        termoConteudo,
      };
    }
  }

  return createElement(
    Fragment,
    null,
    acertoProposta ? createElement(AcertoPropostaClient, { key: "acerto", proposta: acertoProposta }) : null,
    createElement(ParcelasClient, { parcelas, programaNome, totalPrograma, pagoAteAgora, contratoId, dataInicio, valorTotalContrato, nomeCliente, saldoMoeda, saldoBRLhoje, quitarAte, antecipacoes, anexoIII })
  );
}
