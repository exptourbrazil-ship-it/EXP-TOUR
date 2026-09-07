import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { podeAdmin } from "@/lib/admin-roles";
import DataInicioClient from "./DataInicioClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type TitularDataInicioAdmin = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  data_inicio: string | null;
};

// Pagina protegida: define manualmente a data de inicio do curso de um titular
// (inclusive de clientes sem contrato). Carrega no servidor (service role) e
// entrega a lista pronta; o salvamento continua via POST na rota
// /api/admin/data-inicio (gated por casos.gerir). A LEITURA e gateada por
// capacidade (casos.ver); a UI espelha o RBAC (Salvar so com casos.gerir).
export default async function AdminDataInicioPage() {
  const { papel } = await exigirCapacidade("casos.ver", "/admin/data-inicio");
  const podeGerir = podeAdmin(papel, "casos.gerir");

  let titulares: TitularDataInicioAdmin[] = [];
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string
    );
    const { data } = await supabase
      .from("titulares")
      .select("id, nome_completo, email, data_inicio")
      .order("nome_completo", { ascending: true });
    titulares = (data || []) as TitularDataInicioAdmin[];
  } catch (err) {
    // Fail-safe de exibicao: renderiza vazio, mas loga sem PII para a falha nao
    // passar despercebida (a lista some, nao trava a pagina).
    console.warn("[admin/data-inicio] falha ao carregar titulares:", err instanceof Error ? err.message : err);
    titulares = [];
  }

  return <DataInicioClient titulares={titulares} podeGerir={podeGerir} />;
}
