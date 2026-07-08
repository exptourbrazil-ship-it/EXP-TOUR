import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getZohoRecord } from "@/lib/zoho";

// Webhook do Zoho CRM: disparado por uma Workflow Rule no modulo Contatos
// quando um contato e criado/atualizado com um Produto Adquirido vinculado.
// Espera receber ?contactId=<ID do Contato no Zoho CRM> (o ID nao e um dado
// pessoal, apenas o identificador interno do registro).
//
// Fluxo: busca o Contato completo no Zoho CRM -> upsert do titular (por CPF)
// -> se houver Produto Adquirido, busca o Produto -> cria contrato + parcelas
// (entrada + parcelas mensais no dia 15) caso ainda nao existam para esse
// titular + produto.
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");

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

  const cpf = String(contato.CPF || "").replace(/\D/g, "");
  const nomeCompleto =
    contato.Full_Name || `${contato.First_Name || ""} ${contato.Last_Name || ""}`.trim();
  const telefone = contato.Phone || contato.Mobile || null;
  const produtoLookup = contato.Produto_Adquirido;

  if (!cpf || !nomeCompleto) {
    return NextResponse.json(
      { ok: false, error: "Contato do Zoho sem CPF ou nome preenchido" },
      { status: 422 }
    );
  }

  const { data: titular, error: titularError } = await supabase
    .from("titulares")
    .upsert(
      { cpf, nome_completo: nomeCompleto, telefone, zoho_contact_id: contactId },
      { onConflict: "cpf" }
    )
    .select()
    .single();

  if (titularError || !titular) {
    console.error(titularError);
    return NextResponse.json({ ok: false, error: "Falha ao salvar titular no Supabase" }, { status: 500 });
  }

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

  const valorTotal = Number(produto.Unit_Price || 0);
  const numeroParcelas = Number(produto.Numero_de_Parcelas || 0);
  const valorEntrada = Number(produto.Valor_de_Entrada || 0);
  const nomeProduto = produto.Product_Name || "Viagem EXP Tour";

  if (!valorTotal || !numeroParcelas) {
    return NextResponse.json(
      { ok: false, error: "Produto no Zoho sem preco ou numero de parcelas configurados" },
      { status: 422 }
    );
  }

  const { data: contratoExistente } = await supabase
    .from("contratos")
    .select("id")
    .eq("titular_id", titular.id)
    .eq("zoho_product_id", produtoLookup.id)
    .maybeSingle();

  if (contratoExistente) {
    return NextResponse.json({
      ok: true,
      titular_id: titular.id,
      contrato_id: contratoExistente.id,
      info: "Contrato ja existente para este titular e produto",
    });
  }

  // OBS: moeda fixada em BRL pois e a moeda configurada na organizacao do
  // Zoho CRM. Os contratos importados anteriormente da planilha usam CAD;
  // reconciliar quando a precificacao real (multi-moeda) estiver definida.
  const { data: contrato, error: contratoError } = await supabase
    .from("contratos")
    .insert({
      titular_id: titular.id,
      nome: nomeProduto,
      valor_total: valorTotal,
      moeda: "BRL",
      zoho_product_id: produtoLookup.id,
    })
    .select()
    .single();

  if (contratoError || !contrato) {
    console.error(contratoError);
    return NextResponse.json({ ok: false, error: "Falha ao criar contrato no Supabase" }, { status: 500 });
  }

  const hoje = new Date();
  const parcelas: any[] = [
    {
      contrato_id: contrato.id,
      numero: 1,
      descricao: "Entrada",
      valor_original: valorEntrada,
      valor_atual: valorEntrada,
      vencimento: hoje.toISOString().slice(0, 10),
      is_entrada: true,
    },
  ];

  const valorRestante = valorTotal - valorEntrada;
  const valorParcelaBase = Math.floor((valorRestante / numeroParcelas) * 100) / 100;
  let somaParcelas = 0;

  for (let i = 0; i < numeroParcelas; i++) {
    const isUltima = i === numeroParcelas - 1;
    const valor = isUltima ? Number((valorRestante - somaParcelas).toFixed(2)) : valorParcelaBase;
    somaParcelas += valor;

    const vencimento = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, 15);

    parcelas.push({
      contrato_id: contrato.id,
      numero: i + 2,
      descricao: `Parcela ${i + 1}/${numeroParcelas}`,
      valor_original: valor,
      valor_atual: valor,
      vencimento: vencimento.toISOString().slice(0, 10),
      is_entrada: false,
    });
  }

  const { error: parcelasError } = await supabase.from("parcelas").insert(parcelas);

  if (parcelasError) {
    console.error(parcelasError);
    return NextResponse.json(
      { ok: false, error: "Contrato criado, mas falha ao gerar parcelas" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    titular_id: titular.id,
    contrato_id: contrato.id,
    parcelas: parcelas.length,
  });
}
