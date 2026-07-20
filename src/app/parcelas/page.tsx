import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import ParcelasClient from "./ParcelasClient";
import DocumentosClient from "./DocumentosClient";
import BottomNav from "@/components/BottomNav";

// Pagina do servidor: le a sessao autenticada (cookie httpOnly, criado em
// /api/auth/verify-code), busca no Supabase (com a service role, que
// ignora RLS) apenas os contratos e parcelas do titular da sessao, e
// entrega os dados para o componente de cliente ParcelasClient renderizar.
// Isso substitui o antigo parametro "?titular=" inseguro na URL.
export default async function ParcelasPage() {
    const cookieStore = cookies();
    const sessaoToken = cookieStore.get(SESSION_COOKIE)?.value;
    const sessao = verificarSessao(sessaoToken);

  if (!sessao) {
        redirect("/");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: contratos } = await supabase
      .from("contratos")
      .select("id, nome, moeda")
      .eq("titular_id", sessao.titularId);

  const contratoIds = (contratos || []).map((c) => c.id);
    const moedaPorContrato = new Map((contratos || []).map((c) => [c.id, c.moeda]));
    const programaNome = contratos && contratos.length > 0 ? (contratos[0] as any).nome : null;

  let parcelas: any[] = [];

  if (contratoIds.length > 0) {
        const { data } = await supabase
          .from("parcelas")
          .select("*")
          .in("contrato_id", contratoIds)
          .order("numero", { ascending: true });

      parcelas = (data || []).map((p) => ({
              ...p,
              moeda: moedaPorContrato.get(p.contrato_id) || "BRL",
      }));
  }

    const { data: documentos } = await supabase.from("documentos").select("*").eq("titular_id", sessao.titularId).order("created_at", { ascending: false });

  return createElement("div", null, createElement(DocumentosClient, { documentos: documentos || [] }), createElement(ParcelasClient, { parcelas, programaNome }), createElement(BottomNav));
}
