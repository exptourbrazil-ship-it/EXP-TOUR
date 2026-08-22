import { notFound } from "next/navigation";
import { exigirCapacidade } from "@/lib/admin-guard";
import { carregarCaso } from "@/lib/admin-caso";
import CasoClient from "./CasoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Caso 360 (docs/07, Secao 3.2): tudo de um titular numa pagina. FATIA 1,
// somente leitura. Carrega no servidor (service role) e entrega dados planos
// para o client component. Autorizacao por capacidade, nunca por papel direto.
export default async function CasoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await exigirCapacidade("casos.ver", `/admin/clientes/${id}`);

  const caso = await carregarCaso(id);
  if (!caso) notFound();

  return <CasoClient caso={caso} />;
}
