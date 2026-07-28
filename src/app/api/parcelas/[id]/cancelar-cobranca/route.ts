import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { verificarSessao, SESSION_COOKIE } from "@/lib/session"

// Cancela uma cobranca Pix que foi gerada mas ainda NAO foi paga,
// devolvendo a parcela para o estado "em aberto" (como as demais parcelas
// pendentes). Limpa qr_code_url, payment_link e external_payment_id, o que
// tambem volta a permitir editar a parcela na tela de ajuste.
//
// Regras de seguranca (SEMPRE no servidor):
//  - sessao autenticada
//  - a parcela precisa pertencer a um contrato do titular da sessao
//  - se a parcela ja estiver paga (status "pago"), o cancelamento e
//    bloqueado, pois um pagamento confirmado nao pode ser desfeito aqui.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value)

  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão não autenticada" }, { status: 401 })
  }

  const parcelaId = id
  if (!parcelaId) {
    return NextResponse.json({ ok: false, erro: "Parcela não informada" }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 1) Carrega a parcela e o contrato dono dela.
  const { data: parcela, error: erroParcela } = await supabase
    .from("parcelas")
    .select("id, status, contrato_id")
    .eq("id", parcelaId)
    .single()

  if (erroParcela || !parcela) {
    return NextResponse.json({ ok: false, erro: "Parcela não encontrada" }, { status: 404 })
  }

  // 2) Confere que o contrato pertence ao titular autenticado.
  const { data: contrato, error: erroContrato } = await supabase
    .from("contratos")
    .select("id, titular_id")
    .eq("id", (parcela as any).contrato_id)
    .single()

  if (erroContrato || !contrato) {
    return NextResponse.json({ ok: false, erro: "Contrato não encontrado" }, { status: 404 })
  }
  if ((contrato as any).titular_id !== sessao.titularId) {
    return NextResponse.json({ ok: false, erro: "Parcela não pertence ao titular autenticado" }, { status: 403 })
  }

  // 3) Nao permite cancelar uma parcela ja paga.
  if ((parcela as any).status === "pago") {
    return NextResponse.json({ ok: false, erro: "Esta parcela já foi paga e não pode voltar para em aberto." }, { status: 400 })
  }

  // 4) Limpa os dados da cobranca Pix, mantendo a parcela pendente. `valor_atual`
  // permanece intacto (sempre na moeda do programa, com o ajuste do cliente) —
  // so limpamos o BRL cobrado e a cotacao, que pertencem a cobranca cancelada.
  const { error: erroUpdate } = await supabase
    .from("parcelas")
    .update({
      qr_code_url: null,
      payment_link: null,
      external_payment_id: null,
      status: "pendente",
      valor_cobrado_brl: null,
      cotacao_aplicada: null,
    })
    .eq("id", parcelaId)

  if (erroUpdate) {
    return NextResponse.json({ ok: false, erro: "Não foi possível cancelar a cobrança." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
