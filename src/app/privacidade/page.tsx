import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { carregarEstadoConsentimentos } from "@/lib/consentimento-service";
import { CATALOGO_CONSENTIMENTOS } from "@/lib/consentimento";
import PrivacidadeClient from "./PrivacidadeClient";

// Pagina do servidor: "Privacidade e consentimentos" (LGPD, Clausulas 15/16).
// Mostra o catalogo de finalidades e o estado VIGENTE por titular. O opt-in de
// imagem e facultativo; nada vem pre-marcado. So o titular autenticado ve/edita
// os proprios consentimentos.
export default async function PrivacidadePage() {
  const cookieStore = await cookies();
  const sessao = verificarSessao(cookieStore.get(SESSION_COOKIE)?.value);
  if (!sessao) redirect("/");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  );

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo")
    .eq("id", sessao.titularId)
    .maybeSingle();

  const estado = await carregarEstadoConsentimentos(supabase, sessao.titularId);
  const politicaUrl = process.env.NEXT_PUBLIC_POLITICA_PRIVACIDADE_URL || null;

  return (
    <PrivacidadeClient
      nomeExibicao={(titular?.nome_completo as string) ?? null}
      catalogo={CATALOGO_CONSENTIMENTOS}
      estado={estado}
      politicaUrl={politicaUrl}
    />
  );
}
