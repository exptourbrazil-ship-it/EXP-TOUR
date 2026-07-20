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
              .select("id, nome, moeda, valor_total")
      .eq("titular_id", sessao.titularId);

  const contratoIds = (contratos || []).map((c) => c.id);
    const moedaPorContrato = new Map((contratos || []).map((c) => [c.id, c.moeda]));
    const programaNome = contratos && contratos.length > 0 ? (contratos[0] as any).nome : null;
    const totalPrograma = contratos && contratos.length > 0 ? contratos.reduce((soma, c) => soma + Number((c as any).valor_total || 0), 0) : 0;

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

    const moedasUnicas = Array.from(new Set(parcelas.map((p) => p.moeda).filter((m) => m && m !== "BRL")));
    const cotacoesPorMoeda = new Map<string, number>();

    if (moedasUnicas.length > 0) {
        const hojeISO = new Date().toISOString().slice(0, 10);
        for (const moeda of moedasUnicas) {
            const { data: cotacao } = await supabase
            .from("cotacoes_cambio")
            .select("cotacao_vet")
            .eq("moeda", moeda)
            .lte("data", hojeISO)
            .order("data", { ascending: false })
            .limit(1)
            .maybeSingle();

            if (cotacao) {
                cotacoesPorMoeda.set(moeda, Number(cotacao.cotacao_vet));
            }
        }
    }

    const taxaAdministrativa = Number(process.env.TAXA_ADMINISTRATIVA_CAMBIO_BRL || "4.99");

    parcelas = parcelas.map((p) => {
        const cotacaoEstimada = cotacoesPorMoeda.get(p.moeda) || null;
        const valorEstimadoBRL = cotacaoEstimada
        ? Math.round((Number(p.valor_original) * cotacaoEstimada + taxaAdministrativa) * 100) / 100
            : null;
        return { ...p, cotacaoEstimada, valorEstimadoBRL };
    });

    const pagoAteAgora = parcelas.filter((p) => p.status === "pago").reduce((soma, p) => soma + Number(p.valor_original || 0), 0);

    const { data: documentos } = await supabase.from("documentos").select("*").eq("titular_id", sessao.titularId).order("created_at", { ascending: false });

      return createElement("div", null, createElement(DocumentosClient, { documentos: documentos || [] }), createElement(ParcelasClient, { parcelas, programaNome, totalPrograma, pagoAteAgora }), createElement(BottomNav));
}
