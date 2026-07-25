import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import RetornoClient from "./RetornoClient";

// Pagina do servidor (aba Retorno): reune o fechamento da jornada — o
// certificado de conclusao (quando publicado no cofre), a avaliacao NPS, o
// convite para avaliar no Google e a indicacao via WhatsApp. Le a sessao do
// cliente e busca no Supabase (service role, ignora RLS) os dados necessarios.
export default async function RetornoPage() {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) {
    redirect("/");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo")
    .eq("id", sessao.titularId)
    .maybeSingle();

  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, nome, estudante_nome")
    .eq("titular_id", sessao.titularId)
    .order("id", { ascending: false });
  const contrato = (contratos && contratos[0]) || null;

  // Certificado(s) de conclusao publicados no cofre para este titular.
  const { data: certificados } = await supabase
    .from("documentos")
    .select("id, nome_arquivo, created_at")
    .eq("titular_id", sessao.titularId)
    .eq("tipo_documento", "certificado_conclusao")
    .order("created_at", { ascending: false });

  // Avaliacao NPS ja registrada (para este titular + contrato), se houver.
  const filtroNps = supabase
    .from("nps_respostas")
    .select("nota, comentario")
    .eq("titular_id", sessao.titularId);
  const { data: npsExistente } = contrato
    ? await filtroNps.eq("contrato_id", contrato.id).maybeSingle()
    : await filtroNps.is("contrato_id", null).maybeSingle();

  const googleReviewUrl = process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL || null;
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL || null;

  return (
    <RetornoClient
      nomeCompleto={titular ? titular.nome_completo : null}
      contrato={contrato}
      certificados={certificados || []}
      npsExistente={npsExistente || null}
      googleReviewUrl={googleReviewUrl}
      portalUrl={portalUrl}
    />
  );
}
