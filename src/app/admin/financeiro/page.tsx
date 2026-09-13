import { createClient } from "@supabase/supabase-js";
import { exigirCapacidade } from "@/lib/admin-guard";
import { carregarFinanceiro } from "@/lib/admin-financeiro";
import { contratoIdsDoEscopoAtual } from "@/lib/admin-tenant";
import FinanceiroClient from "./FinanceiroClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida do Financeiro. Carrega os dados no servidor (sem waterfall
// de fetch no cliente) e entrega para o client component, que cuida dos
// filtros e da tabela.
export default async function AdminFinanceiroPage() {
  await exigirCapacidade("financeiro.ver", "/admin/financeiro");

  let dados;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    );
    dados = await carregarFinanceiro(await contratoIdsDoEscopoAtual(supabase));
  } catch {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl text-brand">Financeiro</h1>
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar os dados financeiros agora. Tente novamente em instantes.
        </p>
      </div>
    );
  }

  return <FinanceiroClient dados={dados} />;
}
