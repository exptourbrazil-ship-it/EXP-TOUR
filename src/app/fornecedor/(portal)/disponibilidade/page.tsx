import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProgramasComIntakes } from "@/lib/catalog-disponibilidade";
import DisponibilidadeClient from "@/components/DisponibilidadeClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disponibilidade (self-service da escola): programas + datas de inicio com
// status/capacidade. Publica na hora. Escopado ao supplier da sessao.
export default async function DisponibilidadePage() {
  const sessao = await exigirFornecedor("/fornecedor/disponibilidade");
  const supabase = getServiceClient();
  const programas = await listarProgramasComIntakes(supabase, sessao.supplierId);

  return (
    <div>
      <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 26, margin: "0 0 4px" }}>
        Disponibilidade
      </h1>
      <p style={{ color: "#042f1b", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Cadastre seus programas e as datas de início com status e vagas. As alterações valem na hora.
      </p>

      <DisponibilidadeClient endpoint="/api/fornecedor/disponibilidade" programas={programas} />
    </div>
  );
}
