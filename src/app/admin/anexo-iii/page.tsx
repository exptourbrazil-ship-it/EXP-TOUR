import { createClient } from "@supabase/supabase-js";
import { exigirAdmin } from "@/lib/admin-guard";
import AnexoIIIClient from "./AnexoIIIClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ContratoOpcao = { id: string; rotulo: string; moeda: string };

// Pagina admin: montar o Anexo III (Politica de Pagamento dos Fornecedores) por
// contrato. Carrega os contratos para o seletor; o client cuida de listar/
// adicionar/remover itens via /api/admin/anexo-iii.
export default async function AdminAnexoIIIPage() {
  await exigirAdmin("/admin/anexo-iii");

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
      rotulo: (c.estudante_nome || c.titular?.nome_completo || "(sem nome)") + (c.nome ? " — " + c.nome : ""),
    }));
  } catch {
    contratos = [];
  }

  return <AnexoIIIClient contratos={contratos} />;
}
