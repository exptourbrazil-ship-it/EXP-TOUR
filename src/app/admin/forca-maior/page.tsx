import { exigirCapacidade } from "@/lib/admin-guard";
import { destinosDisponiveis } from "@/lib/forca-maior-service";
import ForcaMaiorClient from "./ForcaMaiorClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Forca maior coletiva (E8, doc 01 §4). Ferramenta SO-GESTOR (config.gerir):
// aplica em lote, por destino + periodo, a pausa de cobranca (abre E8) e a
// comunicacao padronizada. Sempre com preview do blast radius antes de aplicar.
export default async function ForcaMaiorPage() {
  await exigirCapacidade("config.gerir", "/admin/forca-maior");
  const destinos = await destinosDisponiveis();
  return <ForcaMaiorClient destinos={destinos} />;
}
