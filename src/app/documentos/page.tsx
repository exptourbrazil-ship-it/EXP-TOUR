import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import Link from "next/link";
import { verificarSessao, SESSION_COOKIE } from "@/lib/session";
import { listarContratosDoTitular } from "@/lib/documento-integral-service";
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

  // O cofre do titular NAO mostra documentos enviados pela escola (origem
  // 'fornecedor'): sao internos do fluxo EXP Tour <-> instituicao e o titular
  // nem consegue baixa-los. Ficam so no admin e no Portal do Fornecedor.
  const { data: documentos } = await supabase
    .from("documentos")
    .select("*")
    .eq("titular_id", sessao.titularId)
    .neq("origem", "fornecedor")
    .order("created_at", { ascending: false });

  const { data: titular } = await supabase
    .from("titulares")
    .select("nome_completo")
    .eq("id", sessao.titularId)
    .maybeSingle();

  const { data: contratoNome } = await supabase
    .from("contratos")
    .select("estudante_nome")
    .is("cancelado_em", null)
    .eq("titular_id", sessao.titularId)
    .limit(1)
    .maybeSingle();

  const nomeCliente =
    (contratoNome && (contratoNome as any).estudante_nome) || (titular && titular.nome_completo) || null;

  // Vias integrais do contrato (Clausula 17.3): um link por contrato do titular.
  const contratos = await listarContratosDoTitular(supabase, sessao.titularId);

  const afiliadoVistoUrl = process.env.NEXT_PUBLIC_AFILIADO_VISTO_URL || null;

  return createElement(
    "div",
    { className: "min-h-screen bg-brand-cream/40 pb-28 lg:pb-10 lg:pl-60" },
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
      contratos.length > 0 &&
        createElement(
          "section",
          { className: "mb-6 rounded-2xl border border-brand/15 bg-white p-4 shadow-sm" },
          createElement("h2", { className: "font-serif text-xl text-brand" }, "Contrato — via integral"),
          createElement(
            "p",
            { className: "mt-1 mb-3 text-sm text-neutral-600" },
            "Sua via completa (Condições Gerais + Quadro Resumo + Anexos + prova do aceite), para consultar, baixar ou imprimir."
          ),
          createElement(
            "ul",
            { className: "divide-y divide-neutral-100" },
            ...contratos.map((c) =>
              createElement(
                "li",
                { key: c.id, className: "flex items-center justify-between gap-3 py-2" },
                createElement(
                  "span",
                  { className: "text-sm text-neutral-800" },
                  c.nome,
                  c.canceladoEm
                    ? createElement("span", { className: "ml-2 text-xs text-neutral-400" }, "(cancelado)")
                    : null
                ),
                createElement(
                  "div",
                  { className: "flex shrink-0 items-center gap-2" },
                  createElement(
                    Link,
                    {
                      href: `/ficha/${c.id}`,
                      className:
                        "rounded-full border border-brand/30 px-3 py-1 text-xs font-medium text-brand hover:bg-brand/5",
                    },
                    "Ficha de matrícula"
                  ),
                  createElement(
                    Link,
                    {
                      href: `/contrato/${c.id}`,
                      className:
                        "rounded-full border border-brand/30 px-3 py-1 text-xs font-medium text-brand hover:bg-brand/5",
                    },
                    "Abrir via integral"
                  )
                )
              )
            )
          )
        ),
      createElement(DocumentosClient, { documentos: documentos || [], afiliadoVistoUrl }),
      createElement(
        "section",
        { className: "mt-6 rounded-2xl border border-brand/15 bg-white p-4 shadow-sm" },
        createElement("h2", { className: "font-serif text-xl text-brand" }, "Privacidade e consentimentos"),
        createElement(
          "p",
          { className: "mt-1 mb-3 text-sm text-neutral-600" },
          "Gerencie como seus dados são usados — saúde, imagem e compartilhamento. Você pode autorizar ou revogar a qualquer momento."
        ),
        createElement(
          Link,
          {
            href: "/privacidade",
            className: "inline-block rounded-full border border-brand/30 px-4 py-2 text-sm font-medium text-brand hover:bg-brand/5",
          },
          "Gerenciar consentimentos"
        )
      )
    ),
    createElement(SuporteRodape, { contexto: "Dúvida sobre um documento, passaporte ou visto? Fale com a gente." }),
    createElement(BottomNav)
  );
}
