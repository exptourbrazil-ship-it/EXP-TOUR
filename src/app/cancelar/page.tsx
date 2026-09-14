import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { carregarConsequenciasCancelamento } from "@/lib/cancelamento-self-service";
import CancelarClient from "./CancelarClient";

// Pagina do servidor: cancelamento DELIBERADO self-service (spec 1 §3). Le a
// sessao autenticada, resolve o contrato ATIVO do titular e entrega as
// consequencias iniciais ao wizard. A tela NAO cancela nem mexe em dinheiro —
// registra a solicitacao e abre o E4 (via POST /api/cliente/cancelamento).
export default async function CancelarPage() {
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

  // Contrato ativo (nao cancelado) do titular. O portal do cliente hoje opera
  // sobre o contrato mais recente; se houver mais de um, escolhe o mais novo.
  const { data: contratos } = await supabase
    .from("contratos")
    .select("id, estudante_nome")
    .eq("titular_id", sessao.titularId)
    .is("cancelado_em", null)
    .order("id", { ascending: false });

  const contrato = (contratos && contratos[0]) || null;
  // Sem contrato ativo nao ha o que cancelar — volta para o inicio.
  if (!contrato) redirect("/inicio");

  const consequencias = await carregarConsequenciasCancelamento(
    supabase,
    sessao.titularId,
    contrato.id as string,
  );
  // Posse ja verificada no loader; se vier null (contrato sumiu entre queries)
  // trata como sem contrato.
  if (!consequencias) redirect("/inicio");

  const nomeExibicao = (contrato.estudante_nome as string) || (titular?.nome_completo as string) || null;

  return (
    <CancelarClient
      contratoId={contrato.id as string}
      nomeExibicao={nomeExibicao}
      inicial={consequencias}
    />
  );
}
