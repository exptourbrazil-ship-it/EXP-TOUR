import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import DocumentosClient from "@/app/parcelas/DocumentosClient";
import BottomNav from "@/components/BottomNav";
import Cabecalho from "@/components/Cabecalho";
import SuporteRodape from "@/components/SuporteRodape";

// Pagina do servidor (aba Docs): mostra somente os documentos do titular
// autenticado. Separada da aba Financeiro (/parcelas) para que cada aba da
// navegacao inferior exiba apenas o seu proprio conteudo.
export default async function DocumentosPage() {
  const cookieStore = await cookies();
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

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo")
    .eq("id", sessao.titularId)
    .maybeSingle();

  const { data: contratoNome } = await supabase
    .from("contratos")
    .select("estudante_nome")
    .eq("titular_id", sessao.titularId)
    .limit(1)
    .maybeSingle();

  const nomeCliente =
    (contratoNome && (contratoNome as any).estudante_nome) || (titular && titular.nome_completo) || null;

  const afiliadoVistoUrl = process.env.NEXT_PUBLIC_AFILIADO_VISTO_URL || null;

  return createElement(
    "div",
    { className: "min-h-screen bg-brand-cream/40 pb-28" },
    createElement(Cabecalho, { nome: nomeCliente, subtitulo: "Documentos" }),
    createElement(
      "main",
      { className: "mx-auto w-full max-w-md px-5 py-2 md:max-w-2xl md:px-8 lg:max-w-5xl" },
      createElement("h1", { className: "font-serif text-4xl text-brand md:text-5xl" }, "Documentos"),
      createElement(
        "p",
        { className: "mt-2 mb-4 text-sm text-neutral-600" },
        "Seu cofre de documentos. Envie os seus e acompanhe o status de cada um — os itens também aparecem no checklist de Embarque."
      ),
      createElement(DocumentosClient, { documentos: documentos || [], afiliadoVistoUrl })
    ),
    createElement(SuporteRodape, { contexto: "Dúvida sobre um documento, passaporte ou visto? Fale com a gente." }),
    createElement(BottomNav)
  );
}
