import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getZohoRecord } from "@/lib/zoho";
import { getZohoAttachments } from "@/lib/zoho"; import { categorizarNomeArquivo } from "@/lib/documentos";
import { resolverTitular, dadosPrograma, dadosComerciais } from "@/lib/zoho-contato";
import { normalizarNome } from "@/lib/supplier-sync";
import { calcularVencimentosParcelas, dividirValorParcelas, somaParcelasConfere } from "@/lib/parcelas";

export const runtime = "nodejs";

// Webhook do Zoho CRM: disparado por uma Workflow Rule no modulo Contatos
// quando um contato e criado/atualizado com um Produto Adquirido vinculado.
// Espera receber ?contactId=<ID do Contato no Zoho CRM> (o ID nao e um dado
// pessoal, apenas o identificador interno do registro).
//
// Fluxo: busca o Contato completo no Zoho CRM -> upsert do titular (por CPF)
// -> se houver Produto Adquirido, busca o Produto -> cria contrato + parcelas
// (entrada + parcelas mensais no dia 15) caso ainda nao existam para esse
// titular + produto.
//
// IMPORTANTE: o contrato e as parcelas sao salvos na MOEDA DO PRODUTO (ex:
// CAD, USD, EUR), sem conversao para BRL neste momento. A conversao para
// BRL acontece depois, parcela por parcela, no dia em que o Pix e gerado
// (ver /api/parcelas/[id]/gerar-cobranca), usando a cotacao VET do dia
// cadastrada manualmente pela equipe na tabela "cotacoes_cambio".
export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);

    // Autenticacao. Esta rota estava TOTALMENTE aberta: qualquer POST na
    // internet com ?contactId= fazia o servidor buscar aquele contato com as
    // credenciais Zoho da empresa e dar upsert em titulares por CPF,
    // sobrescrevendo email, telefone e nome. Como o email e o canal de entrega
    // do codigo de login, isso encadeava para tomada de conta.
    //
    // Falha FECHADO: sem o secret configurado a rota recusa, em vez de
    // degradar em silencio para "sem autenticacao".
    const secret = process.env.ZOHO_WEBHOOK_SECRET;
    if (!secret) {
          console.error("ZOHO_WEBHOOK_SECRET nao configurado: webhook do Zoho recusado.");
          return NextResponse.json({ ok: false, erro: "Webhook nao configurado" }, { status: 503 });
    }

    const tokenRecebido =
          request.headers.get("x-exp-webhook-token") || searchParams.get("token") || "";
    const a = Buffer.from(tokenRecebido);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return NextResponse.json({ ok: false, erro: "Nao autorizado" }, { status: 401 });
    }

    let contactId = searchParams.get("contactId");

    // Fallback: a Workflow Rule do Zoho envia o contactId no corpo da
    // requisicao (Formulario-Dados) quando o metodo e POST, em vez de
    // como query string na URL. Tentamos ler dos dois lugares.
    if (!contactId) {
          try {
                  const contentType = request.headers.get("content-type") || "";
                  if (contentType.includes("application/json")) {
                            const body = await request.clone().json();
                            contactId = body?.contactId ?? null;
                  } else {
                            const form = await request.clone().formData();
                            const value = form.get("contactId");
                            contactId = typeof value === "string" ? value : null;
                  }
          } catch (err) {
                  console.error("Falha ao ler corpo da requisicao do webhook", err);
          }
    }

    if (!contactId) {
          return NextResponse.json({ ok: false, error: "contactId ausente" }, { status: 400 });
    }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let contato;
  try {
    contato = await getZohoRecord("Contacts", contactId);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Falha ao buscar contato no Zoho" }, { status: 502 });
  }

  // Resolve o CPF de login e o nome do titular. Regra: o titular e o
  // responsavel financeiro -> usa o CPF do Responsavel 1; se nao houver
  // (aluno adulto), cai para o CPF do estudante.
  const { cpf, nome: nomeCompleto } = resolverTitular(contato);
  const telefone = contato.Phone || contato.Mobile || null;
    const email = contato.Email || null;
  const produtoLookup = contato.Produto_Adquirido;

  if (!cpf || !nomeCompleto) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Contato do Zoho sem CPF (do estudante ou do responsavel 1) ou sem nome preenchido",
      },
      { status: 422 }
    );
  }

  const { data: titular, error: titularError } = await supabase
    .from("titulares")
    .upsert(
        { cpf, nome_completo: nomeCompleto, telefone, email, zoho_contact_id: contactId },
      { onConflict: "cpf" }
    )
    .select()
    .single();

  if (titularError || !titular) {
    console.error(titularError);
    return NextResponse.json({ ok: false, error: "Falha ao salvar titular no Supabase" }, { status: 500 });
  }
    try { const anexos = await getZohoAttachments("Contacts", contactId); for (const anexo of anexos) { const nomeArquivo = anexo.File_Name || "documento"; const tipoDocumento = categorizarNomeArquivo(nomeArquivo); if (tipoDocumento) { await supabase.from("documentos").upsert({ titular_id: titular.id, tipo_documento: tipoDocumento, nome_arquivo: nomeArquivo, origem: "zoho", zoho_module: "Contacts", zoho_record_id: contactId, zoho_attachment_id: anexo.id, tamanho_bytes: anexo.Size || null }, { onConflict: "titular_id,zoho_attachment_id" }); } } } catch (err) { console.error("Falha ao sincronizar documentos do Zoho", err); }

  if (!produtoLookup?.id) {
    return NextResponse.json({ ok: true, titular_id: titular.id, contrato: null });
  }

  let produto;
  try {
    produto = await getZohoRecord("Products", produtoLookup.id);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "Falha ao buscar produto no Zoho" }, { status: 502 });
  }

  // Dados comerciais do contrato (valor total, moeda, entrada, nº de parcelas).
  // Fonte de verdade e o CONTATO (comercial negociado por cliente); o Produto
  // e fallback (retrocompatibilidade) e catalogo (nome do curso). A moeda nao
  // e convertida aqui -- isso acontece parcela a parcela, no dia do Pix.
  // A validacao de valor/parcelas so acontece na criacao de um contrato NOVO
  // (mais abaixo): um contrato ja existente sincroniza escola/programa sem
  // depender de preco.
  const { nomeProduto, moeda, valorTotal, valorEntrada } =
    dadosComerciais(contato, produto);

  // Dados do programa vindos do Contato (estudante, sexo, destino, data e
  // escola). So incluimos os campos que o Zoho tem preenchidos, para nunca
  // sobrescrever com null um dado ja ajustado manualmente no portal.
  const prog = dadosPrograma(contato);
  const camposContrato: Record<string, unknown> = {};
  if (prog.estudanteNome) camposContrato.estudante_nome = prog.estudanteNome;
  if (prog.estudanteSexo) camposContrato.estudante_sexo = prog.estudanteSexo;
  if (prog.paisDestino) camposContrato.pais_destino = prog.paisDestino;
  if (prog.dataInicio) camposContrato.data_inicio = prog.dataInicio;
  // Sempre grava o contato do Zoho no contrato: e a chave estavel de dedupe
  // (independe de qual CPF virou titular) e cura contratos antigos sem ela.
  camposContrato.zoho_contact_id = contactId;

  // Grava a escola (Vendor_Name) em viagem_info sem apagar endereco/contatos
  // ja preenchidos. Nao-fatal: uma falha aqui nao impede a criacao do contrato.
  async function sincronizarViagemInfo(contratoId: string) {
    if (!prog.escolaNome) return;
    try {
      await supabase
        .from("viagem_info")
        .upsert(
          { contrato_id: contratoId, escola_nome: prog.escolaNome },
          { onConflict: "contrato_id" }
        );
    } catch (err) {
      console.error("Falha ao sincronizar escola (viagem_info) do Zoho", err);
    }
  }

  // Resolve o fornecedor (supplier) deste contrato, para vincular contratos.supplier_id
  // ja no provisionamento -- sem depender de rodar a sincronizacao de Vendors depois.
  // Prioridade:
  //   1) pelo ID do Vendor no lookup (exato, casa com supplier.zoho_vendor_id);
  //   2) fallback pelo NOME normalizado do Vendor (so quando ha um unico supplier
  //      com aquele nome, para nunca vincular ao fornecedor errado).
  // O webhook NAO cria supplier: se o Vendor ainda nao foi sincronizado, o
  // contrato fica sem supplier_id e sera vinculado na proxima sync de Vendors.
  async function resolverSupplierId(): Promise<string | null> {
    if (prog.escolaVendorId) {
      const { data } = await supabase
        .from("supplier")
        .select("id")
        .eq("zoho_vendor_id", prog.escolaVendorId)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
    if (prog.escolaNome) {
      const alvo = normalizarNome(prog.escolaNome);
      if (alvo) {
        const { data } = await supabase.from("supplier").select("id, display_name");
        const casados = (data ?? []).filter(
          (s) => normalizarNome((s as { display_name?: string }).display_name) === alvo
        );
        if (casados.length === 1) return (casados[0] as { id: string }).id;
      }
    }
    return null;
  }
  const supplierId = await resolverSupplierId();

  // Dedupe: primeiro pelo contato do Zoho gravado no contrato (chave estavel,
  // nao depende de qual CPF virou titular); se nao houver, pelo par
  // titular + produto (contratos antigos, antes de gravarmos o contact id).
  let contratoExistente: { id: string } | null = null;
  {
    const { data } = await supabase
      .from("contratos")
      .select("id")
      .eq("zoho_contact_id", contactId)
      .maybeSingle();
    contratoExistente = data;
  }
  if (!contratoExistente) {
    const { data } = await supabase
      .from("contratos")
      .select("id")
      .eq("titular_id", titular.id)
      .eq("zoho_product_id", produtoLookup.id)
      .maybeSingle();
    contratoExistente = data;
  }

  if (contratoExistente) {
    // Contrato ja existe: nao mexemos em valores/parcelas, mas sincronizamos
    // os campos do programa (backfill para contratos ja na base).
    if (Object.keys(camposContrato).length > 0) {
      await supabase.from("contratos").update(camposContrato).eq("id", contratoExistente.id);
    }
    // Vincula o fornecedor apenas quando ainda esta vazio (nao sobrescreve uma
    // correcao manual feita no admin). Idempotente: rodar de novo nao muda nada.
    if (supplierId) {
      await supabase
        .from("contratos")
        .update({ supplier_id: supplierId })
        .eq("id", contratoExistente.id)
        .is("supplier_id", null);
    }
    await sincronizarViagemInfo(contratoExistente.id);
    return NextResponse.json({
      ok: true,
      titular_id: titular.id,
      contrato_id: contratoExistente.id,
      info: "Contrato ja existente para este titular e produto",
    });
  }

  // Contrato NOVO: agora sim exigimos valor e numero de parcelas. Preencha o
  // comercial no Contato do Zoho (Valor Total, Moeda, Valor de Entrada, Numero
  // de Parcelas) -- ou, para contratos antigos, no proprio Produto.
  if (!valorTotal) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Sem valor total (na moeda correta). Preencha o comercial no Contato do Zoho (ou no Produto).",
      },
      { status: 422 }
    );
  }

  // O NUMERO DE PARCELAS NAO E MAIS LIDO DO ZOHO: passou a ser derivado da
  // janela entre a data da compra e o inicio do programa (ver
  // calcularVencimentosParcelas em src/lib/parcelas.ts). Sem data de inicio
  // nao ha como aplicar a regra dos 30 dias (Clausula 7.4), entao a rota falha
  // FECHADO -- melhor recusar e cobrar o preenchimento no CRM do que gerar um
  // plano arbitrario que a equipe teria de corrigir na mao depois.
  if (!prog.dataInicio) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Contato sem Data de Inicio do programa. O numero de parcelas e calculado a partir dela; preencha no Contato do Zoho e salve novamente.",
      },
      { status: 422 }
    );
  }

  const { data: contrato, error: contratoError } = await supabase
    .from("contratos")
    .insert({
      titular_id: titular.id,
      nome: nomeProduto,
      valor_total: valorTotal,
      moeda,
      zoho_product_id: produtoLookup.id,
      // Fornecedor ja no provisionamento (quando o Vendor esta sincronizado).
      ...(supplierId ? { supplier_id: supplierId } : {}),
      ...camposContrato,
    })
    .select()
    .single();

  if (contratoError || !contrato) {
    console.error(contratoError);
    return NextResponse.json({ ok: false, error: "Falha ao criar contrato no Supabase" }, { status: 500 });
  }

  // Data da compra = hoje = vencimento da entrada.
  const dataCompra = new Date().toISOString().slice(0, 10);

  // Quantidade de parcelas derivada da janela ate o inicio do programa.
  // Janela curta gera menos parcelas; janela insuficiente gera zero, e nesse
  // caso o contrato fica so com a entrada valendo o total (a alternativa seria
  // criar uma parcela que ja nasce violando a regra dos 30 dias).
  const vencimentos = calcularVencimentosParcelas(dataCompra, prog.dataInicio);

  const entrada = vencimentos.length > 0 ? valorEntrada : valorTotal;
  const valoresParcelas = dividirValorParcelas(valorTotal - entrada, vencimentos.length);

  const parcelas: any[] = [
    {
      contrato_id: contrato.id,
      numero: 1,
      descricao: "Entrada",
      valor_original: entrada,
      valor_atual: entrada,
      vencimento: dataCompra,
      is_entrada: true,
    },
  ];

  vencimentos.forEach((vencimento, i) => {
    parcelas.push({
      contrato_id: contrato.id,
      numero: i + 2,
      descricao: `Parcela ${i + 1}/${vencimentos.length}`,
      valor_original: valoresParcelas[i],
      valor_atual: valoresParcelas[i],
      vencimento,
      is_entrada: false,
    });
  });

  // Invariante: entrada + parcelas tem de fechar com o valor do contrato.
  // Se nao fechar, aborta antes de gravar -- um contrato com plano torto e
  // pior do que um contrato nao provisionado.
  const valores = parcelas.map((p) => p.valor_original as number);
  if (!somaParcelasConfere(valores, valorTotal)) {
    await supabase.from("contratos").delete().eq("id", contrato.id);
    console.error("Plano de parcelas nao fecha com o valor total", { valores, valorTotal });
    return NextResponse.json(
      { ok: false, error: "Plano de parcelas nao fecha com o valor total do contrato" },
      { status: 500 }
    );
  }

  const { error: parcelasError } = await supabase.from("parcelas").insert(parcelas);

  if (parcelasError) {
    console.error(parcelasError);
    return NextResponse.json(
      { ok: false, error: "Contrato criado, mas falha ao gerar parcelas" },
      { status: 500 }
    );
  }

  await sincronizarViagemInfo(contrato.id);

  return NextResponse.json({
    ok: true,
    titular_id: titular.id,
    contrato_id: contrato.id,
    parcelas: parcelas.length,
  });
}
