import { exigirFornecedor } from "@/lib/fornecedor-guard";
import { getServiceClient } from "@/lib/fornecedor-dados";
import { listarProgramasComIntakes, listarAcomodacoesComPeriodos } from "@/lib/catalog-disponibilidade";
import DisponibilidadeClient from "@/components/DisponibilidadeClient";
import AcomodacaoClient from "@/components/AcomodacaoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disponibilidade (self-service da escola): programas (datas de inicio) e
// acomodacoes (periodos). Publica na hora. Escopado ao supplier da sessao.
export default async function DisponibilidadePage() {
  const sessao = await exigirFornecedor("/fornecedor/disponibilidade");
  const supabase = getServiceClient();
  const [programas, acomodacoes] = await Promise.all([
    listarProgramasComIntakes(supabase, sessao.supplierId),
    listarAcomodacoesComPeriodos(supabase, sessao.supplierId),
  ]);

  return (
    <div>
      <h1 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 26, margin: "0 0 4px" }}>
        Disponibilidade
      </h1>
      <p style={{ color: "#042f1b", opacity: 0.75, fontSize: 14, margin: "0 0 20px" }}>
        Cadastre seus programas (datas de início) e acomodações (períodos) com status e vagas. As alterações valem na hora.
      </p>

      <h2 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 20, margin: "0 0 12px" }}>Programas</h2>
      <DisponibilidadeClient endpoint="/api/fornecedor/disponibilidade" programas={programas} />

      <h2 style={{ fontFamily: "Bellefair, serif", color: "#042f1b", fontSize: 20, margin: "28px 0 12px" }}>Acomodações</h2>
      <AcomodacaoClient endpoint="/api/fornecedor/disponibilidade" acomodacoes={acomodacoes} />
    </div>
  );
}
