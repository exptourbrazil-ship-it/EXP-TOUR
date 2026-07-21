import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import DocumentosClient from "@/app/parcelas/DocumentosClient";
import BottomNav from "@/components/BottomNav";

// Pagina do servidor (aba Docs): mostra somente os documentos do titular
// autenticado. Separada da aba Financeiro (/parcelas) para que cada aba da
// navegacao inferior exiba apenas o seu proprio conteudo.
export default async function DocumentosPage() {
  const cookieStore = cookies();
  const sessaoToken = cookieStore.get(SESSION_COOKIE)?.value;
  const sessao = verificarSessao(sessaoToken);

  if (!sessao) {
    redirect("/");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: documentos } = await supabase
    .from("documentos")
    .select("*")
    .eq("titular_id", sessao.titularId)
    .order("created_at", { ascending: false });

  return createElement(
    "div",
    { className: "pb-28" },
    createElement(DocumentosClient, { documentos: documentos || [] }),
    createElement(BottomNav)
  );
}
