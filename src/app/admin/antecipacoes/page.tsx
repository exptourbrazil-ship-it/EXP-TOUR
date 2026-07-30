import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/admin-guard";
import AntecipacoesClient from "./AntecipacoesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ContratoOpcao = {
  id: string;
  rotulo: string; // "Estudante / Titular" para o seletor
  moeda: string;
};

// Pagina admin: registrar antecipacoes por exigencia de visto/fornecedor
// (Clausula 7.5) e acompanhar o status. Carrega os contratos para o seletor;
// o client cuida de criar/listar/atualizar via /api/admin/antecipacoes.
export default async function AdminAntecipacoesPage() {
  await exigirAdmin("/admin/antecipacoes");

  let contratos: ContratoOpcao[] = [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );
    const { data } = await supabase
      .from("contratos")
      .select("id, nome, moeda, estudante_nome, titular:titulares(nome_completo)")
      .order("created_at", { ascending: false });
    contratos = (data || []).map((c: any) => ({
      id: c.id,
      moeda: c.moeda || "",
      rotulo:
        (c.estudante_nome || c.titular?.nome_completo || "(sem nome)") +
        (c.nome ? " — " + c.nome : ""),
    }));
  } catch {
    contratos = [];
  }

  return <AntecipacoesClient contratos={contratos} />;
}
