import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import { verificarSessao, SESSION_COOKIE } from "@/lib/session"
import InicioClient from "./InicioClient"

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
    .select("id, nome, valor_total, moeda, data_inicio")
    .eq("titular_id", sessao.titularId)
    .order("id", { ascending: false })

  const contrato = (contratos && contratos[0]) || null

  return (
    <InicioClient
      nomeCompleto={titular ? titular.nome_completo : null}
      contrato={contrato}
      dataInicioTitular={titular ? (titular as any).data_inicio : null}
    />
  )
}
