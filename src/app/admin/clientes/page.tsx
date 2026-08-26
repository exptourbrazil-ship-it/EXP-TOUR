import { exigirCapacidade } from "@/lib/admin-guard";
import { carregarClientes } from "@/lib/admin-clientes";
import ClientesClient from "./ClientesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pagina protegida da carteira de clientes. Carrega no servidor (sem waterfall)
// e entrega para o client component, que cuida de busca e filtros.
export default async function AdminClientesPage() {
  await exigirCapacidade("casos.ver", "/admin/clientes");

  let clientes;
  try {
    clientes = await carregarClientes();
  } catch {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-2xl text-brand">Clientes</h1>
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível carregar a carteira de clientes agora. Tente novamente em instantes.
        </p>
      </div>
    );
  }

  return <ClientesClient clientes={clientes} />;
}
