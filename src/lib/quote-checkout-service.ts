// Servico do CHECKOUT publico da cotacao (Fatia 2). Server-only: usa a service
// role (a rota cria o cliente e o passa). NUNCA importe em componente client.
//
// Fluxo do aceite (so aceite, sem pagamento):
//   1. deriva do BANCO os dados da opcao escolhida (dadosConversaoCotacao) —
//      valor/moeda/parcelas NUNCA vem de input do estudante;
//   2. resolve o Termo de Adesao vigente;
//   3. monta o plano de parcelas (motor puro montarPlanoConversao);
//   4. chama a funcao TRANSACIONAL converter_cotacao (titular + contrato +
//      parcelas + aceite + trilha, tudo-ou-nada, idempotente por cotacao);
//   5. dispara o codigo de acesso por e-mail (boas-vindas), best-effort.
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarPlanoConversao } from "@/lib/parcelas";
import { montarAnexoIIISeed } from "@/lib/anexo-iii-seed";
import { dadosConversaoCotacao } from "@/lib/quote-issue-service";
import { normalizarCpf, validarCpf, validarEmail, normalizarTelefone } from "@/lib/cadastro-service";
import { gerarCodigoAcesso, hashCodigoAcesso } from "@/lib/codigo-acesso";
import { enviarCodigoAcessoEmail } from "@/lib/email";
import { slugDoTenant } from "@/lib/tenant-slug";

export type DadosPagante = { cpf: string; email: string; telefone: string; nome?: string | null };
export type AceiteCtx = { ip: string | null; userAgent: string | null };
export type AcceptResult =
  | { ok: true; contratoId: string; jaConvertida: boolean }
  | { ok: false; erro: string; status: number };

// Traduz as excecoes da funcao SQL em mensagem + HTTP status para a rota publica.
function mapErroRpc(msg: string): { erro: string; status: number } {
  const m = (msg || "").toLowerCase();
  if (m.includes("cotacao_expirada")) return { erro: "Esta proposta expirou. Peça uma nova ao seu consultor.", status: 409 };
  if (m.includes("token_revogado")) return { erro: "Este link não está mais disponível.", status: 409 };
  if (m.includes("nao_selecionada") || m.includes("sem_opcao"))
    return { erro: "Escolha uma opção antes de aceitar.", status: 409 };
  if (m.includes("titular_outro_tenant"))
    return { erro: "Este CPF já está cadastrado em outra marca. Fale com o seu consultor.", status: 409 };
  if (m.includes("plano_invalido") || m.includes("valor_invalido"))
    return { erro: "Não foi possível montar a cobrança desta proposta. Fale com o seu consultor.", status: 422 };
  if (m.includes("quote_nao_encontrada")) return { erro: "Proposta não encontrada.", status: 404 };
  return { erro: "Não foi possível concluir o aceite agora. Tente novamente.", status: 500 };
}

export async function acceptQuote(
  supabase: SupabaseClient,
  token: string,
  pagante: DadosPagante,
  ctx: AceiteCtx,
): Promise<AcceptResult> {
  // Validacao do pagante (o CPF vira o login; o e-mail, o canal do codigo).
  const cpf = normalizarCpf(pagante.cpf);
  if (!validarCpf(cpf)) return { ok: false, erro: "CPF inválido.", status: 400 };
  if (!validarEmail(pagante.email)) return { ok: false, erro: "E-mail inválido.", status: 400 };
  const email = String(pagante.email).trim().toLowerCase();
  const telefone = normalizarTelefone(pagante.telefone) || null;

  // Dados da opcao escolhida, derivados do BANCO (nunca do estudante).
  const dados = await dadosConversaoCotacao(supabase, token);
  if (!dados) return { ok: false, erro: "Esta proposta não está disponível para aceite.", status: 409 };

  // Nome completo do estudante (uso server-side: vai para contrato.estudante_nome
  // e, na falta de nome do pagante, para titulares.nome_completo). Nunca retornado
  // ao cliente. Escopado por tenant.
  let estudanteNome: string | null = null;
  if (dados.studentId) {
    const { data: student } = await supabase
      .from("student")
      .select("first_name, last_name")
      .eq("tenant_id", dados.tenantId)
      .eq("id", dados.studentId)
      .maybeSingle();
    if (student) {
      estudanteNome = [student.first_name, student.last_name].filter(Boolean).join(" ").trim() || null;
    }
  }

  // Sem nome coletado no checkout minimo: usa o nome do estudante como padrao do
  // titular novo (o admin/CRM refina depois). Titular ja existente nao e tocado.
  const nome = (pagante.nome && pagante.nome.trim()) || estudanteNome || "Titular";

  // Termo de Adesao vigente (prova do aceite).
  const { data: termo } = await supabase
    .from("termos")
    .select("id, versao, hash")
    .eq("tipo", "adesao")
    .eq("ativo", true)
    .order("vigente_desde", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!termo) return { ok: false, erro: "Termo de adesão indisponível no momento.", status: 503 };

  // Plano de parcelas (motor puro; a funcao SQL revalida a soma sob lock).
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const plano = montarPlanoConversao({
    liquido: dados.liquido,
    entrada: dados.entrada,
    dataCompraISO: hoje,
    dataInicioISO: dados.dataInicio,
  });
  if (!plano.ok) return { ok: false, erro: "Não foi possível montar a cobrança desta proposta.", status: 422 };

  // Anexo III (Clausula 7.5.2): a cotacao aceita semeia um item-base POR LINHA da
  // opcao (programa, acomodacao, seguro, servicos). Derivado do banco; os campos
  // de politica da escola ficam para a equipe completar no /admin/anexo-iii.
  const anexoIII = montarAnexoIIISeed({
    itens: dados.itens,
    dataInicioContrato: dados.dataInicio,
    referencia: dados.reference,
  });

  // Conversao transacional (tudo-ou-nada, idempotente por cotacao).
  const { data: rpc, error } = await supabase.rpc("converter_cotacao", {
    p_quote_id: dados.quoteId,
    p_tenant_id: dados.tenantId,
    p_cpf: cpf,
    p_nome: nome,
    p_email: email,
    p_telefone: telefone,
    p_contrato_nome: dados.contratoNome,
    p_valor_total: dados.liquido,
    p_moeda: dados.currency,
    p_estudante_nome: estudanteNome,
    p_pais_destino: dados.paisDestino,
    p_data_inicio: dados.dataInicio,
    p_supplier_id: dados.supplierId,
    p_parcelas: plano.parcelas,
    p_termo_id: termo.id,
    p_versao: termo.versao,
    p_hash: termo.hash,
    p_ip: ctx.ip,
    p_user_agent: ctx.userAgent,
    p_option_index: dados.optionIndex,
    p_anexo_iii: anexoIII,
  });
  if (error) {
    const { erro, status } = mapErroRpc(error.message || "");
    return { ok: false, erro, status };
  }

  const contratoId = (rpc?.contrato_id as string) ?? "";
  const jaConvertida = !!rpc?.ja_convertida;

  // Boas-vindas: codigo de acesso para a Area do Cliente. Best-effort — NUNCA
  // derruba o aceite (o contrato ja esta gravado). O codigo SEMPRE vai para o
  // e-mail JA cadastrado do titular (nao o digitado): um titular pre-existente
  // recebe no seu proprio e-mail, fechando tomada de conta via CPF alheio.
  //
  // SO na PRIMEIRA conversao (jaConvertida=false): num duplo-submit concorrente,
  // o perdedor recebe jaConvertida=true (titular_id null) — se ele tambem
  // enviasse, invalidaria o codigo que o vencedor acabou de emitir. Reenvio de
  // codigo e responsabilidade do fluxo de login, com throttle proprio.
  const titularId = !jaConvertida ? ((rpc?.titular_id as string) ?? null) : null;
  try {
    if (titularId) {
      const { data: tit } = await supabase
        .from("titulares")
        .select("nome_completo, email, tenant_id")
        .eq("id", titularId)
        .maybeSingle();
      if (tit?.email) {
        // Invalida codigos anteriores abertos e grava o novo (so o HMAC).
        await supabase
          .from("codigos_acesso")
          .update({ used_at: new Date().toISOString() })
          .eq("titular_id", titularId)
          .is("used_at", null);
        const codigo = gerarCodigoAcesso();
        await supabase.from("codigos_acesso").insert({
          titular_id: titularId,
          codigo_hash: hashCodigoAcesso(codigo),
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        const slug = await slugDoTenant(supabase, tit.tenant_id);
        await enviarCodigoAcessoEmail(tit.email as string, (tit.nome_completo as string) || "", codigo, slug);
      }
    }
  } catch {
    // Sem o erro cru (pode conter o e-mail/PII). Fica registrado em email_logs.
    console.error("[checkout] falha ao enviar codigo de acesso de boas-vindas (ver email_logs)");
  }

  return { ok: true, contratoId, jaConvertida };
}
