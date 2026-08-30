// Data layer do Documento Integral (Clausula 17.3). Server-only: usa a service
// role. Carrega TUDO escopado por POSSE (titular_id + contrato_id) e monta a
// entrada do motor puro. Retorna null quando o contrato NAO e do titular — a
// pagina traduz isso em 404 (nunca vaza contrato de outro cliente).
import type { SupabaseClient } from "@supabase/supabase-js";
import { SPREAD_PADRAO, IOF_PADRAO } from "@/lib/cambio";
import type { DocumentoIntegralInput, DocIntegralAnexoIIIItem } from "@/lib/documento-integral";

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export async function carregarDocumentoIntegral(
  supabase: SupabaseClient,
  titularId: string,
  contratoId: string,
): Promise<DocumentoIntegralInput | null> {
  // POSSE: o contrato precisa ser DESTE titular. Sem isso, 404.
  const { data: contrato } = await supabase
    .from("contratos")
    .select("id, nome, valor_total, moeda, estudante_nome, pais_destino, data_inicio, created_at, cancelado_em, quadro_resumo, hash_quadro, session_id")
    .eq("id", contratoId)
    .eq("titular_id", titularId)
    .maybeSingle();
  if (!contrato) return null;

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo")
    .eq("id", titularId)
    .maybeSingle();

  const snap = (contrato.quadro_resumo ?? null) as Record<string, unknown> | null;

  // Condicoes Gerais (texto): resolve o Termo pela VERSAO congelada no snapshot;
  // na falta, cai no Termo de adesao vigente. So texto+versao+hash — leitura.
  const versaoSnap =
    snap && typeof snap.termo === "object" && snap.termo
      ? ((snap.termo as Record<string, unknown>).versao as string | undefined)
      : undefined;

  type TermoRow = { id: string; versao: string; hash: string; conteudo: string | null };
  let termo: TermoRow | null = null;
  if (versaoSnap) {
    const { data } = await supabase
      .from("termos")
      .select("id, versao, hash, conteudo")
      .eq("tipo", "adesao")
      .eq("versao", versaoSnap)
      .maybeSingle();
    if (data) termo = data as TermoRow;
  }
  if (!termo) {
    const { data } = await supabase
      .from("termos")
      .select("id, versao, hash, conteudo")
      .eq("tipo", "adesao")
      .eq("ativo", true)
      .order("vigente_desde", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) termo = data as TermoRow;
  }

  // Prova do aceite: por (titular, termo). O grao de aceites e (titular, termo),
  // entao casa com a versao do Termo deste contrato.
  let aceite: DocumentoIntegralInput["aceite"] = null;
  if (termo) {
    const { data } = await supabase
      .from("aceites")
      .select("data_hora, ip, versao, hash_conteudo")
      .eq("titular_id", titularId)
      .eq("termo_id", termo.id)
      .order("data_hora", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      aceite = {
        dataHora: (data.data_hora as string) ?? "",
        ip: (data.ip as string) ?? null,
        versao: (data.versao as string) ?? termo.versao,
        hashConteudo: (data.hash_conteudo as string) ?? termo.hash,
      };
    }
  }

  // Anexo III (Politica de Pagamento dos Fornecedores) deste contrato.
  const { data: anexoRows } = await supabase
    .from("anexo_iii_itens")
    .select("fornecedor, natureza, valor, moeda, prazo, evento, documento_viabiliza, consequencia_atraso, politica_cancelamento, fonte, ordem")
    .eq("contrato_id", contratoId)
    .order("ordem", { ascending: true });
  const anexoIII: DocIntegralAnexoIIIItem[] = (anexoRows ?? []).map((r) => ({
    fornecedor: (r.fornecedor as string) ?? null,
    natureza: (r.natureza as string) ?? null,
    valor: r.valor != null ? num(r.valor) : null,
    moeda: (r.moeda as string) ?? null,
    prazo: (r.prazo as string) ?? null,
    evento: (r.evento as string) ?? null,
    documento_viabiliza: (r.documento_viabiliza as string) ?? null,
    consequencia_atraso: (r.consequencia_atraso as string) ?? null,
    politica_cancelamento: (r.politica_cancelamento as string) ?? null,
    fonte: (r.fonte as string) ?? null,
    ordem: num(r.ordem),
  }));

  return {
    contrato: {
      id: contrato.id as string,
      nome: (contrato.nome as string) ?? "",
      moeda: (contrato.moeda as string) ?? "BRL",
      valorTotal: num(contrato.valor_total),
      estudanteNome: (contrato.estudante_nome as string) ?? null,
      paisDestino: (contrato.pais_destino as string) ?? null,
      dataInicio: (contrato.data_inicio as string) ?? null,
      criadoEm: (contrato.created_at as string) ?? null,
      canceladoEm: (contrato.cancelado_em as string) ?? null,
      sessionId: (contrato.session_id as string) ?? null,
    },
    titularNome: (titular?.nome_completo as string) ?? null,
    quadroResumo: snap,
    condicoesGerais: termo ? { versao: termo.versao, hash: termo.hash, conteudo: termo.conteudo ?? "" } : null,
    anexoIII,
    aceite,
    // Percentuais VIGENTES por instancia (mesma fonte das rotas de cambio): o env
    // manda; o default de codigo e so fallback. Nunca hardcodar no documento legal.
    spread: Number(process.env.SPREAD_CAMBIO_PERCENTUAL || String(SPREAD_PADRAO)),
    iof: Number(process.env.IOF_CAMBIO_PERCENTUAL || String(IOF_PADRAO)),
  };
}

// Lista os contratos do titular para a aba Documentos (link para a via integral).
export async function listarContratosDoTitular(
  supabase: SupabaseClient,
  titularId: string,
): Promise<Array<{ id: string; nome: string; canceladoEm: string | null; temSnapshot: boolean }>> {
  const { data } = await supabase
    .from("contratos")
    .select("id, nome, cancelado_em, quadro_resumo, created_at")
    .eq("titular_id", titularId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((c) => ({
    id: c.id as string,
    nome: (c.nome as string) ?? "Contrato",
    canceladoEm: (c.cancelado_em as string) ?? null,
    temSnapshot: c.quadro_resumo != null,
  }));
}
