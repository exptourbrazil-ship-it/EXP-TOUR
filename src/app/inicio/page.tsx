import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { verificarSessao, SESSION_COOKIE } from "@/lib/session"
import InicioClient from "./InicioClient"

// Dias ate o inicio, calculado NO SERVIDOR para dar um valor estavel ao
// primeiro render (o cliente reconfirma no fuso local apos montar). Isso evita
// divergencia de hidratacao e o "flash" da contagem regressiva.
function diasAteServidor(dataInicio: string | null): number | null {
  if (!dataInicio) return null
  const inicio = new Date(dataInicio + "T00:00:00")
  if (isNaN(inicio.getTime())) return null
  const hoje = new Date()
  const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((inicio.getTime() - h0.getTime()) / 86400000)
}

// Pagina do servidor: le a sessao autenticada (cookie httpOnly) e busca no
// Supabase (com a service role, que ignora RLS) o nome do titular e o
// contrato mais recente, para montar a saudacao e o resumo do programa
// exibidos na aba Inicio.
export default async function InicioPage() {
  const cookieStore = await cookies()
  const sessaoToken = cookieStore.get(SESSION_COOKIE)?.value
  const sessao = verificarSessao(sessaoToken)

  if (!sessao) {
    redirect("/")
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo, data_inicio")
    .eq("id", sessao.titularId)
    .maybeSingle()

  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, nome, valor_total, moeda, data_inicio, estudante_nome")
    .eq("titular_id", sessao.titularId)
    .is("cancelado_em", null)
    .order("id", { ascending: false })

  const contrato = (contratos && contratos[0]) || null
  const contratoIds = (contratos || []).map((c) => c.id)

  // Sinais reais para a "linha do tempo" da jornada (sem progresso ficticio).
  let parcelasTotal = 0
  let parcelasPagas = 0
  if (contratoIds.length > 0) {
    const { data: parcelas } = await supabase
      .from("parcelas")
      .select("status")
      .in("contrato_id", contratoIds)
    parcelasTotal = (parcelas || []).length
    parcelasPagas = (parcelas || []).filter((p) => p.status === "pago").length
  }

  const { count: documentosEnviados } = await supabase
    .from("documentos")
    .select("id", { count: "exact", head: true })
    .eq("titular_id", sessao.titularId)

  const dataInicioEfetiva =
    (contrato && (contrato as any).data_inicio) || (titular ? (titular as any).data_inicio : null) || null

  return (
    <InicioClient
      nomeCompleto={titular ? titular.nome_completo : null}
      contrato={contrato}
      dataInicioTitular={titular ? (titular as any).data_inicio : null}
      diasAteInicioServidor={diasAteServidor(dataInicioEfetiva)}
      documentosEnviados={documentosEnviados || 0}
      parcelasPagas={parcelasPagas}
      parcelasTotal={parcelasTotal}
    />
  )
}
