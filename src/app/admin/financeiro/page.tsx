import { exigirAdmin } from "@/lib/admin-guard";
import { carregarFinanceiro } from "@/lib/admin-financeiro";
import FinanceiroClient from "./FinanceiroClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida do Financeiro. Carrega os dados no servidor (sem waterfall
// de fetch no cliente) e entrega para o client component, que cuida dos
// filtros e da tabela.
export default async function AdminFinanceiroPage() {
  await exigirAdmin("/admin/financeiro");

  let dados;
  try {
    dados = await carregarFinanceiro();
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
